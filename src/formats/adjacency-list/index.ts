import type { Graph } from '../../types';

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
  const adj: Record<string, string[]> = {};

  for (const node of graph.nodes) {
    adj[node.id] = [];
  }

  for (const edge of graph.edges) {
    adj[edge.sourceId]?.push(edge.targetId);
    if (graph.type === 'undirected') {
      adj[edge.targetId]?.push(edge.sourceId);
    }
  }

  return adj;
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
  options?: { directed?: boolean; id?: string },
): Graph {
  const directed = options?.directed ?? true;
  const seen = new Set<string>();

  const nodes = Object.keys(adj).map((id) => ({
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
      const key = directed
        ? `${sourceId}->${targetId}`
        : [sourceId, targetId].sort().join('<->');

      if (!seen.has(key)) {
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
    type: directed ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes,
    edges,
    data: undefined as any,
  };
}
