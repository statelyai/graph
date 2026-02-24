import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- TGF (Trivial Graph Format) ---

/**
 * Converts a graph to TGF (Trivial Graph Format) string.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toTGF } from '@statelyai/graph/formats/tgf';
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

  for (const node of graph.nodes) {
    lines.push(node.label ? `${node.id} ${node.label}` : node.id);
  }

  lines.push('#');

  for (const edge of graph.edges) {
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
 * import { fromTGF } from '@statelyai/graph/formats/tgf';
 *
 * const graph = fromTGF('a A\nb B\n#\na b go');
 * // graph.nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
 * ```
 */
export function fromTGF(tgf: string): Graph {
  if (typeof tgf !== 'string') {
    throw new Error('TGF: expected a string');
  }
  const lines = tgf.split('\n');
  const sepIdx = lines.indexOf('#');
  const nodeLines = sepIdx >= 0 ? lines.slice(0, sepIdx) : lines;
  const edgeLines = sepIdx >= 0 ? lines.slice(sepIdx + 1) : [];

  const nodes: Graph['nodes'] = [];
  for (const line of nodeLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    const id = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
    const label = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1) : '';
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
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(' ');
    const sourceId = parts[0];
    const targetId = parts[1];
    const label = parts.slice(2).join(' ');
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
    type: 'directed',
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
 * import { tgfConverter } from '@statelyai/graph/formats/tgf';
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
