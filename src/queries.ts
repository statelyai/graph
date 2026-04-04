import type { Graph, GraphNode, GraphEdge, GraphPort } from './types';
import { getIndex } from './indexing';

// --- Edge queries ---

/**
 * Returns all edges (incoming + outgoing) connected to a node.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'c', targetId: 'b' },
 *   ],
 * });
 * getEdgesOf(graph, 'b');
 * // => [edge e1, edge e2]
 * ```
 */
export function getEdgesOf<N, E>(graph: Graph<N, E>, nodeId: string): GraphEdge<E>[] {
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

/**
 * Returns incoming edges to a node.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getInEdges(graph, 'b');
 * // => [edge e1]
 * getInEdges(graph, 'a');
 * // => []
 * ```
 */
export function getInEdges<N, E>(graph: Graph<N, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.inEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

/**
 * Returns outgoing edges from a node.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getOutEdges(graph, 'a');
 * // => [edge e1]
 * getOutEdges(graph, 'b');
 * // => []
 * ```
 */
export function getOutEdges<N, E>(graph: Graph<N, E>, nodeId: string): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!]);
}

/**
 * Returns the edge from `sourceId` to `targetId`, or `undefined` if none exists.
 * For undirected graphs, checks both directions.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getEdgeBetween(graph, 'a', 'b');
 * // => edge e1
 * getEdgeBetween(graph, 'b', 'a');
 * // => undefined (directed graph)
 * ```
 */
export function getEdgeBetween<N, E>(
  graph: Graph<N, E>,
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

/**
 * Returns direct successor nodes (targets of outgoing edges).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'a', targetId: 'c' },
 *   ],
 * });
 * getSuccessors(graph, 'a');
 * // => [node b, node c]
 * ```
 */
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

/**
 * Returns direct predecessor nodes (sources of incoming edges).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'c' },
 *     { id: 'e2', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 * getPredecessors(graph, 'c');
 * // => [node a, node b]
 * ```
 */
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

/**
 * Returns all neighbor nodes (successors + predecessors).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'c', targetId: 'b' },
 *   ],
 * });
 * getNeighbors(graph, 'b');
 * // => [node a, node c]
 * ```
 */
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

/**
 * Returns the total degree of a node (inDegree + outDegree).
 * For undirected graphs, each edge is counted once.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'c', targetId: 'b' },
 *   ],
 * });
 * getDegree(graph, 'b'); // => 2
 * getDegree(graph, 'a'); // => 1
 * ```
 */
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

/**
 * Returns the in-degree of a node (number of incoming edges).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getInDegree(graph, 'b'); // => 1
 * getInDegree(graph, 'a'); // => 0
 * ```
 */
export function getInDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).inEdges.get(nodeId)?.length ?? 0;
}

/**
 * Returns the out-degree of a node (number of outgoing edges).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getOutDegree(graph, 'a'); // => 1
 * getOutDegree(graph, 'b'); // => 0
 * ```
 */
export function getOutDegree(graph: Graph, nodeId: string): number {
  return getIndex(graph).outEdges.get(nodeId)?.length ?? 0;
}

// --- Hierarchy queries ---

/**
 * Returns direct children of a node in the hierarchy.
 * Pass `null` to get root-level nodes.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent' },
 *     { id: 'child1', parentId: 'parent' },
 *     { id: 'child2', parentId: 'parent' },
 *   ],
 * });
 * getChildren(graph, 'parent');
 * // => [node child1, node child2]
 * getChildren(graph, null);
 * // => [node parent]
 * ```
 */
export function getChildren<N>(
  graph: Graph<N>,
  nodeId: string | null,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const childIds = idx.childNodes.get(nodeId) ?? [];
  return childIds.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean);
}

/**
 * Returns the parent node in the hierarchy, or `undefined` if root-level.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent' },
 *     { id: 'child', parentId: 'parent' },
 *   ],
 * });
 * getParent(graph, 'child');
 * // => node parent
 * getParent(graph, 'parent');
 * // => undefined
 * ```
 */
export function getParent<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N> | undefined {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return undefined;
  const node = graph.nodes[ni];
  if (!node.parentId) return undefined;
  const pi = idx.nodeById.get(node.parentId);
  return pi !== undefined ? graph.nodes[pi] : undefined;
}

/**
 * Returns all ancestors from the node up to the root (nearest parent first).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'root' },
 *     { id: 'mid', parentId: 'root' },
 *     { id: 'leaf', parentId: 'mid' },
 *   ],
 * });
 * getAncestors(graph, 'leaf');
 * // => [node mid, node root]
 * ```
 */
export function getAncestors<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const result: GraphNode<N>[] = [];
  let ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return result;
  let current = graph.nodes[ni];
  while (current && current.parentId) {
    const pi = idx.nodeById.get(current.parentId);
    if (pi === undefined) break;
    const p = graph.nodes[pi];
    result.push(p);
    current = p;
  }
  return result;
}

/**
 * Returns all descendants recursively (depth-first).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'root' },
 *     { id: 'child', parentId: 'root' },
 *     { id: 'grandchild', parentId: 'child' },
 *   ],
 * });
 * getDescendants(graph, 'root');
 * // => [node child, node grandchild]
 * ```
 */
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

/**
 * Returns all root nodes (nodes with no parent).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'root1' },
 *     { id: 'root2' },
 *     { id: 'child', parentId: 'root1' },
 *   ],
 * });
 * getRoots(graph);
 * // => [node root1, node root2]
 * ```
 */
export function getRoots<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return idx.childNodes.get(null)?.map((id) => graph.nodes[idx.nodeById.get(id)!]).filter(Boolean) ?? [];
}

/**
 * Whether a node has children (is a compound/group node).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent' },
 *     { id: 'child', parentId: 'parent' },
 *   ],
 * });
 * isCompound(graph, 'parent'); // => true
 * isCompound(graph, 'child');  // => false
 * ```
 */
export function isCompound(graph: Graph, nodeId: string): boolean {
  const idx = getIndex(graph);
  const childIds = idx.childNodes.get(nodeId) ?? [];
  return childIds.length > 0;
}

/**
 * Whether a node has no children (is a leaf/atomic node).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent' },
 *     { id: 'child', parentId: 'parent' },
 *   ],
 * });
 * isLeaf(graph, 'child');  // => true
 * isLeaf(graph, 'parent'); // => false
 * ```
 */
export function isLeaf(graph: Graph, nodeId: string): boolean {
  return !isCompound(graph, nodeId);
}

/**
 * Depth of a node in the hierarchy (root = 0).
 * Returns -1 if the node is not found.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'root' },
 *     { id: 'child', parentId: 'root' },
 *     { id: 'grandchild', parentId: 'child' },
 *   ],
 * });
 * getDepth(graph, 'root');       // => 0
 * getDepth(graph, 'child');      // => 1
 * getDepth(graph, 'grandchild'); // => 2
 * ```
 */
export function getDepth(graph: Graph, nodeId: string): number {
  const idx = getIndex(graph);
  let d = 0;
  let ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return -1;
  let current = graph.nodes[ni];
  while (current.parentId) {
    d++;
    const pi = idx.nodeById.get(current.parentId);
    if (pi === undefined) break;
    current = graph.nodes[pi];
  }
  return d;
}

/**
 * Sibling nodes (same parentId, excluding the node itself).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent' },
 *     { id: 'a', parentId: 'parent' },
 *     { id: 'b', parentId: 'parent' },
 *     { id: 'c', parentId: 'parent' },
 *   ],
 * });
 * getSiblings(graph, 'a');
 * // => [node b, node c]
 * ```
 */
export function getSiblings<N>(
  graph: Graph<N>,
  nodeId: string,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return [];
  const node = graph.nodes[ni];
  const childIds = idx.childNodes.get(node.parentId ?? null) ?? [];
  return childIds
    .filter((id) => id !== nodeId)
    .map((id) => graph.nodes[idx.nodeById.get(id)!])
    .filter(Boolean);
}

/**
 * Least Common Ancestor -- deepest proper ancestor of all given nodes.
 * A proper ancestor excludes the input nodes themselves.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'root' },
 *     { id: 'a', parentId: 'root' },
 *     { id: 'b', parentId: 'root' },
 *     { id: 'a1', parentId: 'a' },
 *   ],
 * });
 * getLCA(graph, 'a1', 'b');
 * // => node root
 * getLCA(graph, 'a', 'b');
 * // => node root
 * ```
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
    while (current.parentId) {
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

// --- Distance queries ---

/**
 * Returns a map of nodeId → shortest-path distance for all sibling nodes
 * (same parentId). Distance is measured from the parent's `initialNodeId`
 * (or `graph.initialNodeId` for root-level nodes).
 *
 * Only follows edges between siblings. Unreachable siblings are omitted.
 *
 * @example Root-level nodes (uses `graph.initialNodeId`):
 * ```ts
 * const graph = createGraph({
 *   initialNodeId: 'a',
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 * getRelativeDistanceMap(graph, null);
 * // => { a: 0, b: 1, c: 2 }
 * ```
 *
 * @example Nested nodes (uses parent's `initialNodeId`):
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent', initialNodeId: 's1' },
 *     { id: 's1', parentId: 'parent' },
 *     { id: 's2', parentId: 'parent' },
 *     { id: 's3', parentId: 'parent' },
 *   ],
 *   edges: [
 *     { id: 'e1', sourceId: 's1', targetId: 's2' },
 *     { id: 'e2', sourceId: 's2', targetId: 's3' },
 *   ],
 * });
 * getRelativeDistanceMap(graph, 'parent');
 * // => { s1: 0, s2: 1, s3: 2 }
 * ```
 */
export function getRelativeDistanceMap(
  graph: Graph,
  parentId: string | null,
): Record<string, number> {
  const idx = getIndex(graph);

  // Determine source: parent's initialNodeId, or graph.initialNodeId for roots
  let sourceId: string | null = null;
  if (parentId !== null) {
    const pi = idx.nodeById.get(parentId);
    if (pi !== undefined) {
      sourceId = graph.nodes[pi].initialNodeId ?? null;
    }
  } else {
    sourceId = graph.initialNodeId ?? null;
  }
  if (!sourceId) return {};

  // BFS from source, only following edges between siblings (same parentId)
  const siblingSet = new Set(idx.childNodes.get(parentId) ?? []);
  if (!siblingSet.has(sourceId)) return {};

  const dist = new Map<string, number>();
  dist.set(sourceId, 0);
  const queue: string[] = [sourceId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = dist.get(id)!;

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].targetId;
      if (siblingSet.has(neighborId) && !dist.has(neighborId)) {
        dist.set(neighborId, d + 1);
        queue.push(neighborId);
      }
    }
    if (graph.type === 'undirected') {
      for (const eid of idx.inEdges.get(id) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const neighborId = graph.edges[ai].sourceId;
        if (siblingSet.has(neighborId) && !dist.has(neighborId)) {
          dist.set(neighborId, d + 1);
          queue.push(neighborId);
        }
      }
    }
  }

  const result: Record<string, number> = {};
  for (const [id, d] of dist) {
    result[id] = d;
  }
  return result;
}

/**
 * Returns the shortest-path distance of a node from its parent's initial node.
 * Automatically scopes to the node's sibling group (same `parentId`).
 *
 * Returns `undefined` if the node is not found or unreachable.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   initialNodeId: 'a',
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 * getRelativeDistance(graph, 'a'); // => 0
 * getRelativeDistance(graph, 'b'); // => 1
 * getRelativeDistance(graph, 'c'); // => 2
 * ```
 *
 * @example Nested nodes:
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent', initialNodeId: 's1' },
 *     { id: 's1', parentId: 'parent' },
 *     { id: 's2', parentId: 'parent' },
 *   ],
 *   edges: [{ id: 'e1', sourceId: 's1', targetId: 's2' }],
 * });
 * getRelativeDistance(graph, 's1'); // => 0
 * getRelativeDistance(graph, 's2'); // => 1
 * ```
 */
export function getRelativeDistance(
  graph: Graph,
  nodeId: string,
): number | undefined {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return undefined;
  const node = graph.nodes[ni];
  const map = getRelativeDistanceMap(graph, node.parentId ?? null);
  return map[nodeId];
}

// --- Graph-level queries ---

/**
 * Nodes with no incoming edges (inDegree 0).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 * getSources(graph);
 * // => [node a]
 * ```
 */
export function getSources<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return graph.nodes.filter((n) => (idx.inEdges.get(n.id)?.length ?? 0) === 0);
}

/**
 * Nodes with no outgoing edges (outDegree 0).
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'e1', sourceId: 'a', targetId: 'b' },
 *     { id: 'e2', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 * getSinks(graph);
 * // => [node c]
 * ```
 */
export function getSinks<N>(graph: Graph<N>): GraphNode<N>[] {
  const idx = getIndex(graph);
  return graph.nodes.filter((n) => (idx.outEdges.get(n.id)?.length ?? 0) === 0);
}

// --- Port queries ---

/**
 * Get a port by name on a node, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{
 *     id: 'a',
 *     ports: [{ name: 'out', direction: 'out' }],
 *   }],
 * });
 * getPort(graph, 'a', 'out'); // => { name: 'out', direction: 'out', ... }
 * getPort(graph, 'a', 'missing'); // => undefined
 * ```
 */
export function getPort<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  nodeId: string,
  portName: string,
): GraphPort<P> | undefined {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return undefined;
  return graph.nodes[ni].ports?.find((p) => p.name === portName);
}

/**
 * Get all ports on a node. Returns `[]` if the node has no ports or doesn't exist.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{
 *     id: 'a',
 *     ports: [
 *       { name: 'in', direction: 'in' },
 *       { name: 'out', direction: 'out' },
 *     ],
 *   }],
 * });
 * getPorts(graph, 'a'); // => [port in, port out]
 * ```
 */
export function getPorts<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  nodeId: string,
): GraphPort<P>[] {
  const idx = getIndex(graph);
  const ni = idx.nodeById.get(nodeId);
  if (ni === undefined) return [];
  return graph.nodes[ni].ports ?? [];
}

/**
 * Get all edges connected to a specific port on a node.
 *
 * Returns edges where:
 * - `sourceId === nodeId && sourcePort === portName`, or
 * - `targetId === nodeId && targetPort === portName`
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'a', ports: [{ name: 'out', direction: 'out' }] },
 *     { id: 'b', ports: [{ name: 'in', direction: 'in' }] },
 *   ],
 *   edges: [{
 *     id: 'e1', sourceId: 'a', targetId: 'b',
 *     sourcePort: 'out', targetPort: 'in',
 *   }],
 * });
 * getEdgesByPort(graph, 'a', 'out'); // => [edge e1]
 * ```
 */
export function getEdgesByPort<N, E>(
  graph: Graph<N, E>,
  nodeId: string,
  portName: string,
): GraphEdge<E>[] {
  const idx = getIndex(graph);
  const result: GraphEdge<E>[] = [];

  // Check outgoing edges
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined && graph.edges[ai].sourcePort === portName) {
      result.push(graph.edges[ai]);
    }
  }
  // Check incoming edges
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined && graph.edges[ai].targetPort === portName) {
      result.push(graph.edges[ai]);
    }
  }

  return result;
}
