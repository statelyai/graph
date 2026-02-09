import type { Graph, GraphNode, GraphEdge } from './types';
import { getIndex } from './indexing';

// --- Edge queries ---

export function getEdgesOf<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
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

export function getInEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.inEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

export function getOutEdges<E>(graph: Graph<any, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

export function getEdgeBetween<E>(
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

export function getSuccessors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
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

export function getPredecessors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
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

export function getNeighbors<N>(graph: Graph<N>, nodeId: string): GraphNode<N>[] {
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

export function getDegree(graph: Graph, nodeId: string): number {
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

export function getInDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).inEdges.get(nodeId)?.length ?? 0;
}

export function getOutDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).outEdges.get(nodeId)?.length ?? 0;
}

// --- Hierarchy queries ---

export function getChildren<N>(
  graph: Graph<N>,
  nodeId: string | null,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const childIds = idx.childNodes.get(nodeId) ?? [];
  return childIds.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean);
}

export function getParent<N>(
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

export function getAncestors<N>(
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

export function getDescendants<N>(
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

export function getRoots<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return idx.childNodes.get(null)?.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean) ?? [];
}

/** Whether a node has children (is a compound/group node). */
export function isCompound(graph: Graph, nodeId: string): boolean {
  const idx = getIndex(graph);
  const childIds = idx.childNodes.get(nodeId) ?? [];
  return childIds.length > 0;
}

/** Whether a node has no children (is a leaf/atomic node). */
export function isLeaf(graph: Graph, nodeId: string): boolean {
  return !isCompound(graph, nodeId);
}

/** Depth of a node in the hierarchy (root = 0). */
export function getDepth(graph: Graph, nodeId: string): number {
  const idx = getIndex(graph);
  let d = 0;
  let ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return -1;
  let current = graph.nodes[ni];
  while (current.parentId !== null) {
    d++;
    const pi = idx.nodeById.get(current.parentId);
    if (pi === undefined) break;
    current = graph.nodes[pi];
  }
  return d;
}

/** Sibling nodes (same parentId, excluding the node itself). */
export function getSiblings<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return [];
  const node = graph.nodes[ni];
  const childIds = idx.childNodes.get(node.parentId) ?? [];
  return childIds
    .filter((id) => id !== nodeId)
    .map((id) => graph.nodes[idx.nodeById.get(id)!])
    .filter(Boolean);
}

/**
 * Least Common Ancestor — deepest proper ancestor of all given nodes.
 * A proper ancestor excludes the input nodes themselves.
 */
export function getLCA<N>(
  graph: Graph<N>,
  ...nodeIds: string[]
): GraphNode<N> | undefined {
  if (nodeIds.length === 0) return undefined;

  const idx = getIndex(graph);
  const getAncestorChain = (id: string): string[] => {
    const result: string[] = [id];
    let ni = idx.nodeById.get(id);
    if (ni === undefined) return result;
    let current = graph.nodes[ni];
    while (current.parentId !== null) {
      result.push(current.parentId);
      const pi = idx.nodeById.get(current.parentId);
      if (pi === undefined) break;
      current = graph.nodes[pi];
    }
    return result;
  };

  let common = getAncestorChain(nodeIds[0]);
  for (let i = 1; i < nodeIds.length; i++) {
    const set = new Set(getAncestorChain(nodeIds[i]));
    common = common.filter((id) => set.has(id));
  }

  // Must be a proper ancestor of all inputs
  const inputSet = new Set(nodeIds);
  common = common.filter((id) => !inputSet.has(id));

  if (common.length === 0) return undefined;
  const lcaId = common[0];
  const ni = idx.nodeById.get(lcaId);
  return ni !== undefined ? graph.nodes[ni] : undefined;
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
