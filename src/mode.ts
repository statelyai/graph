import type { Graph, GraphEdge, GraphMode } from './types';

/**
 * Resolve an edge's effective directedness. Falls back to the graph's
 * {@link Graph.mode} when the edge has no per-edge override.
 */
export function getEdgeMode(graph: Graph, edge: GraphEdge): GraphMode {
  return edge.mode ?? graph.mode;
}

/** Whether an edge points only from source to target. */
export function isEdgeDirected(graph: Graph, edge: GraphEdge): boolean {
  return getEdgeMode(graph, edge) === 'directed';
}
