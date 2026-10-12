import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- TGF (Trivial Graph Format) ---

/**
 * Converts a graph to TGF (Trivial Graph Format) string.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toTGF } from '@statelyai/graph/tgf';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b', label: 'go' }],
 * });
 *
 * const tgf = toTGF(graph);
 * // "a A\nb B\n#\na b go"
 * ```
 */
export function toTGF(graph: Graph): string {
  const lines: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));

  for (const node of graph.nodes) {
    if (!node.id || /\s/.test(node.id) || node.id === '#') throw new Error('TGF: node ids must be whitespace-free tokens other than #');
    if (node.label != null && /[\r\n]/.test(node.label)) throw new Error('TGF: labels cannot contain newlines');
    lines.push(node.label ? `${node.id} ${node.label}` : node.id);
  }

  lines.push('#');

  for (const edge of graph.edges) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) throw new Error('TGF: edge endpoint references a missing node');
    if (edge.label != null && /[\r\n]/.test(edge.label)) throw new Error('TGF: labels cannot contain newlines');
    const parts = [edge.sourceId, edge.targetId];
    if (edge.label) parts.push(edge.label);
    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

/**
 * Parses a TGF (Trivial Graph Format) string into a graph.
 *
 * @example
 * ```ts
 * import { fromTGF } from '@statelyai/graph/tgf';
 *
 * const graph = fromTGF('a A\nb B\n#\na b go');
 * // graph.nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
 * ```
 */
export function fromTGF(tgf: string): Graph {
  if (typeof tgf !== 'string') {
    throw new Error('TGF: expected a string');
  }
  const lines = tgf.split(/\r\n|\n|\r/);
  const sepIdx = lines.findIndex((line) => line.trim() === '#');
  const nodeLines = sepIdx >= 0 ? lines.slice(0, sepIdx) : lines;
  const edgeLines = sepIdx >= 0 ? lines.slice(sepIdx + 1) : [];

  const nodes: Graph['nodes'] = [];
  const ids = new Set<string>();
  for (const line of nodeLines) {
    if (!line.trim()) continue;
    const match = line.trimStart().match(/^(\S+)(?:[ \t]+(.*))?$/);
    if (!match) throw new Error('TGF: malformed node declaration');
    const id = match[1];
    const label = match[2] ?? '';
    if (ids.has(id)) throw new Error(`TGF: duplicate node id "${id}"`);
    ids.add(id);
    nodes.push({
      type: 'node',
      id,
      parentId: null,
      initialNodeId: null,
      label,
      data: undefined as any,
    });
  }

  const edges: Graph['edges'] = [];
  for (const line of edgeLines) {
    if (!line.trim()) continue;
    const match = line.trimStart().match(/^(\S+)[ \t]+(\S+)(?:[ \t]+(.*))?$/);
    if (!match) throw new Error('TGF: malformed edge declaration');
    const [, sourceId, targetId] = match;
    const label = match[3] ?? '';
    if (!ids.has(sourceId) || !ids.has(targetId)) throw new Error('TGF: edge endpoint references a missing node');
    edges.push({
      type: 'edge',
      id: `e${edges.length}`,
      sourceId,
      targetId,
      label,
      data: undefined as any,
    });
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes,
    edges,
    data: undefined as any,
  };
}

/**
 * Bidirectional converter for TGF (Trivial Graph Format).
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { tgfConverter } from '@statelyai/graph/tgf';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const tgf = tgfConverter.to(graph);
 * const roundTripped = tgfConverter.from(tgf);
 * ```
 */
export const tgfConverter: GraphFormatConverter<string> =
  createFormatConverter(toTGF, fromTGF);


/** Exact native source preservation, with strict verified field edits. */
export const tgfDocumentConverter = createGraphDocumentConverter({
  format: 'tgf',
  codec: { from: (source: string) => fromTGF(source), to: toTGF },
  project: (source: string) => ({ graph: getStructuredDocumentProjectionGraph(fromTGF(source), source, 'tgf') }),
  patch: (context) => getStructuredDocumentPatch(context, 'tgf'),
});
