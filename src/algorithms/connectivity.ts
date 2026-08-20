import type { Graph, GraphEdge, GraphNode } from '../types';

interface Neighbor {
  nodeId: string;
  edgeId: string;
}

interface Frame {
  nodeId: string;
  parentId: string | null;
  parentEdgeId: string | null;
  nextNeighbor: number;
  childCount: number;
}

interface ConnectivityResult<N, E> {
  bridges: GraphEdge<E>[];
  articulationPoints: GraphNode<N>[];
  biconnectedComponents: GraphNode<N>[][];
}

/** Iterative Tarjan low-link analysis with multigraph and self-loop support. */
function analyzeConnectivity<N, E>(graph: Graph<N, E>): ConnectivityResult<N, E> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const adjacency = new Map<string, Neighbor[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.sourceId) || !adjacency.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)!.push({ nodeId: edge.targetId, edgeId: edge.id });
    if (edge.sourceId !== edge.targetId) {
      adjacency.get(edge.targetId)!.push({ nodeId: edge.sourceId, edgeId: edge.id });
    }
  }

  const discovered = new Map<string, number>();
  const low = new Map<string, number>();
  const bridgeIds = new Set<string>();
  const articulationIds = new Set<string>();
  const edgeStack: string[] = [];
  const componentIds: Set<string>[] = [];
  const selfLoopNodes = new Set<string>();
  let time = 0;

  const popComponent = (stopEdgeId?: string): void => {
    const nodes = new Set<string>();
    while (edgeStack.length > 0) {
      const edgeId = edgeStack.pop()!;
      const edge = edgeById.get(edgeId);
      if (edge) {
        nodes.add(edge.sourceId);
        nodes.add(edge.targetId);
      }
      if (edgeId === stopEdgeId) break;
    }
    if (nodes.size > 0) componentIds.push(nodes);
  };

  for (const root of graph.nodes) {
    if (discovered.has(root.id)) continue;
    discovered.set(root.id, ++time);
    low.set(root.id, time);
    const stack: Frame[] = [{
      nodeId: root.id,
      parentId: null,
      parentEdgeId: null,
      nextNeighbor: 0,
      childCount: 0,
    }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.nodeId)!;
      if (frame.nextNeighbor < neighbors.length) {
        const neighbor = neighbors[frame.nextNeighbor++];
        if (neighbor.edgeId === frame.parentEdgeId) continue;

        if (neighbor.nodeId === frame.nodeId) {
          if (!selfLoopNodes.has(frame.nodeId)) {
            selfLoopNodes.add(frame.nodeId);
            componentIds.push(new Set([frame.nodeId]));
          }
          continue;
        }

        if (!discovered.has(neighbor.nodeId)) {
          frame.childCount++;
          edgeStack.push(neighbor.edgeId);
          discovered.set(neighbor.nodeId, ++time);
          low.set(neighbor.nodeId, time);
          stack.push({
            nodeId: neighbor.nodeId,
            parentId: frame.nodeId,
            parentEdgeId: neighbor.edgeId,
            nextNeighbor: 0,
            childCount: 0,
          });
          continue;
        }

        if (discovered.get(neighbor.nodeId)! < discovered.get(frame.nodeId)!) {
          edgeStack.push(neighbor.edgeId);
          low.set(
            frame.nodeId,
            Math.min(low.get(frame.nodeId)!, discovered.get(neighbor.nodeId)!),
          );
        }
        continue;
      }

      stack.pop();
      if (frame.parentId === null) {
        if (frame.childCount > 1) articulationIds.add(frame.nodeId);
        popComponent();
        continue;
      }

      low.set(
        frame.parentId,
        Math.min(low.get(frame.parentId)!, low.get(frame.nodeId)!),
      );
      if (low.get(frame.nodeId)! > discovered.get(frame.parentId)!) {
        bridgeIds.add(frame.parentEdgeId!);
      }
      if (low.get(frame.nodeId)! >= discovered.get(frame.parentId)!) {
        const parentFrame = stack[stack.length - 1];
        if (parentFrame.parentId !== null) articulationIds.add(frame.parentId);
        popComponent(frame.parentEdgeId!);
      }
    }
  }

  const components = componentIds
    .map((ids) =>
      [...ids].sort((a, b) => a.localeCompare(b)).map((id) => nodeById.get(id)!),
    )
    .sort((a, b) => a[0].id.localeCompare(b[0].id));

  return {
    bridges: graph.edges
      .filter((edge) => bridgeIds.has(edge.id))
      .sort((a, b) => a.id.localeCompare(b.id)) as GraphEdge<E>[],
    articulationPoints: graph.nodes
      .filter((node) => articulationIds.has(node.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    biconnectedComponents: components,
  };
}

/** Returns bridge edges whose removal disconnects the undirected projection. */
export function getBridges<N, E>(graph: Graph<N, E>): GraphEdge<E>[] {
  return analyzeConnectivity(graph).bridges;
}

/** Returns cut vertices in graph node order. */
export function getArticulationPoints<N, E>(graph: Graph<N, E>): GraphNode<N>[] {
  return analyzeConnectivity(graph).articulationPoints;
}

/** Returns biconnected node components; articulation points may repeat. */
export function getBiconnectedComponents<N, E>(
  graph: Graph<N, E>,
): GraphNode<N>[][] {
  return analyzeConnectivity(graph).biconnectedComponents;
}
