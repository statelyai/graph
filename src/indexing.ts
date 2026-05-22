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
  signature: string;
  nodesRef: Graph['nodes'];
  edgesRef: Graph['edges'];
}

// WeakMap cache

const indexes = new WeakMap<Graph, GraphIndex>();

// Public API

/**
 * Get or lazily build the index for a graph.
 * Auto-rebuilds when node/edge count changes.
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
  const sameStructure =
    idx &&
    idx.nodeCount === graph.nodes.length &&
    idx.edgeCount === graph.edges.length;
  const shouldCheckSignature =
    idx !== undefined &&
    sameStructure &&
    idx.nodesRef === graph.nodes &&
    idx.edgesRef === graph.edges;
  const signature = shouldCheckSignature ? getIndexSignature(graph) : undefined;
  if (
    !idx ||
    idx.nodeCount !== graph.nodes.length ||
    idx.edgeCount !== graph.edges.length ||
    (signature !== undefined && idx.signature !== signature)
  ) {
    idx = buildIndex(graph, signature ?? getIndexSignature(graph));
    indexes.set(graph, idx);
  }
  return idx;
}

/**
 * Clear the cached index. Call this if you mutate graph.nodes/edges directly.
 *
 * @example
 * ```ts
 * import { createGraph, invalidateIndex, getIndex } from '@statelyai/graph';
 *
 * const graph = createGraph({ nodes: [{ id: 'a' }], edges: [] });
 * // manually mutate nodes array
 * graph.nodes.push({ type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '', data: undefined });
 * invalidateIndex(graph); // forces rebuild on next getIndex()
 * ```
 */
export function invalidateIndex(graph: Graph): void {
  indexes.delete(graph);
}

// Full rebuild

function getIndexSignature(graph: Graph): string {
  const nodeParts = graph.nodes.map(
    (node) => `${node.id}\u0000${node.parentId ?? ''}`,
  );
  const edgeParts = graph.edges.map(
    (edge) =>
      `${edge.id}\u0000${edge.sourceId}\u0000${edge.targetId}`,
  );
  return `${nodeParts.join('\u0001')}\u0002${edgeParts.join('\u0001')}`;
}

function buildIndex(graph: Graph, signature: string): GraphIndex {
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
    signature,
    nodesRef: graph.nodes,
    edgesRef: graph.edges,
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
  idx.signature = '';
}

export function indexRemoveNode(
  idx: GraphIndex,
  node: GraphNode,
  arrayIndex: number,
): void {
  idx.nodeById.delete(node.id);
  idx.outEdges.delete(node.id);
  idx.inEdges.delete(node.id);

  // Remove from parent's children list
  const siblings = idx.childNodes.get(node.parentId ?? null);
  if (siblings) {
    const pos = siblings.indexOf(node.id);
    if (pos !== -1) siblings.splice(pos, 1);
  }

  // Remove from childNodes as a parent (children already removed/reparented by caller)
  idx.childNodes.delete(node.id);

  // Rebase: decrement array indices for nodes after the removed one
  for (const [id, i] of idx.nodeById) {
    if (i > arrayIndex) idx.nodeById.set(id, i - 1);
  }

  idx.nodeCount--;
  idx.signature = '';
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
  idx.signature = '';
}

export function indexRemoveEdge(
  idx: GraphIndex,
  edge: GraphEdge,
  arrayIndex: number,
): void {
  idx.edgeById.delete(edge.id);

  // Remove from adjacency lists
  const out = idx.outEdges.get(edge.sourceId);
  if (out) {
    const pos = out.indexOf(edge.id);
    if (pos !== -1) out.splice(pos, 1);
  }
  const inE = idx.inEdges.get(edge.targetId);
  if (inE) {
    const pos = inE.indexOf(edge.id);
    if (pos !== -1) inE.splice(pos, 1);
  }

  // Rebase: decrement array indices for edges after the removed one
  for (const [id, i] of idx.edgeById) {
    if (i > arrayIndex) idx.edgeById.set(id, i - 1);
  }

  idx.edgeCount--;
  idx.signature = '';
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
  idx.signature = '';
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
  idx.signature = '';
}
