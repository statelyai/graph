import type { Graph } from '../../types';

/**
 * Converts a graph to an edge list of `[source, target]` tuples.
 *
 * @example
 * ```ts
 * import { createGraph, toEdgeList } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {}, c: {} },
 *   edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
 * });
 *
 * toEdgeList(graph);
 * // [['a', 'b'], ['b', 'c']]
 * ```
 */
export function toEdgeList(graph: Graph): [string, string][] {
  return graph.edges.map((e) => [e.sourceId, e.targetId]);
}

/**
 * Parses an edge list of `[source, target]` tuples into a graph.
 *
 * @example
 * ```ts
 * import { fromEdgeList } from '@statelyai/graph';
 *
 * const graph = fromEdgeList([
 *   ['a', 'b'],
 *   ['b', 'c'],
 * ]);
 *
 * graph.nodes; // [{id: 'a', ...}, {id: 'b', ...}, {id: 'c', ...}]
 * graph.edges; // [{sourceId: 'a', targetId: 'b', ...}, ...]
 * ```
 */
export function fromEdgeList(
  edges: [string, string][],
  options?: { directed?: boolean; id?: string },
): Graph {
  const directed = options?.directed ?? true;
  const nodeIds = new Set<string>();

  for (const [source, target] of edges) {
    nodeIds.add(source);
    nodeIds.add(target);
  }

  const nodes = [...nodeIds].map((id) => ({
    type: 'node' as const,
    id,
    parentId: null,
    initialNodeId: null,
    label: '',
    data: undefined as any,
  }));

  const edgeObjects = edges.map(([sourceId, targetId], i) => ({
    type: 'edge' as const,
    id: `e${i}`,
    sourceId,
    targetId,
    label: '',
    data: undefined as any,
  }));

  return {
    id: options?.id ?? '',
    type: directed ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes,
    edges: edgeObjects,
    data: undefined as any,
  };
}
