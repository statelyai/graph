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
} from './types';

function resolveNode<T>(config: NodeConfig<T>): GraphNode<T> {
  return {
    type: 'node',
    id: config.id,
    parentId: config.parentId ?? null,
    initialNodeId: config.initialNodeId ?? null,
    label: config.label ?? '',
    data: config.data as T,
  };
}

function resolveEdge<T>(config: EdgeConfig<T>): GraphEdge<T> {
  return {
    type: 'edge',
    id: config.id,
    sourceId: config.sourceId,
    targetId: config.targetId,
    label: config.label ?? '',
    data: config.data as T,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a graph from a config. Resolves defaults for all fields. */
export function createGraph<N = any, E = any, G = any>(
  config?: GraphConfig<N, E, G>,
): Graph<N, E, G> {
  return {
    id: config?.id ?? '',
    type: config?.type ?? 'directed',
    initialNodeId: config?.initialNodeId ?? null,
    nodes: (config?.nodes ?? []).map(resolveNode),
    edges: (config?.edges ?? []).map(resolveEdge),
    data: (config?.data ?? undefined) as G,
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Get a node by id, or `undefined` if not found. */
export function getNode<N>(graph: Graph<N>, id: string): GraphNode<N> | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Get an edge by id, or `undefined` if not found. */
export function getEdge<E>(graph: Graph<any, E>, id: string): GraphEdge<E> | undefined {
  return graph.edges.find((e) => e.id === id);
}

/** Check if a node exists in the graph. */
export function hasNode(graph: Graph, id: string): boolean {
  return graph.nodes.some((n) => n.id === id);
}

/** Check if an edge exists in the graph. */
export function hasEdge(graph: Graph, id: string): boolean {
  return graph.edges.some((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Mutable operations — mutate the graph in place
// ---------------------------------------------------------------------------

/**
 * **Mutable.** Add a node to the graph. Mutates `graph.nodes` in place.
 * @returns The resolved node that was added.
 */
export function addNode<N>(graph: Graph<N>, config: NodeConfig<N>): GraphNode<N> {
  if (hasNode(graph, config.id)) {
    throw new Error(`Node "${config.id}" already exists`);
  }
  if (config.parentId != null && !hasNode(graph, config.parentId)) {
    throw new Error(`Parent node "${config.parentId}" does not exist`);
  }
  const node = resolveNode(config);
  graph.nodes.push(node);
  return node;
}

/**
 * **Mutable.** Add an edge to the graph. Mutates `graph.edges` in place.
 * @returns The resolved edge that was added.
 */
export function addEdge<E>(graph: Graph<any, E>, config: EdgeConfig<E>): GraphEdge<E> {
  if (hasEdge(graph, config.id)) {
    throw new Error(`Edge "${config.id}" already exists`);
  }
  if (!hasNode(graph, config.sourceId)) {
    throw new Error(`Source node "${config.sourceId}" does not exist`);
  }
  if (!hasNode(graph, config.targetId)) {
    throw new Error(`Target node "${config.targetId}" does not exist`);
  }
  const edge = resolveEdge(config);
  graph.edges.push(edge);
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
}

/**
 * **Mutable.** Delete an edge. Mutates `graph.edges` in place.
 */
export function deleteEdge(graph: Graph, id: string): void {
  if (!hasEdge(graph, id)) {
    throw new Error(`Edge "${id}" does not exist`);
  }
  graph.edges = graph.edges.filter((e) => e.id !== id);
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
  const idx = graph.nodes.findIndex((n) => n.id === id);
  if (idx === -1) {
    throw new Error(`Node "${id}" does not exist`);
  }
  if (update.parentId !== undefined && update.parentId !== null) {
    if (!hasNode(graph, update.parentId)) {
      throw new Error(`Parent node "${update.parentId}" does not exist`);
    }
  }
  const node = graph.nodes[idx];
  const updated: GraphNode<N> = {
    ...node,
    ...(update.parentId !== undefined && { parentId: update.parentId ?? null }),
    ...(update.initialNodeId !== undefined && { initialNodeId: update.initialNodeId ?? null }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  graph.nodes[idx] = updated;
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
  const idx = graph.edges.findIndex((e) => e.id === id);
  if (idx === -1) {
    throw new Error(`Edge "${id}" does not exist`);
  }
  if (update.sourceId !== undefined && !hasNode(graph, update.sourceId)) {
    throw new Error(`Source node "${update.sourceId}" does not exist`);
  }
  if (update.targetId !== undefined && !hasNode(graph, update.targetId)) {
    throw new Error(`Target node "${update.targetId}" does not exist`);
  }
  const edge = graph.edges[idx];
  const updated: GraphEdge<E> = {
    ...edge,
    ...(update.sourceId !== undefined && { sourceId: update.sourceId }),
    ...(update.targetId !== undefined && { targetId: update.targetId }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  graph.edges[idx] = updated;
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
  const toDelete = new Set<string>();
  const walk = (nodeId: string) => {
    toDelete.add(nodeId);
    for (const n of graph.nodes) {
      if (n.parentId === nodeId && !toDelete.has(n.id)) {
        walk(n.id);
      }
    }
  };
  walk(id);
  return toDelete;
}
