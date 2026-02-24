import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  escapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface MindmapNodeData {
  // TODO: ::icon() syntax stored but not rendered
  icon?: string;
}

export interface MindmapEdgeData {}

export interface MindmapGraphData {
  diagramType: 'mindmap';
}

type MindmapGraph = Graph<MindmapNodeData, MindmapEdgeData, MindmapGraphData>;
type MindmapNode = GraphNode<MindmapNodeData>;

// --- Shape parsing (same bracket syntax as flowchart) ---

const SHAPE_PATTERNS: [string, string, string][] = [
  ['(((', ')))', 'double-circle'],
  ['((', '))', 'circle'],
  ['([', '])', 'stadium'],
  ['{{', '}}', 'hexagon'],
  ['(', ')', 'rounded'],
  ['[', ']', 'rectangle'],
];

const SHAPE_TO_BRACKETS: Record<string, [string, string]> = {};
for (const [opener, closer, name] of SHAPE_PATTERNS) {
  SHAPE_TO_BRACKETS[name] = [opener, closer];
}

function parseNodeText(text: string): { label: string; shape?: string } {
  for (const [opener, closer, shapeName] of SHAPE_PATTERNS) {
    if (text.startsWith(opener) && text.endsWith(closer)) {
      return {
        label: text.slice(opener.length, text.length - closer.length).trim(),
        shape: shapeName,
      };
    }
  }
  // Bare text — default shape
  return { label: text.trim() };
}

// --- Parser ---

/**
 * Parses a Mermaid mindmap string into a Graph.
 *
 * @example
 * const graph = fromMermaidMindmap(`
 * mindmap
 *   Root
 *     Child A
 *       Grandchild
 *     Child B
 * `);
 */
export function fromMermaidMindmap(input: string): MindmapGraph {
  validateInput(input, 'Mermaid mindmap');
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('mindmap')) {
    throw new Error('Mermaid mindmap: expected "mindmap" header');
  }

  const nodeMap = new Map<string, MindmapNode>();
  const edges: GraphEdge<MindmapEdgeData>[] = [];
  let nodeCounter = 0;
  let edgeCounter = 0;

  // Stack of (nodeId, indentLevel) to track hierarchy
  const stack: { id: string; indent: number }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    // Measure indentation (spaces)
    const indent = rawLine.length - rawLine.trimStart().length;
    const content = rawLine.trim();

    // TODO: ::icon(fa fa-book) — parse and store in nodeData.icon
    let icon: string | undefined;
    let cleanContent = content;
    const iconMatch = content.match(/::icon\(([^)]+)\)/);
    if (iconMatch) {
      icon = iconMatch[1];
      cleanContent = content.replace(/::icon\([^)]+\)/, '').trim();
    }

    const { label, shape } = parseNodeText(cleanContent);
    const id = `mm_${nodeCounter++}`;

    const node: MindmapNode = {
      type: 'node',
      id,
      parentId: null,
      initialNodeId: null,
      label,
      data: {
        ...(icon && { icon }),
      },
      ...(shape && { shape }),
    };

    // Find parent: pop stack until we find a node with less indentation
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      node.parentId = parent.id;

      // Auto-create parent → child edge
      const edgeId = generateEdgeId(parent.id, id, edgeCounter++);
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId: parent.id,
        targetId: id,
        label: '',
        data: {},
      });
    }

    nodeMap.set(id, node);
    stack.push({ id, indent });
  }

  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'mindmap' },
  };
}

// --- Serializer ---

/**
 * Converts a mindmap Graph to a Mermaid mindmap string.
 *
 * @example
 * const mermaid = toMermaidMindmap(graph);
 * // "mindmap\n  Root\n    Child A\n    ..."
 */
export function toMermaidMindmap(graph: MindmapGraph): string {
  const lines: string[] = ['mindmap'];

  // Build children map
  const childrenMap = new Map<string | null, MindmapNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  function writeNode(nodeId: string | null, depth: number) {
    const children = childrenMap.get(nodeId) ?? [];
    for (const child of children) {
      const indent = '  '.repeat(depth + 1);
      const shape = (child as any).shape;
      const brackets = shape ? SHAPE_TO_BRACKETS[shape] : undefined;
      const label = escapeMermaidLabel(child.label);
      const text = brackets
        ? `${brackets[0]}${label}${brackets[1]}`
        : label;

      let extra = '';
      if (child.data?.icon) {
        extra = `\n${'  '.repeat(depth + 2)}::icon(${child.data.icon})`;
      }

      lines.push(`${indent}${text}${extra}`);
      writeNode(child.id, depth + 1);
    }
  }

  writeNode(null, 0);

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid mindmap format.
 *
 * @example
 * const graph = mermaidMindmapConverter.from(`
 * mindmap
 *   Root
 *     Branch
 * `);
 * const str = mermaidMindmapConverter.to(graph);
 */
export const mermaidMindmapConverter: GraphFormatConverter<string> =
  createFormatConverter(
    toMermaidMindmap as (graph: Graph) => string,
    fromMermaidMindmap,
  );
