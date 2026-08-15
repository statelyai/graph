import { genBFS } from './algorithms/traversal';
import { getSubgraph } from './transforms';
import type { Graph, TraversalDirection } from './types';

export interface NeighborhoodOptions {
  /** Maximum edge distance from a center. Default: `1`. */
  radius?: number;
  /** Edge direction to follow. Default: `'outgoing'`. */
  direction?: TraversalDirection;
}

/** Returns the induced subgraph within a traversal radius of one or more nodes. */
export function getNeighborhood<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  nodeIds: string | readonly string[],
  options: NeighborhoodOptions = {},
): Graph<N, E, G, P> {
  const reached = [
    ...genBFS(graph, {
      from: nodeIds,
      direction: options.direction,
      radius: options.radius ?? 1,
    }),
  ].map((node) => node.id);
  return getSubgraph(graph, reached);
}
