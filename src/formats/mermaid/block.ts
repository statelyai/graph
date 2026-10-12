import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';
import {
  validateInput,
  prepareLines,
  getMermaidPreamble,
  type MermaidSourceData,
  getMermaidTokens,
  escapeMermaidLabel,
  unescapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface BlockNodeData {
  span?: number;
  columns?: number;
}

export interface BlockEdgeData {
  /**
   * Stroke style of the connector, mapped from the arrow token.
   * `'thick'` ← `==>`, `'dotted'` ← `-.->`, otherwise `'normal'`.
   */
  stroke?: 'normal' | 'thick' | 'dotted';
  /** `'arrow'` when the connector has an arrowhead (`-->`), `'none'` for `---`. */
  arrowType?: 'arrow' | 'none';
  /**
   * The original arrow token (e.g. `-->`, `-.->`), preserved so emit is exact
   * even when the mapping to stroke/arrowType is approximate.
   */
  arrowToken?: string;
}

export interface BlockGraphData extends MermaidSourceData {
  diagramType: 'block';
  columns?: number;
}

export type MermaidBlockGraph = Graph<BlockNodeData, BlockEdgeData, BlockGraphData>;
type BlockNode = GraphNode<BlockNodeData>;

// --- Parser ---

// Block shape patterns (subset of flowchart)
const BLOCK_SHAPES: [string, string, string][] = [
  ['((', '))', 'circle'],
  ['([', '])', 'stadium'],
  ['[(', ')]', 'cylinder'],
  ['(', ')', 'rounded'],
  ['{{', '}}', 'hexagon'],
  ['{', '}', 'diamond'],
  ['[[', ']]', 'subroutine'],
  ['[', ']', 'rectangle'],
];

function parseBlockNode(text: string): { id: string; label: string; shape?: string; span?: number } | null {
  const spanMatch = text.match(/:(\d+)$/);
  const span = spanMatch ? Number(spanMatch[1]) : undefined;
  if (spanMatch) text = text.slice(0, spanMatch.index);
  for (const [opener, closer, shapeName] of BLOCK_SHAPES) {
    const idx = text.indexOf(opener);
    if (idx < 0) continue;
    const id = text.slice(0, idx).trim();
    if (!/^[\p{L}\p{N}_-]+$/u.test(id)) continue;
    if (!text.endsWith(closer)) continue;
    const label = text.slice(idx + opener.length, text.length - closer.length).trim();
    return { id, label: unescapeMermaidLabel(label.replace(/^"([\s\S]*)"$/, '$1')), shape: shapeName, ...(span !== undefined && { span }) };
  }
  if (/^[a-zA-Z_][\w]*$/.test(text.trim())) {
    return { id: text.trim(), label: '', shape: undefined, ...(span !== undefined && { span }) };
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
  const prepared = prepareLines(input);
  const { lines } = prepared;
  let source = prepared.source;

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
    const styleMatch = line.match(/^style\s+(\S+)\s+(.+)$/);
    if (styleMatch) {
      const style: Record<string, string> = Object.create(null);
      for (const property of styleMatch[2].split(',')) {
        const index = property.indexOf(':');
        if (index >= 0) style[property.slice(0, index).trim()] = property.slice(index + 1).trim();
      }
      ensureNode(styleMatch[1]).style = style;
      continue;
    }
    if (/^(?:columns\s+(?!\d)|classDef\s|class\s|space(?:\s|:|$))/.test(line)) {
      ((source ??= {}).unknownStatements ??= []).push(line);
      continue;
    }

    // columns N
    const colsMatch = line.match(/^columns\s+(\d+)\s*$/);
    if (colsMatch) {
      const parentId = parentStack[parentStack.length - 1];
      if (parentId) nodeMap.get(parentId)!.data.columns = Number(colsMatch[1]);
      else columns = Number(colsMatch[1]);
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

    // Edge: A --> B, A --- B, A ==> B, A -.-> B, optionally with a pipe label:
    // A -->|label| B
    const edgeMatch = line.match(
      /^(\S+)\s*(<-->|-->|---|==>|-\.->)\s*(?:\|([^|]*)\|\s*)?(\S+)\s*$/,
    );
    if (edgeMatch) {
      const sourceId = edgeMatch[1];
      const token = edgeMatch[2];
      const label = edgeMatch[3]?.trim() ?? '';
      const targetId = edgeMatch[4];
      ensureNode(sourceId);
      ensureNode(targetId);
      const edgeId = generateEdgeId(sourceId, targetId, edgeCounter++);
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: label ? unescapeMermaidLabel(label) : '',
        mode: token === '---' ? 'undirected' : token === '<-->' ? 'bidirectional' : 'directed',
        data: {
          stroke:
            token === '==>' ? 'thick' : token === '-.->' ? 'dotted' : 'normal',
          arrowType: token === '---' ? 'none' : 'arrow',
          arrowToken: token,
        },
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
    const parts = getMermaidTokens(line, ' ', false);
    let consumed = false;
    for (const part of parts) {
      const parsed = parseBlockNode(part);
      if (parsed) {
        ensureNode(parsed.id, parsed.label, parsed.shape);
        if (parsed.span !== undefined) nodeMap.get(parsed.id)!.data.span = parsed.span;
        consumed = true;
      }
    }
    if (consumed) continue;

    // Single node declaration with shape
    const nodeDecl = parseBlockNode(line);
    if (nodeDecl) {
      ensureNode(nodeDecl.id, nodeDecl.label, nodeDecl.shape);
      if (nodeDecl.span !== undefined) nodeMap.get(nodeDecl.id)!.data.span = nodeDecl.span;
    } else {
      ((source ??= {}).unknownStatements ??= []).push(line);
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
      ...(source && { source }),
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
  const lines: string[] = [...getMermaidPreamble(graph.data ?? {}), 'block-beta'];

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

  const stack: Array<{ node?: BlockNode; indent: string }> = (childrenMap.get(null) ?? []).slice().reverse().map((node) => ({ node, indent: '    ' }));
  while (stack.length) {
    const { node: child, indent } = stack.pop()!;
    if (!child) { lines.push(`${indent}end`); continue; }
    if (isParent.has(child.id)) {
      lines.push(`${indent}block:${child.id}`);
      if (child.data?.columns !== undefined) lines.push(`${indent}    columns ${child.data.columns}`);
      stack.push({ indent });
      for (const node of (childrenMap.get(child.id) ?? []).slice().reverse()) stack.push({ node, indent: indent + '    ' });
    } else {
      const shape = BLOCK_SHAPES.find((entry) => entry[2] === child.shape) ?? ['[', ']', 'rectangle'];
      const label = child.label && (child.label !== child.id || child.shape)
        ? `${shape[0]}"${escapeMermaidLabel(child.label)}"${shape[1]}` : '';
      const span = child.data?.span ? `:${child.data.span}` : '';
      lines.push(`${indent}${child.id}${label}${span}`);
    }
  }

  for (const node of graph.nodes) {
    if (node.style) lines.push(`    style ${node.id} ${Object.entries(node.style).map(([key, value]) => `${key}:${value}`).join(',')}`);
  }

  // Emit edges. Prefer the preserved original token so approximate mappings
  // round-trip exactly; otherwise derive from stroke/arrowType.
  for (const edge of graph.edges) {
    const d = edge.data;
    let arrow = d?.arrowToken;
    const mode = edge.mode ?? (graph.mode !== 'directed' ? getEdgeMode(graph, edge) : d?.arrowToken === '---' || d?.arrowType === 'none' ? 'undirected'
      : d?.arrowToken === '<-->' ? 'bidirectional' : getEdgeMode(graph, edge));
    const tokenMode = arrow === '---' ? 'undirected' : arrow === '<-->' ? 'bidirectional' : 'directed';
    if (arrow && tokenMode !== mode) arrow = undefined;
    if (!arrow) {
      if (mode === 'undirected') arrow = '---';
      else if (mode === 'bidirectional') arrow = '<-->';
      else if (d?.stroke === 'thick') arrow = '==>';
      else if (d?.stroke === 'dotted') arrow = '-.->';
      else arrow = d?.arrowType === 'none' ? '---' : '-->';
    }
    const label = edge.label ? `|${escapeMermaidLabel(edge.label)}| ` : '';
    lines.push(`    ${edge.sourceId} ${arrow} ${label}${edge.targetId}`);
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
