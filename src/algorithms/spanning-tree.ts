import type { Graph, GraphEdge, MSTOptions } from '../types';
import { getIndex } from '../indexing';
import { createGraph } from '../graph';
import { getEdgeMode } from '../mode';
import { MinPriorityQueue } from './shared';

export function getMinimumSpanningTree<N, E>(
  graph: Graph<N, E>,
  opts?: MSTOptions<E>,
): Graph<N, E> {
  const algorithm = opts?.algorithm ?? 'prim';
  const getWeight = opts?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);

  const mstEdges =
    algorithm === 'kruskal'
      ? kruskalMST(graph, getWeight)
      : primMST(graph, getWeight);

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map((node) => {
      const { type, parentId, initialNodeId, ...rest } = node;
      return {
        ...rest,
        parentId: parentId ?? undefined,
        initialNodeId: initialNodeId ?? undefined,
      };
    }),
    edges: mstEdges.map((edge) => {
      const { type, ...rest } = edge;
      return rest;
    }),
  });
}

function primMST<N, E>(
  graph: Graph<N, E>,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphEdge<E>[] {
  if (graph.nodes.length === 0) return [];

  const idx = getIndex(graph);
  const inMST = new Set<string>();
  const mstEdges: GraphEdge<E>[] = [];
  const candidates = new MinPriorityQueue<{ weight: number; edge: GraphEdge<E> }>(
    (a, b) => a.weight - b.weight,
  );

  function addEdgesOf(nodeId: string): void {
    for (const eid of idx.outEdges.get(nodeId) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const edge = graph.edges[ai] as GraphEdge<E>;
      if (!inMST.has(edge.targetId)) {
        candidates.push({ weight: getWeight(edge), edge });
      }
    }

    // Edges whose effective mode is not 'directed' are traversable both ways
    for (const eid of idx.inEdges.get(nodeId) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const edge = graph.edges[ai] as GraphEdge<E>;
      if (getEdgeMode(graph, edge) !== 'directed' && !inMST.has(edge.sourceId)) {
        candidates.push({ weight: getWeight(edge), edge });
      }
    }
  }

  // Restart from each unvisited node so disconnected graphs yield a full
  // spanning forest (matching Kruskal).
  for (const node of graph.nodes) {
    if (inMST.has(node.id)) continue;
    inMST.add(node.id);
    addEdgesOf(node.id);

    while (candidates.size > 0 && inMST.size < graph.nodes.length) {
      const { edge } = candidates.pop()!;

      const targetId =
        getEdgeMode(graph, edge) !== 'directed' && inMST.has(edge.targetId)
          ? edge.sourceId
          : edge.targetId;

      if (inMST.has(targetId)) continue;
      inMST.add(targetId);
      mstEdges.push(edge);
      addEdgesOf(targetId);
    }
  }

  return mstEdges;
}

function kruskalMST<N, E>(
  graph: Graph<N, E>,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphEdge<E>[] {
  const sorted = [...graph.edges].sort(
    (a, b) => getWeight(a as GraphEdge<E>) - getWeight(b as GraphEdge<E>),
  );

  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const node of graph.nodes) {
    parent.set(node.id, node.id);
    rank.set(node.id, 0);
  }

  function find(id: string): string {
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }

  function union(a: string, b: string): boolean {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return false;

    if (rank.get(rootA)! < rank.get(rootB)!) {
      parent.set(rootA, rootB);
    } else if (rank.get(rootA)! > rank.get(rootB)!) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rank.get(rootA)! + 1);
    }
    return true;
  }

  const mstEdges: GraphEdge<E>[] = [];
  for (const edge of sorted) {
    if (union(edge.sourceId, edge.targetId)) {
      mstEdges.push(edge as GraphEdge<E>);
    }
  }

  return mstEdges;
}
