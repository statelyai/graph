import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { Graph } from '../../types';
import { getEdgeMode } from '../../mode';

/**
 * Converts a graph to an adjacency list representation.
 *
 * @example
 * ```ts
 * import { createGraph, toAdjacencyList } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {}, c: {} },
 *   edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
 * });
 *
 * toAdjacencyList(graph);
 * // { a: ['b', 'c'], b: [], c: [] }
 * ```
 */
export function toAdjacencyList(graph: Graph): Record<string, string[]> {
  const adj: Record<string, string[]> = Object.create(null);

  for (const node of graph.nodes) {
    adj[node.id] = [];
  }

  for (const edge of graph.edges) {
    adj[edge.sourceId]?.push(edge.targetId);
    if (getEdgeMode(graph, edge) !== 'directed' && edge.sourceId !== edge.targetId) {
      adj[edge.targetId]?.push(edge.sourceId);
    }
  }

  // Preserve the public plain-object shape; spread defines __proto__ safely.
  return { ...adj };
}

/**
 * Parses an adjacency list into a graph.
 *
 * @example
 * ```ts
 * import { fromAdjacencyList } from '@statelyai/graph';
 *
 * const graph = fromAdjacencyList({
 *   a: ['b', 'c'],
 *   b: ['c'],
 *   c: [],
 * });
 *
 * graph.nodes; // [{id: 'a', ...}, {id: 'b', ...}, {id: 'c', ...}]
 * graph.edges; // [{sourceId: 'a', targetId: 'b', ...}, ...]
 * ```
 */
export function fromAdjacencyList(
  adj: Record<string, string[]>,
  options?: { directed?: boolean; id?: string; parallel?: 'collapse' | 'preserve' },
): Graph {
  if (!adj || typeof adj !== 'object' || Array.isArray(adj)) throw new Error('Adjacency list: expected an object');
  const directed = options?.directed ?? true;
  const preserveParallel = options?.parallel === 'preserve';
  const seen = new Set<string>();
  const multiplicities = new Map<string, [number, number, number]>();

  // Include targets that never appear as keys so edges always reference
  // existing nodes.
  const nodeIds = new Set<string>(Object.keys(adj));
  if ([...nodeIds].some((id) => !id)) throw new Error('Adjacency list: node ids must be non-empty strings');
  for (const targets of Object.values(adj)) {
    if (!Array.isArray(targets)) throw new Error('Adjacency list: neighbor lists must be arrays');
    for (const targetId of targets) {
      if (typeof targetId !== 'string' || !targetId) throw new Error('Adjacency list: node ids must be non-empty strings');
      nodeIds.add(targetId);
    }
  }

  const nodes = [...nodeIds].map((id) => ({
    type: 'node' as const,
    id,
    parentId: null,
    initialNodeId: null,
    label: '',
    data: undefined as any,
  }));

  const edges: Graph['edges'] = [];
  let edgeIdx = 0;

  for (const [sourceId, targets] of Object.entries(adj)) {
    for (const targetId of targets) {
      const pair = directed ? [sourceId, targetId] : [sourceId, targetId].sort();
      const key = JSON.stringify(pair);
      let include = !seen.has(key);
      if (preserveParallel) {
        if (directed) include = true;
        else {
          // Reciprocal neighbor lists describe the same undirected edges.
          // Keep their maximum multiplicity rather than doubling it.
          const counts = multiplicities.get(key) ?? [0, 0, 0];
          const side = sourceId === pair[0] ? 0 : 1;
          include = ++counts[side] > counts[2];
          if (include) counts[2]++;
          multiplicities.set(key, counts);
        }
      }

      if (include) {
        seen.add(key);
        edges.push({
          type: 'edge',
          id: `e${edgeIdx++}`,
          sourceId,
          targetId,
          label: '',
          data: undefined as any,
        });
      }
    }
  }

  return {
    id: options?.id ?? '',
    mode: directed ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes,
    edges,
    data: undefined as any,
  };
}


/** Exact native source preservation, with strict verified field edits. */
export const adjacencyListDocumentConverter = createGraphDocumentConverter({
  format: 'adjacency-list',
  codec: { from: (source: Record<string, string[]>) => fromAdjacencyList(source), to: toAdjacencyList },
  project: (source: Record<string, string[]>) => ({ graph: getStructuredDocumentProjectionGraph(fromAdjacencyList(source), source, 'adjacency-list') }),
  patch: (context) => getStructuredDocumentPatch(context, 'adjacency-list'),
});
