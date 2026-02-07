import type { Graph, GraphNode, GraphEdge } from './types';
import { getIndex } from './indexing';

// --- Edge queries ---

export function edgesOf<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const outIds = idx.outEdges.get(nodeId) ?? [];
  const inIds = idx.inEdges.get(nodeId) ?? [];
  const seen = new Set<string>();
  const result: GraphEdge<E>[] = [];
  for (const eid of outIds) {
    seen.add(eid);
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) result.push(graph.edges[ai]);
  }
  for (const eid of inIds) {
    if (!seen.has(eid)) {
      const ai = idx.edgeById.get(eid);
      if (ai !== undefined) result.push(graph.edges[ai]);
    }
  }
  return result;
}

export function inEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.inEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

export function outEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

export function edgeBetween<E>(
  graph: Graph<any, E>,
  sourceId: string,
  targetId: string,
): GraphEdge<E> | undefined {
  const idx = getIndex(graph);
  const outIds = idx.outEdges.get(sourceId) ?? [];
  for (const eid of outIds) {
    const ai = idx.edgeById.get(eid)!;
    const e = graph.edges[ai];
    if (e.targetId === targetId) return e;
  }
  if (graph.type === 'undirected') {
    const outIds2 = idx.outEdges.get(targetId) ?? [];
    for (const eid of outIds2) {
      const ai = idx.edgeById.get(eid)!;
      const e = graph.edges[ai];
      if (e.targetId === sourceId) return e;
    }
  }
  return undefined;
}

// --- Neighbor queries ---

export function successors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  const seen = new Set<string>();
  const result: GraphNode<N>[] = [];
  for (const eid of edgeIds) {
    const e = graph.edges[idx.edgeById.get(eid)!];
    if (!seen.has(e.targetId)) {
      seen.add(e.targetId);
      const ni = idx.nodeById.get(e.targetId);
      if (ni !== undefined) result.push(graph.nodes[ni]);
    }
  }
  return result;
}

export function predecessors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.inEdges.get(nodeId) ?? [];
  const seen = new Set<string>();
  const result: GraphNode<N>[] = [];
  for (const eid of edgeIds) {
    const e = graph.edges[idx.edgeById.get(eid)!];
    if (!seen.has(e.sourceId)) {
      seen.add(e.sourceId);
      const ni = idx.nodeById.get(e.sourceId);
      if (ni !== undefined) result.push(graph.nodes[ni]);
    }
  }
  return result;
}

export function neighbors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
  const idx = getIndex(graph);
  const ids = new Set<string>();
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    ids.add(graph.edges[idx.edgeById.get(eid)!].targetId);
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    ids.add(graph.edges[idx.edgeById.get(eid)!].sourceId);
  }
  return [...ids].map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean);
}

// --- Degree queries ---

export function degree(graph: Graph, nodeId: string): number {
  const idx = getIndex(graph);
  if (graph.type === 'undirected') {
    // Count unique edges (an edge where sourceId === targetId === nodeId should count once)
    const out = idx.outEdges.get(nodeId) ?? [];
    const inE = idx.inEdges.get(nodeId) ?? [];
    const all = new Set([...out, ...inE]);
    return all.size;
  }
  return (idx.inEdges.get(nodeId)?.length ?? 0) + (idx.outEdges.get(nodeId)?.length ?? 0);
}

export function inDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).inEdges.get(nodeId)?.length ?? 0;
}

export function outDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).outEdges.get(nodeId)?.length ?? 0;
}

// --- Hierarchy queries ---

export function children<N>(
  graph: Graph<N>,
  nodeId: string | null,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const childIds = idx.childNodes.get(nodeId) ?? [];
  return childIds.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean);
}

export function parent<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N> | undefined {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return undefined;
  const node = graph.nodes[ni];
  if (node.parentId === null) return undefined;
  const pi = idx.nodeById.get(node.parentId);
  return pi !== undefined ? graph.nodes[pi] : undefined;
}

export function ancestors<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const result: GraphNode<N>[] = [];
  let ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return result;
  let current = graph.nodes[ni];
  while (current && current.parentId !== null) {
    const pi = idx.nodeById.get(current.parentId);
    if (pi === undefined) break;
    const p = graph.nodes[pi];
    result.push(p);
    current = p;
  }
  return result;
}

export function descendants<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const result: GraphNode<N>[] = [];
  const collect = (id: string) => {
    const childIds = idx.childNodes.get(id) ?? [];
    for (const childId of childIds) {
      const ci = idx.nodeById.get(childId);
      if (ci !== undefined) {
        result.push(graph.nodes[ci]);
        collect(childId);
      }
    }
  };
  collect(nodeId);
  return result;
}

export function roots<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return idx.childNodes.get(null)?.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean) ?? [];
}

// --- Graph-level queries ---

/** Nodes with no incoming edges (inDegree 0). */
export function getSources<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return graph.nodes.filter((n) => (idx.inEdges.get(n.id)?.length ?? 0) === 0);
}

/** Nodes with no outgoing edges (outDegree 0). */
export function getSinks<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return graph.nodes.filter((n) => (idx.outEdges.get(n.id)?.length ?? 0) === 0);
}
