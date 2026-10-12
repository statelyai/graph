import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  getMermaidPreamble,
  type MermaidSourceData,
  escapeMermaidLabel,
  unescapeMermaidLabel,
  escapeMermaidId,
  unescapeMermaidId,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface MindmapNodeData {
  authoredId?: boolean;
  classes?: string[];
  /**
   * Icon class from `::icon(fa fa-book)` syntax (stores the inner text, e.g.
   * `"fa fa-book"`). Parsed and re-emitted on its own indented line.
   */
  icon?: string;
}

export interface MindmapEdgeData {}

export interface MindmapGraphData extends MermaidSourceData {
  diagramType: 'mindmap';
}

export type MermaidMindmapGraph = Graph<MindmapNodeData, MindmapEdgeData, MindmapGraphData>;
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

function parseNodeText(text: string): { id?: string; label: string; shape?: string } {
  for (const [opener, closer, shapeName] of SHAPE_PATTERNS) {
    const index = text.indexOf(opener);
    if (index >= 0 && text.endsWith(closer)) {
      return {
        ...(index > 0 && { id: unescapeMermaidId(text.slice(0, index).trim()) }),
        label: unescapeMermaidLabel(text.slice(index + opener.length, text.length - closer.length).trim().replace(/^"([\s\S]*)"$/, '$1')),
        shape: shapeName,
      };
    }
  }
  // Bare text — default shape
  return { label: unescapeMermaidLabel(text.trim()) };
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
export function fromMermaidMindmap(input: string): MermaidMindmapGraph {
  validateInput(input, 'Mermaid mindmap');
  const { lines, source } = prepareLines(input);

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
    const classMatch = content.match(/^:::([\w ,-]+)$/);
    if (classMatch && stack.length) {
      nodeMap.get(stack[stack.length - 1].id)!.data.classes = classMatch[1].split(/[\s,]+/).filter(Boolean);
      continue;
    }

    // ::icon(fa fa-book) — parse and store in nodeData.icon
    let icon: string | undefined;
    let cleanContent = content;
    const iconMatch = content.match(/::icon\(([^)]+)\)/);
    if (iconMatch) {
      icon = iconMatch[1];
      cleanContent = content.replace(/::icon\([^)]+\)/, '').trim();
    }

    // A standalone `::icon(...)` line (Mermaid's canonical placement, on its own
    // indented line under the node) decorates the most recent node rather than
    // creating a new one.
    if (icon && cleanContent === '' && stack.length > 0) {
      const owner = nodeMap.get(stack[stack.length - 1].id);
      if (owner) owner.data.icon = icon;
      continue;
    }

    const parsed = parseNodeText(cleanContent);
    const { label, shape } = parsed;
    let id = parsed.id ?? `mm_${nodeCounter++}`;
    while (nodeMap.has(id) && !parsed.id) id = `mm_${nodeCounter++}`;

    const node: MindmapNode = {
      type: 'node',
      id,
      parentId: null,
      initialNodeId: null,
      label,
      data: {
        ...(parsed.id && { authoredId: true }),
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
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'mindmap', ...(source && { source }) },
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
export function toMermaidMindmap(graph: MermaidMindmapGraph): string {
  const lines: string[] = [...getMermaidPreamble(graph.data ?? {}), 'mindmap'];

  // Build children map
  const childrenMap = new Map<string | null, MindmapNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  const stack: Array<{ node: MindmapNode; depth: number }> = (childrenMap.get(null) ?? []).slice().reverse().map((node) => ({ node, depth: 0 }));
  while (stack.length) {
    const { node: child, depth } = stack.pop()!;
    const nodeIndent = '  '.repeat(depth + 1);
    const brackets = child.shape ? SHAPE_TO_BRACKETS[child.shape] : undefined;
    const label = escapeMermaidLabel(child.label ?? child.id);
    const named = child.data?.authoredId || !/^mm_\d+$/.test(child.id);
    const text = brackets
      ? `${named ? escapeMermaidId(child.id) : ''}${brackets[0]}${label}${brackets[1]}`
      : named ? `${escapeMermaidId(child.id)}[${label}]` : label;
    lines.push(`${nodeIndent}${text}`);
    if (child.data?.icon) lines.push(`${'  '.repeat(depth + 2)}::icon(${child.data.icon})`);
    if (child.data?.classes?.length) lines.push(`${'  '.repeat(depth + 2)}:::${child.data.classes.join(' ')}`);
    for (const node of (childrenMap.get(child.id) ?? []).slice().reverse()) stack.push({ node, depth: depth + 1 });
  }

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
export const mermaidMindmapConverter: GraphFormatConverter<
  string, MindmapNodeData, MindmapEdgeData, MindmapGraphData
> = createFormatConverter(toMermaidMindmap, fromMermaidMindmap);
