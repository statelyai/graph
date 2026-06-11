import type { Graph, GraphEdge, GraphNode } from '../types';
import { getIndex } from '../indexing';

interface TraversalState<N = any, E = any> {
  time: number;
  disc: Map<string, number>;
  low: Map<string, number>;
  edgeStack: string[];
  bridges: Set<string>;
  articulationPoints: Set<string>;
  components: Array<Set<string>>;
  nodeById: Map<string, GraphNode<N>>;
  edgeById: Map<string, GraphEdge<E>>;
}

function getUndirectedNeighbors(
  graph: Graph,
  nodeId: string,
): Array<{ nodeId: string; edgeId: string }> {
  const idx = getIndex(graph);
  const neighbors: Array<{ nodeId: string; edgeId: string }> = [];

  for (const edgeId of idx.outEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      neighbors.push({
        nodeId: graph.edges[edgeIndex].targetId,
        edgeId,
      });
    }
  }

  for (const edgeId of idx.inEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      neighbors.push({
        nodeId: graph.edges[edgeIndex].sourceId,
        edgeId,
      });
    }
  }

  return neighbors;
}

function popComponentUntil<N, E>(
  state: TraversalState<N, E>,
  stopEdgeId: string,
): void {
  const nodeIds = new Set<string>();

  while (state.edgeStack.length > 0) {
    const edgeId = state.edgeStack.pop()!;
    const edge = state.edgeById.get(edgeId);
    if (edge) {
      nodeIds.add(edge.sourceId);
      nodeIds.add(edge.targetId);
    }
    if (edgeId === stopEdgeId) {
      break;
    }
  }

  if (nodeIds.size > 0) {
    state.components.push(nodeIds);
  }
}

function finalizeRemainingComponent<N, E>(state: TraversalState<N, E>): void {
  if (state.edgeStack.length === 0) {
    return;
  }

  const nodeIds = new Set<string>();
  while (state.edgeStack.length > 0) {
    const edge = state.edgeById.get(state.edgeStack.pop()!);
    if (edge) {
      nodeIds.add(edge.sourceId);
      nodeIds.add(edge.targetId);
    }
  }

  if (nodeIds.size > 0) {
    state.components.push(nodeIds);
  }
}

function traverseConnectivity<N, E>(
  graph: Graph<N, E>,
  nodeId: string,
  parentEdgeId: string | null,
  state: TraversalState<N, E>,
): void {
  state.time += 1;
  state.disc.set(nodeId, state.time);
  state.low.set(nodeId, state.time);

  let childCount = 0;

  for (const neighbor of getUndirectedNeighbors(graph, nodeId)) {
    if (neighbor.edgeId === parentEdgeId) continue;

    if (!state.disc.has(neighbor.nodeId)) {
      childCount += 1;
      state.edgeStack.push(neighbor.edgeId);
      traverseConnectivity(graph, neighbor.nodeId, neighbor.edgeId, state);
      state.low.set(
        nodeId,
        Math.min(state.low.get(nodeId)!, state.low.get(neighbor.nodeId)!),
      );

      if (state.low.get(neighbor.nodeId)! > state.disc.get(nodeId)!) {
        state.bridges.add(neighbor.edgeId);
      }

      if (state.low.get(neighbor.nodeId)! >= state.disc.get(nodeId)!) {
        if (parentEdgeId !== null) {
          state.articulationPoints.add(nodeId);
        }
        // Pop for the root's children too, so each child subtree forms its
        // own biconnected component instead of being lumped together.
        popComponentUntil(state, neighbor.edgeId);
      }
    } else if (state.disc.get(neighbor.nodeId)! < state.disc.get(nodeId)!) {
      state.edgeStack.push(neighbor.edgeId);
      state.low.set(
        nodeId,
        Math.min(state.low.get(nodeId)!, state.disc.get(neighbor.nodeId)!),
      );
    }
  }

  if (parentEdgeId === null && childCount > 1) {
    state.articulationPoints.add(nodeId);
  }
}

function analyzeConnectivity<N, E>(graph: Graph<N, E>): TraversalState<N, E> {
  const state: TraversalState<N, E> = {
    time: 0,
    disc: new Map(),
    low: new Map(),
    edgeStack: [],
    bridges: new Set(),
    articulationPoints: new Set(),
    components: [],
    nodeById: new Map(graph.nodes.map((node) => [node.id, node])),
    edgeById: new Map(graph.edges.map((edge) => [edge.id, edge])),
  };

  for (const node of graph.nodes) {
    if (state.disc.has(node.id)) continue;
    traverseConnectivity(graph, node.id, null, state);
    finalizeRemainingComponent(state);
  }

  return state;
}

/**
 * Returns bridge edges whose removal disconnects the graph.
 *
 * Connectivity algorithms in this module treat the graph as undirected.
 */
export function getBridges<N, E>(graph: Graph<N, E>): GraphEdge<E>[] {
  if (graph.edges.length === 0) {
    return [];
  }

  const state = analyzeConnectivity(graph);
  return [...state.bridges]
    .map((edgeId) => state.edgeById.get(edgeId)!)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Returns articulation points (cut vertices) for the graph.
 *
 * Connectivity algorithms in this module treat the graph as undirected.
 */
export function getArticulationPoints<N, E>(graph: Graph<N, E>): GraphNode<N>[] {
  if (graph.nodes.length === 0) {
    return [];
  }

  const state = analyzeConnectivity(graph);
  return [...state.articulationPoints]
    .map((nodeId) => state.nodeById.get(nodeId)!)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Returns biconnected components as arrays of nodes.
 *
 * Articulation points may appear in multiple returned components.
 */
export function getBiconnectedComponents<N, E>(
  graph: Graph<N, E>,
): GraphNode<N>[][] {
  if (graph.edges.length === 0) {
    return [];
  }

  const state = analyzeConnectivity(graph);
  return state.components
    .map((component) =>
      [...component]
        .map((nodeId) => state.nodeById.get(nodeId)!)
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
}
