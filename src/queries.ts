import type { Graph, GraphNode, GraphEdge } from './types';

// --- Edge queries ---

export function edgesOf<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  return graph.edges.filter(
    (e) => e.sourceId === nodeId || e.targetId === nodeId,
  );
}

export function inEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  return graph.edges.filter((e) => e.targetId === nodeId);
}

export function outEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  return graph.edges.filter((e) => e.sourceId === nodeId);
}

export function edgeBetween<E>(
  graph: Graph<any, E>,
  sourceId: string,
  targetId: string,
): GraphEdge<E> | undefined {
  if (graph.type === 'undirected') {
    return graph.edges.find(
      (e) =>
        (e.sourceId === sourceId && e.targetId === targetId) ||
        (e.sourceId === targetId && e.targetId === sourceId),
    );
  }
  return graph.edges.find(
    (e) => e.sourceId === sourceId && e.targetId === targetId,
  );
}

// --- Neighbor queries ---

export function successors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const ids = new Set(
    graph.edges
      .filter((e) => e.sourceId === nodeId)
      .map((e) => e.targetId),
  );
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function predecessors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const ids = new Set(
    graph.edges
      .filter((e) => e.targetId === nodeId)
      .map((e) => e.sourceId),
  );
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function neighbors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const ids = new Set<string>();
  for (const e of graph.edges) {
    if (e.sourceId === nodeId) ids.add(e.targetId);
    if (e.targetId === nodeId) ids.add(e.sourceId);
  }
  return graph.nodes.filter((n) => ids.has(n.id));
}

// --- Degree queries ---

export function degree(graph: Graph, nodeId: string): number {
  if (graph.type === 'undirected') {
    return graph.edges.filter(
      (e) => e.sourceId === nodeId || e.targetId === nodeId,
    ).length;
  }
  return inDegree(graph, nodeId) + outDegree(graph, nodeId);
}

export function inDegree(graph: Graph, nodeId: string): number {
  return graph.edges.filter((e) => e.targetId === nodeId).length;
}

export function outDegree(graph: Graph, nodeId: string): number {
  return graph.edges.filter((e) => e.sourceId === nodeId).length;
}

// --- Hierarchy queries ---

export function children<N>(
  graph: Graph<N>,
  nodeId: string | null,
): GraphNode<N>[] {
  return graph.nodes.filter((n) => n.parentId === nodeId);
}

export function parent<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N> | undefined {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.parentId === null) return undefined;
  return graph.nodes.find((n) => n.id === node.parentId);
}

export function ancestors<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const result: GraphNode<N>[] = [];
  let current = graph.nodes.find((n) => n.id === nodeId);
  while (current && current.parentId !== null) {
    const p = graph.nodes.find((n) => n.id === current!.parentId);
    if (!p) break;
    result.push(p);
    current = p;
  }
  return result;
}

export function descendants<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const result: GraphNode<N>[] = [];
  const collect = (id: string) => {
    for (const n of graph.nodes) {
      if (n.parentId === id) {
        result.push(n);
        collect(n.id);
      }
    }
  };
  collect(nodeId);
  return result;
}

export function roots<N>(graph: Graph<N>): GraphNode<N>[] {
  return graph.nodes.filter((n) => n.parentId === null);
}
