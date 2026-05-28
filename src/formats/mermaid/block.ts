import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  escapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface BlockNodeData {
  span?: number;
}

export interface BlockEdgeData {
  // TODO: block diagram edge types follow flowchart patterns
  // but the spec is still evolving — minimal support for now
}

export interface BlockGraphData {
  diagramType: 'block';
  columns?: number;
}

export type MermaidBlockGraph = Graph<BlockNodeData, BlockEdgeData, BlockGraphData>;
type BlockNode = GraphNode<BlockNodeData>;

// --- Parser ---

// Block shape patterns (subset of flowchart)
const BLOCK_SHAPES: [string, string, string][] = [
  ['((', '))', 'circle'],
  ['(', ')', 'rounded'],
  ['{{', '}}', 'hexagon'],
  ['{', '}', 'diamond'],
  ['[[', ']]', 'subroutine'],
  ['[', ']', 'rectangle'],
];

function parseBlockNode(text: string): { id: string; label: string; shape?: string } | null {
  for (const [opener, closer, shapeName] of BLOCK_SHAPES) {
    const idx = text.indexOf(opener);
    if (idx < 0) continue;
    const id = text.slice(0, idx).trim();
    if (!id) continue;
    if (!text.endsWith(closer)) continue;
    const label = text.slice(idx + opener.length, text.length - closer.length).trim();
    return { id, label, shape: shapeName };
  }
  if (/^[a-zA-Z_][\w]*$/.test(text.trim())) {
    return { id: text.trim(), label: '', shape: undefined };
  }
  return null;
}

/**
 * Parses a Mermaid block diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidBlock(`
 * block-beta
 *     columns 2
 *     a["Task A"] b["Task B"]
 *     a --> b
 * `);
 */
export function fromMermaidBlock(input: string): MermaidBlockGraph {
  validateInput(input, 'Mermaid block');
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('block-beta')) {
    throw new Error('Mermaid block: expected "block-beta" header');
  }

  const nodeMap = new Map<string, BlockNode>();
  const edges: GraphEdge<BlockEdgeData>[] = [];
  let edgeCounter = 0;
  let columns: number | undefined;

  // Parent stack for nested blocks
  const parentStack: (string | null)[] = [null];
  let blockCounter = 0;

  function ensureNode(id: string, label?: string, shape?: string): BlockNode {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: parentStack[parentStack.length - 1],
        initialNodeId: null,
        label: label ?? id,
        data: {},
        ...(shape && { shape }),
      });
    }
    return nodeMap.get(id)!;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // columns N
    const colsMatch = line.match(/^columns\s+(\d+)\s*$/);
    if (colsMatch) {
      columns = parseInt(colsMatch[1], 10);
      continue;
    }

    // block (anonymous nested)
    if (line === 'block' || line.startsWith('block:')) {
      const blockId = line.includes(':')
        ? line.split(':')[1].trim()
        : `__block_${blockCounter++}`;
      ensureNode(blockId);
      parentStack.push(blockId);
      continue;
    }

    if (line === 'end') {
      if (parentStack.length > 1) parentStack.pop();
      continue;
    }

    // Edge: A --> B
    const edgeMatch = line.match(/^(\S+)\s*(-->|---|==>|-\.->)\s*(\S+)\s*$/);
    if (edgeMatch) {
      const sourceId = edgeMatch[1];
      const targetId = edgeMatch[3];
      ensureNode(sourceId);
      ensureNode(targetId);
      const edgeId = generateEdgeId(sourceId, targetId, edgeCounter++);
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: '',
        data: {},
      });
      continue;
    }

    // Node with span: id["label"]:N
    const spanMatch = line.match(/^(\S+?)(?:\["([^"]*)"\])?:(\d+)\s*$/);
    if (spanMatch) {
      const id = spanMatch[1];
      const label = spanMatch[2] ?? id;
      const span = parseInt(spanMatch[3], 10);
      const node = ensureNode(id, label);
      if (node.data) node.data.span = span;
      continue;
    }

    // Space-separated node declarations on one line
    // (block-beta allows `a b c` on one line to declare multiple nodes)
    const parts = line.split(/\s+/);
    let consumed = false;
    for (const part of parts) {
      const parsed = parseBlockNode(part);
      if (parsed) {
        ensureNode(parsed.id, parsed.label, parsed.shape);
        consumed = true;
      }
    }
    if (consumed) continue;

    // Single node declaration with shape
    const nodeDecl = parseBlockNode(line);
    if (nodeDecl) {
      ensureNode(nodeDecl.id, nodeDecl.label, nodeDecl.shape);
    }
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: {
      diagramType: 'block',
      ...(columns !== undefined && { columns }),
    },
  };
}

// --- Serializer ---

/**
 * Converts a block diagram Graph to a Mermaid block diagram string.
 *
 * @example
 * const mermaid = toMermaidBlock(graph);
 * // "block-beta\n    columns 2\n    a[\"Task A\"]\n    ..."
 */
export function toMermaidBlock(graph: MermaidBlockGraph): string {
  const lines: string[] = ['block-beta'];

  if (graph.data?.columns) {
    lines.push(`    columns ${graph.data.columns}`);
  }

  // Build children map
  const childrenMap = new Map<string | null, BlockNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  const isParent = new Set<string>();
  for (const node of graph.nodes) {
    if (childrenMap.has(node.id)) isParent.add(node.id);
  }

  function writeNodes(parentId: string | null, indent: string) {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      if (isParent.has(child.id)) {
        lines.push(`${indent}block:${child.id}`);
        writeNodes(child.id, indent + '    ');
        lines.push(`${indent}end`);
      } else {
        const label = child.label && child.label !== child.id
          ? `["${escapeMermaidLabel(child.label)}"]`
          : '';
        const span = child.data?.span ? `:${child.data.span}` : '';
        lines.push(`${indent}${child.id}${label}${span}`);
      }
    }
  }

  writeNodes(null, '    ');

  // Emit edges
  for (const edge of graph.edges) {
    lines.push(`    ${edge.sourceId} --> ${edge.targetId}`);
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid block diagram format.
 *
 * @example
 * const graph = mermaidBlockConverter.from(`
 * block-beta
 *     columns 2
 *     a b
 * `);
 * const str = mermaidBlockConverter.to(graph);
 */
export const mermaidBlockConverter: GraphFormatConverter<
  string, BlockNodeData, BlockEdgeData, BlockGraphData
> = createFormatConverter(toMermaidBlock, fromMermaidBlock);
