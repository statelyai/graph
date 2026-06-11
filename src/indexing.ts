import type { Graph, GraphNode, GraphEdge } from './types';

// Index types

export interface GraphIndex {
  /** id → array index for nodes */
  nodeById: Map<string, number>;
  /** id → array index for edges */
  edgeById: Map<string, number>;
  /** nodeId → outgoing edge ids (source === nodeId) */
  outEdges: Map<string, string[]>;
  /** nodeId → incoming edge ids (target === nodeId) */
  inEdges: Map<string, string[]>;
  /** parentId → child node ids */
  childNodes: Map<string | null, string[]>;
  /** Staleness detection */
  nodeCount: number;
  edgeCount: number;
  nodesRef: Graph['nodes'];
  edgesRef: Graph['edges'];
  /**
   * Bumped on every structural change applied through the mutation API.
   * Derived caches (e.g. the CSR snapshot in `algorithms/csr.ts`) key on the
   * index object identity + this version to revalidate in O(1).
   */
  version: number;
}

// WeakMap cache

const indexes = new WeakMap<Graph, GraphIndex>();

// Public API

/**
 * Get or lazily build the index for a graph.
 * Auto-rebuilds when `graph.nodes`/`graph.edges` are **replaced** (e.g. an
 * immutable-style `map`/`filter` update) or when their length changes.
 *
 * Mutating *fields* of an existing node/edge in place (e.g.
 * `edge.sourceId = 'x'`, `node.parentId = 'y'`) is not detectable in O(1) —
 * call {@link invalidateIndex} afterwards, or use the mutation API
 * (`updateNode`/`updateEdge`), which keeps the index in sync.
 *
 * @example
 * ```ts
 * import { createGraph, getIndex } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const idx = getIndex(graph);
 * idx.nodeById.get('a'); // 0
 * idx.outEdges.get('a'); // ['e1']
 * ```
 */
export function getIndex(graph: Graph): GraphIndex {
  let idx = indexes.get(graph);
  // Rebuild when the arrays were replaced (immutable-style update) or
  // counts changed — the cached index describes different arrays.
  if (
    !idx ||
    idx.nodesRef !== graph.nodes ||
    idx.edgesRef !== graph.edges ||
    idx.nodeCount !== graph.nodes.length ||
    idx.edgeCount !== graph.edges.length
  ) {
    idx = buildIndex(graph);
    indexes.set(graph, idx);
  }
  return idx;
}

/**
 * Clear the cached index. Call this if you mutate fields of existing
 * nodes/edges in place (e.g. `edge.targetId = 'a'`) — such mutations are not
 * auto-detected. Array replacement and length changes are auto-detected.
 *
 * @example
 * ```ts
 * import { createGraph, invalidateIndex, getIndex } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * graph.edges[0].targetId = 'a'; // in-place field mutation
 * invalidateIndex(graph); // forces rebuild on next getIndex()
 * ```
 */
export function invalidateIndex(graph: Graph): void {
  indexes.delete(graph);
}

// Full rebuild

function buildIndex(graph: Graph): GraphIndex {
  const nodeById = new Map<string, number>();
  const edgeById = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  const childNodes = new Map<string | null, string[]>();

  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    nodeById.set(n.id, i);
    outEdges.set(n.id, []);
    inEdges.set(n.id, []);

    const parent = n.parentId ?? null;
    if (!childNodes.has(parent)) childNodes.set(parent, []);
    childNodes.get(parent)!.push(n.id);
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    edgeById.set(e.id, i);
    outEdges.get(e.sourceId)?.push(e.id);
    inEdges.get(e.targetId)?.push(e.id);
  }

  return {
    nodeById,
    edgeById,
    outEdges,
    inEdges,
    childNodes,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    nodesRef: graph.nodes,
    edgesRef: graph.edges,
    version: 0,
  };
}

// Incremental updates — used by mutation functions in graph.ts

export function indexAddNode(
  idx: GraphIndex,
  node: GraphNode,
  arrayIndex: number,
): void {
  idx.nodeById.set(node.id, arrayIndex);
  idx.outEdges.set(node.id, []);
  idx.inEdges.set(node.id, []);

  const parent = node.parentId ?? null;
  if (!idx.childNodes.has(parent)) idx.childNodes.set(parent, []);
  idx.childNodes.get(parent)!.push(node.id);

  idx.nodeCount++;
  idx.version++;
}

export function indexAddEdge(
  idx: GraphIndex,
  edge: GraphEdge,
  arrayIndex: number,
): void {
  idx.edgeById.set(edge.id, arrayIndex);
  idx.outEdges.get(edge.sourceId)?.push(edge.id);
  idx.inEdges.get(edge.targetId)?.push(edge.id);
  idx.edgeCount++;
  idx.version++;
}

/** Update childNodes index when a node's parentId changes. */
export function indexReparentNode(
  idx: GraphIndex,
  nodeId: string,
  oldParentId: string | null | undefined,
  newParentId: string | null | undefined,
): void {
  // Remove from old parent
  const oldSiblings = idx.childNodes.get(oldParentId ?? null);
  if (oldSiblings) {
    const pos = oldSiblings.indexOf(nodeId);
    if (pos !== -1) oldSiblings.splice(pos, 1);
  }
  // Add to new parent
  const np = newParentId ?? null;
  if (!idx.childNodes.has(np)) idx.childNodes.set(np, []);
  idx.childNodes.get(np)!.push(nodeId);
  idx.version++;
}

/**
 * Bump the index version without touching adjacency. Used by mutations that
 * change fields derived caches depend on (e.g. per-edge `mode` affects the
 * CSR arc structure but not the id-based adjacency lists).
 */
export function touchIndex(idx: GraphIndex): void {
  idx.version++;
}

/** Update adjacency lists when an edge's sourceId/targetId changes. */
export function indexUpdateEdgeEndpoints(
  idx: GraphIndex,
  edgeId: string,
  oldSourceId: string,
  oldTargetId: string,
  newSourceId: string,
  newTargetId: string,
): void {
  if (oldSourceId !== newSourceId) {
    const oldOut = idx.outEdges.get(oldSourceId);
    if (oldOut) {
      const pos = oldOut.indexOf(edgeId);
      if (pos !== -1) oldOut.splice(pos, 1);
    }
    idx.outEdges.get(newSourceId)?.push(edgeId);
  }
  if (oldTargetId !== newTargetId) {
    const oldIn = idx.inEdges.get(oldTargetId);
    if (oldIn) {
      const pos = oldIn.indexOf(edgeId);
      if (pos !== -1) oldIn.splice(pos, 1);
    }
    idx.inEdges.get(newTargetId)?.push(edgeId);
  }
  idx.version++;
}
