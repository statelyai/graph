import type {
  GraphConfig,
  NodeConfig,
  EdgeConfig,
  Graph,
  GraphNode,
  GraphEdge,
  DeleteNodeOptions,
  EntitiesConfig,
  EntitiesUpdate,
  VisualGraphConfig,
  VisualGraph,
  VisualNode,
  VisualEdge,
} from './types';
import {
  getIndex,
  invalidateIndex,
  indexAddNode,
  indexAddEdge,
  indexReparentNode,
  indexUpdateEdgeEndpoints,
} from './indexing';

function resolveNode<T>(config: NodeConfig<T>): GraphNode<T> {
  const node: GraphNode<T> = {
    type: 'node',
    id: config.id,
    parentId: config.parentId ?? null,
    initialNodeId: config.initialNodeId ?? null,
    label: config.label ?? '',
    data: config.data as T,
  };
  if (config.x !== undefined) node.x = config.x;
  if (config.y !== undefined) node.y = config.y;
  if (config.width !== undefined) node.width = config.width;
  if (config.height !== undefined) node.height = config.height;
  if (config.shape !== undefined) node.shape = config.shape;
  if (config.color !== undefined) node.color = config.color;
  if (config.style !== undefined) node.style = config.style;
  return node;
}

function resolveEdge<T>(config: EdgeConfig<T>): GraphEdge<T> {
  const edge: GraphEdge<T> = {
    type: 'edge',
    id: config.id,
    sourceId: config.sourceId,
    targetId: config.targetId,
    label: config.label ?? '',
    data: config.data as T,
  };
  if (config.x !== undefined) edge.x = config.x;
  if (config.y !== undefined) edge.y = config.y;
  if (config.width !== undefined) edge.width = config.width;
  if (config.height !== undefined) edge.height = config.height;
  if (config.color !== undefined) edge.color = config.color;
  if (config.style !== undefined) edge.style = config.style;
  return edge;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a graph from a config. Resolves defaults for all fields. */
export function createGraph<N = any, E = any, G = any>(
  config?: GraphConfig<N, E, G>,
): Graph<N, E, G> {
  const graph: Graph<N, E, G> = {
    id: config?.id ?? '',
    type: config?.type ?? 'directed',
    initialNodeId: config?.initialNodeId ?? null,
    nodes: (config?.nodes ?? []).map(resolveNode),
    edges: (config?.edges ?? []).map(resolveEdge),
    data: (config?.data ?? undefined) as G,
  };
  if (config?.direction !== undefined) graph.direction = config.direction;
  if (config?.style !== undefined) graph.style = config.style;
  return graph;
}

/** Create a visual graph with required position/size on all nodes and edges. */
export function createVisualGraph<N = any, E = any, G = any>(
  config?: VisualGraphConfig<N, E, G>,
): VisualGraph<N, E, G> {
  const base = createGraph(config);
  return {
    ...base,
    direction: config?.direction ?? 'down',
    nodes: base.nodes.map(
      (n): VisualNode<N> => ({
        ...n,
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? 0,
        height: n.height ?? 0,
        shape: n.shape ?? 'rectangle',
      }),
    ),
    edges: base.edges.map(
      (e): VisualEdge<E> => ({
        ...e,
        x: e.x ?? 0,
        y: e.y ?? 0,
        width: e.width ?? 0,
        height: e.height ?? 0,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Get a node by id, or `undefined` if not found. */
export function getNode<N>(graph: Graph<N>, id: string): GraphNode<N> | undefined {
  const idx = getIndex(graph);
  const arrayIdx = idx.nodeById.get(id);
  return arrayIdx !== undefined ? graph.nodes[arrayIdx] : undefined;
}

/** Get an edge by id, or `undefined` if not found. */
export function getEdge<E>(graph: Graph<any, E>, id: string): GraphEdge<E> | undefined {
  const idx = getIndex(graph);
  const arrayIdx = idx.edgeById.get(id);
  return arrayIdx !== undefined ? graph.edges[arrayIdx] : undefined;
}

/** Check if a node exists in the graph. */
export function hasNode(graph: Graph, id: string): boolean {
  return getIndex(graph).nodeById.has(id);
}

/** Check if an edge exists in the graph. */
export function hasEdge(graph: Graph, id: string): boolean {
  return getIndex(graph).edgeById.has(id);
}

// ---------------------------------------------------------------------------
// Mutable operations — mutate the graph in place
// ---------------------------------------------------------------------------

/**
 * **Mutable.** Add a node to the graph. Mutates `graph.nodes` in place.
 * @returns The resolved node that was added.
 */
export function addNode<N>(graph: Graph<N>, config: NodeConfig<N>): GraphNode<N> {
  const idx = getIndex(graph);
  if (idx.nodeById.has(config.id)) {
    throw new Error(`Node "${config.id}" already exists`);
  }
  if (config.parentId != null && !idx.nodeById.has(config.parentId)) {
    throw new Error(`Parent node "${config.parentId}" does not exist`);
  }
  const node = resolveNode(config);
  const arrayIndex = graph.nodes.push(node) - 1;
  indexAddNode(idx, node, arrayIndex);
  return node;
}

/**
 * **Mutable.** Add an edge to the graph. Mutates `graph.edges` in place.
 * @returns The resolved edge that was added.
 */
export function addEdge<E>(graph: Graph<any, E>, config: EdgeConfig<E>): GraphEdge<E> {
  const idx = getIndex(graph);
  if (idx.edgeById.has(config.id)) {
    throw new Error(`Edge "${config.id}" already exists`);
  }
  if (!idx.nodeById.has(config.sourceId)) {
    throw new Error(`Source node "${config.sourceId}" does not exist`);
  }
  if (!idx.nodeById.has(config.targetId)) {
    throw new Error(`Target node "${config.targetId}" does not exist`);
  }
  const edge = resolveEdge(config);
  const arrayIndex = graph.edges.push(edge) - 1;
  indexAddEdge(idx, edge, arrayIndex);
  return edge;
}

/**
 * **Mutable.** Delete a node and its connected edges. Mutates `graph.nodes`
 * and `graph.edges` in place.
 *
 * By default, children are deleted recursively.
 * With `{ reparent: true }`, children are re-parented to the deleted node's parent.
 */
export function deleteNode(
  graph: Graph,
  id: string,
  opts?: DeleteNodeOptions,
): void {
  const node = getNode(graph, id);
  if (!node) {
    throw new Error(`Node "${id}" does not exist`);
  }

  if (opts?.reparent) {
    for (const n of graph.nodes) {
      if (n.parentId === id) {
        n.parentId = node.parentId;
      }
    }
    graph.nodes = graph.nodes.filter((n) => n.id !== id);
    graph.edges = graph.edges.filter(
      (e) => e.sourceId !== id && e.targetId !== id,
    );
  } else {
    const toDelete = collectDescendants(graph, id);
    graph.nodes = graph.nodes.filter((n) => !toDelete.has(n.id));
    graph.edges = graph.edges.filter(
      (e) => !toDelete.has(e.sourceId) && !toDelete.has(e.targetId),
    );
  }

  // Invalidate — filter creates new arrays, rebuild on next access
  invalidateIndex(graph);
}

/**
 * **Mutable.** Delete an edge. Mutates `graph.edges` in place.
 */
export function deleteEdge(graph: Graph, id: string): void {
  if (!hasEdge(graph, id)) {
    throw new Error(`Edge "${id}" does not exist`);
  }
  graph.edges = graph.edges.filter((e) => e.id !== id);
  invalidateIndex(graph);
}

/**
 * **Mutable.** Update a node in place.
 * @returns The updated node.
 */
export function updateNode<N>(
  graph: Graph<N>,
  id: string,
  update: Partial<Omit<NodeConfig<N>, 'id'>>,
): GraphNode<N> {
  const idx = getIndex(graph);
  const arrayIdx = idx.nodeById.get(id);
  if (arrayIdx === undefined) {
    throw new Error(`Node "${id}" does not exist`);
  }
  if (update.parentId !== undefined && update.parentId !== null) {
    if (!idx.nodeById.has(update.parentId)) {
      throw new Error(`Parent node "${update.parentId}" does not exist`);
    }
  }
  const node = graph.nodes[arrayIdx];
  const oldParentId = node.parentId;
  const updated: GraphNode<N> = {
    ...node,
    ...(update.parentId !== undefined && { parentId: update.parentId ?? null }),
    ...(update.initialNodeId !== undefined && { initialNodeId: update.initialNodeId ?? null }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  graph.nodes[arrayIdx] = updated;

  // Update hierarchy index if parentId changed
  if (update.parentId !== undefined && updated.parentId !== oldParentId) {
    indexReparentNode(idx, id, oldParentId, updated.parentId);
  }

  return updated;
}

/**
 * **Mutable.** Update an edge in place.
 * @returns The updated edge.
 */
export function updateEdge<E>(
  graph: Graph<any, E>,
  id: string,
  update: Partial<Omit<EdgeConfig<E>, 'id'>>,
): GraphEdge<E> {
  const idx = getIndex(graph);
  const arrayIdx = idx.edgeById.get(id);
  if (arrayIdx === undefined) {
    throw new Error(`Edge "${id}" does not exist`);
  }
  if (update.sourceId !== undefined && !idx.nodeById.has(update.sourceId)) {
    throw new Error(`Source node "${update.sourceId}" does not exist`);
  }
  if (update.targetId !== undefined && !idx.nodeById.has(update.targetId)) {
    throw new Error(`Target node "${update.targetId}" does not exist`);
  }
  const edge = graph.edges[arrayIdx];
  const oldSourceId = edge.sourceId;
  const oldTargetId = edge.targetId;
  const updated: GraphEdge<E> = {
    ...edge,
    ...(update.sourceId !== undefined && { sourceId: update.sourceId }),
    ...(update.targetId !== undefined && { targetId: update.targetId }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  graph.edges[arrayIdx] = updated;

  // Update adjacency index if endpoints changed
  if (updated.sourceId !== oldSourceId || updated.targetId !== oldTargetId) {
    indexUpdateEdgeEndpoints(idx, id, oldSourceId, oldTargetId, updated.sourceId, updated.targetId);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Batch mutable operations
// ---------------------------------------------------------------------------

/**
 * **Mutable.** Add multiple nodes and edges to the graph.
 * Nodes are added first, then edges (so edges can reference new nodes).
 */
export function addEntities<N, E>(
  graph: Graph<N, E>,
  entities: EntitiesConfig<N, E>,
): void {
  for (const nodeConfig of entities.nodes ?? []) {
    addNode(graph, nodeConfig);
  }
  for (const edgeConfig of entities.edges ?? []) {
    addEdge(graph, edgeConfig);
  }
}

/**
 * **Mutable.** Delete entities by id(s). Automatically detects whether each id
 * is a node or edge. Node deletions cascade to children and connected edges.
 */
export function deleteEntities(
  graph: Graph,
  ids: string | string[],
  opts?: DeleteNodeOptions,
): void {
  const idArray = Array.isArray(ids) ? ids : [ids];
  for (const id of idArray) {
    if (hasNode(graph, id)) {
      deleteNode(graph, id, opts);
    } else if (hasEdge(graph, id)) {
      deleteEdge(graph, id);
    }
  }
}

// ---------------------------------------------------------------------------
// Batch update operations
// ---------------------------------------------------------------------------

/**
 * **Mutable.** Update multiple nodes and edges in place.
 * Each entry must include an `id` to identify which entity to update.
 */
export function updateEntities<N, E>(
  graph: Graph<N, E>,
  updates: EntitiesUpdate<N, E>,
): void {
  for (const nodeUpdate of updates.nodes ?? []) {
    const { id, ...patch } = nodeUpdate;
    updateNode(graph, id, patch);
  }
  for (const edgeUpdate of updates.edges ?? []) {
    const { id, ...patch } = edgeUpdate;
    updateEdge(graph, id, patch);
  }
}

// ---------------------------------------------------------------------------
// Class wrapper
// ---------------------------------------------------------------------------

/**
 * OOP wrapper around a plain `Graph` object.
 * Delegates to the standalone mutable functions.
 */
export class GraphInstance<N = any, E = any, G = any> {
  public graph: Graph<N, E, G>;

  constructor(config?: GraphConfig<N, E, G>) {
    this.graph = createGraph(config);
  }

  /** Wrap an existing plain graph object. */
  static from<N = any, E = any, G = any>(
    graph: Graph<N, E, G>,
  ): GraphInstance<N, E, G> {
    const instance = Object.create(GraphInstance.prototype) as GraphInstance<N, E, G>;
    instance.graph = graph;
    return instance;
  }

  get id() { return this.graph.id; }
  get type() { return this.graph.type; }
  get nodes() { return this.graph.nodes; }
  get edges() { return this.graph.edges; }
  get data() { return this.graph.data; }

  getNode(id: string) { return getNode(this.graph, id); }
  getEdge(id: string) { return getEdge(this.graph, id); }
  hasNode(id: string) { return hasNode(this.graph, id); }
  hasEdge(id: string) { return hasEdge(this.graph, id); }

  addNode(config: NodeConfig<N>) { return addNode(this.graph, config); }
  addEdge(config: EdgeConfig<E>) { return addEdge(this.graph, config); }
  deleteNode(id: string, opts?: DeleteNodeOptions) { return deleteNode(this.graph, id, opts); }
  deleteEdge(id: string) { return deleteEdge(this.graph, id); }
  updateNode(id: string, update: Partial<Omit<NodeConfig<N>, 'id'>>) { return updateNode(this.graph, id, update); }
  updateEdge(id: string, update: Partial<Omit<EdgeConfig<E>, 'id'>>) { return updateEdge(this.graph, id, update); }

  addEntities(entities: EntitiesConfig<N, E>) { return addEntities(this.graph, entities); }
  deleteEntities(ids: string | string[], opts?: DeleteNodeOptions) { return deleteEntities(this.graph, ids, opts); }
  updateEntities(updates: EntitiesUpdate<N, E>) { return updateEntities(this.graph, updates); }

  toJSON() { return this.graph; }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function collectDescendants(graph: Graph, id: string): Set<string> {
  const idx = getIndex(graph);
  const toDelete = new Set<string>();
  const walk = (nodeId: string) => {
    toDelete.add(nodeId);
    const childIds = idx.childNodes.get(nodeId) ?? [];
    for (const childId of childIds) {
      if (!toDelete.has(childId)) {
        walk(childId);
      }
    }
  };
  walk(id);
  return toDelete;
}
