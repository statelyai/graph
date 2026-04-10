import type { Graph, GraphNode } from '../types';
import { getIndex } from '../indexing';
import {
  getNeighborIds,
  getSuccessorIds,
} from './shared';
import { getShortestPaths } from './paths';

export function* bfs<N>(
  graph: Graph<N>,
  startId: string,
): Generator<GraphNode<N>> {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const ni = idx.nodeById.get(id);
    if (ni === undefined) continue;
    yield graph.nodes[ni];

    for (const neighborId of getNeighborIds(graph, id)) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }
}

export function* dfs<N>(
  graph: Graph<N>,
  startId: string,
): Generator<GraphNode<N>> {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const stack: string[] = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const ni = idx.nodeById.get(id);
    if (ni === undefined) continue;
    yield graph.nodes[ni];

    for (const neighborId of getNeighborIds(graph, id)) {
      if (!visited.has(neighborId)) {
        stack.push(neighborId);
      }
    }
  }
}

export function isAcyclic(graph: Graph): boolean {
  if (graph.type === 'undirected') {
    return isAcyclicUndirected(graph);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) color.set(node.id, WHITE);

  const hasCycle = (id: string): boolean => {
    color.set(id, GRAY);
    for (const neighborId of getSuccessorIds(graph, id)) {
      const current = color.get(neighborId);
      if (current === GRAY) return true;
      if (current === WHITE && hasCycle(neighborId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE && hasCycle(node.id)) return false;
  }
  return true;
}

function isAcyclicUndirected(graph: Graph): boolean {
  const idx = getIndex(graph);
  const visited = new Set<string>();

  const hasCycle = (id: string, parentId: string | null): boolean => {
    visited.add(id);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].targetId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }

    for (const eid of idx.inEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].sourceId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }

    return false;
  };

  for (const node of graph.nodes) {
    if (!visited.has(node.id) && hasCycle(node.id, null)) return false;
  }
  return true;
}

export function getConnectedComponents<N>(graph: Graph<N>): GraphNode<N>[][] {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const components: GraphNode<N>[][] = [];

  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const component: GraphNode<N>[] = [];
    const queue: string[] = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const ni = idx.nodeById.get(id);
      if (ni !== undefined) component.push(graph.nodes[ni]);

      for (const eid of idx.outEdges.get(id) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const neighborId = graph.edges[ai].targetId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }

      for (const eid of idx.inEdges.get(id) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const neighborId = graph.edges[ai].sourceId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    components.push(component);
  }

  return components;
}

export function getTopologicalSort<N>(graph: Graph<N>): GraphNode<N>[] | null {
  const idx = getIndex(graph);
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) inDegree.set(node.id, 0);
  for (const edge of graph.edges) {
    inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: GraphNode<N>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const ni = idx.nodeById.get(id);
    if (ni !== undefined) result.push(graph.nodes[ni]);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const targetId = graph.edges[ai].targetId;
      const nextDegree = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, nextDegree);
      if (nextDegree === 0) queue.push(targetId);
    }
  }

  if (result.length !== graph.nodes.length) return null;
  return result;
}

export function hasPath(
  graph: Graph,
  sourceId: string,
  targetId: string,
): boolean {
  return getShortestPaths(graph, { from: sourceId, to: targetId }).length > 0;
}

export function isConnected(graph: Graph): boolean {
  if (graph.nodes.length === 0) return true;
  return getConnectedComponents(graph).length <= 1;
}

export function isTree(graph: Graph): boolean {
  return isConnected(graph) && isAcyclic(graph);
}
