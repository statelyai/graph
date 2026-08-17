import type {
  GraphConfig,
  NodeConfig,
  EdgeConfig,
  PortConfig,
  Graph,
  GraphNode,
  GraphEdge,
  GraphPort,
  DeleteNodeOptions,
  EntitiesConfig,
  EntitiesUpdate,
  VisualGraphConfig,
  VisualGraph,
  VisualNode,
  VisualEdge,
  VisualPort,
  TransitionOptions,
  NodeUpdate,
  EdgeUpdate,
} from './types';
import {
  getIndex,
  invalidateIndex,
  indexAddNode,
  indexAddEdge,
  indexReparentNode,
  indexReplaceNode,
  indexUpdateEdgeEndpoints,
  touchIndex,
} from './indexing';

/**
 * Create a resolved graph port from a config. Fills in defaults.
 *
 * @example
 * ```ts
 * const port = createGraphPort({ name: 'output', direction: 'out' });
 * // { name: 'output', direction: 'out', data: null }
 * ```
 */
export function createGraphPort<P = any>(
  config: PortConfig<P>,
): GraphPort<P> {
  if (!config.name) throw new Error('Port name must be a non-empty string');
  const port: GraphPort<P> = {
    name: config.name,
    direction: config.direction ?? 'inout',
    data: (config.data ?? null) as P,
  };
  if (config.label !== undefined) port.label = config.label;
  if (config.x !== undefined) port.x = config.x;
  if (config.y !== undefined) port.y = config.y;
  if (config.width !== undefined) port.width = config.width;
  if (config.height !== undefined) port.height = config.height;
  if (config.style !== undefined) port.style = config.style;
  return port;
}

function validatePortNames(ports: PortConfig[]): void {
  const seen = new Set<string>();
  for (const port of ports) {
    if (seen.has(port.name)) {
      throw new Error(`Duplicate port name "${port.name}" on node`);
    }
    seen.add(port.name);
  }
}

function validateNodeReference(
  nodeIds: Set<string>,
  ref: string | null | undefined,
  message: (ref: string) => string,
): void {
  if (ref != null && !nodeIds.has(ref)) {
    throw new Error(message(ref));
  }
}

/**
 * Create a resolved graph node from a config. Fills in defaults.
 *
 * @example
 * ```ts
 * const node = createGraphNode({ id: 'a', data: { label: 'hi' } });
 * // { type: 'node', id: 'a', label: '', data: { label: 'hi' } }
 * ```
 */
export function createGraphNode<N = any, P = any>(
  config: NodeConfig<N, P>,
): GraphNode<N, P> {
  if (!config.id) throw new Error('Node id must be a non-empty string');
  if (config.parentId === '')
    throw new Error('Node parentId must be a non-empty string');
  const node: GraphNode<N, P> = {
    type: 'node',
    id: config.id,
    ...(config.parentId !== undefined && { parentId: config.parentId ?? null }),
    ...(config.initialNodeId !== undefined && {
      initialNodeId: config.initialNodeId ?? null,
    }),
    label: config.label ?? null,
    data: (config.data ?? null) as N,
  };
  if (config.ports !== undefined && config.ports.length > 0) {
    validatePortNames(config.ports);
    node.ports = config.ports.map(createGraphPort);
  }
  if (config.x !== undefined) node.x = config.x;
  if (config.y !== undefined) node.y = config.y;
  if (config.width !== undefined) node.width = config.width;
  if (config.height !== undefined) node.height = config.height;
  if (config.shape !== undefined) node.shape = config.shape;
  if (config.color !== undefined) node.color = config.color;
  if (config.style !== undefined) node.style = config.style;
  return node;
}

/**
 * Create a resolved graph edge from a config. Fills in defaults.
 *
 * @example
 * ```ts
 * const edge = createGraphEdge({ id: 'e1', sourceId: 'a', targetId: 'b' });
 * // { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: null, data: null }
 * ```
 */
export function createGraphEdge<T = any>(config: EdgeConfig<T>): GraphEdge<T> {
  if (!config.id) throw new Error('Edge id must be a non-empty string');
  if (!config.sourceId)
    throw new Error('Edge sourceId must be a non-empty string');
  if (!config.targetId)
    throw new Error('Edge targetId must be a non-empty string');
  const edge: GraphEdge<T> = {
    type: 'edge',
    id: config.id,
    sourceId: config.sourceId,
    targetId: config.targetId,
    label: config.label ?? null,
    data: (config.data ?? null) as T,
  };
  if (config.sourcePort !== undefined) edge.sourcePort = config.sourcePort;
  if (config.targetPort !== undefined) edge.targetPort = config.targetPort;
  if (config.mode !== undefined) edge.mode = config.mode;
  if (config.weight !== undefined) edge.weight = config.weight;
  if (config.points !== undefined)
    edge.points = config.points.map((p) => ({ ...p }));
  if (config.routing !== undefined) edge.routing = config.routing;
  if (config.x !== undefined) edge.x = config.x;
  if (config.y !== undefined) edge.y = config.y;
  if (config.width !== undefined) edge.width = config.width;
  if (config.height !== undefined) edge.height = config.height;
  if (config.color !== undefined) edge.color = config.color;
  if (config.style !== undefined) edge.style = config.style;
  return edge;
}

// Factory

/**
 * Create a graph from a config. Resolves defaults for all fields.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * ```
 */
export function createGraph<N = any, E = any, G = any, P = any>(
  config?: GraphConfig<N, E, G, P>,
): Graph<N, E, G, P> {
  const graph: Graph<N, E, G, P> = {
    id: config?.id ?? '',
    mode: config?.mode ?? 'directed',
    initialNodeId: config?.initialNodeId ?? null,
    nodes: (config?.nodes ?? []).map(createGraphNode),
    edges: (config?.edges ?? []).map(createGraphEdge),
    data: (config?.data ?? null) as G,
  };
  if (config?.direction !== undefined) graph.direction = config.direction;
  if (config?.style !== undefined) graph.style = config.style;
  return graph;
}

/**
 * Create a visual graph with required position/size on all nodes and edges.
 *
 * @example
 * ```ts
 * const graph = createVisualGraph({
 *   nodes: [{ id: 'a', x: 0, y: 0, width: 100, height: 50 }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'a', x: 0, y: 0, width: 0, height: 0 }],
 * });
 * // graph.nodes[0].x === 0
 * ```
 */
export function createVisualGraph<N = any, E = any, G = any, P = any>(
  config?: VisualGraphConfig<N, E, G, P>,
): VisualGraph<N, E, G, P> {
  const base = createGraph(config);
  return {
    ...base,
    direction: config?.direction ?? 'down',
    nodes: base.nodes.map((n): VisualNode<N, P> => {
      const { ports, ...rest } = n;
      return {
        ...rest,
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? 0,
        height: n.height ?? 0,
        ...(n.shape !== undefined && { shape: n.shape }),
        ...(ports !== undefined && {
          ports: ports.map(
            (p): VisualPort<P> => ({
              ...p,
              x: p.x ?? 0,
              y: p.y ?? 0,
              width: p.width ?? 0,
              height: p.height ?? 0,
            }),
          ),
        }),
      };
    }),
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

/**
 * Create a graph by BFS exploration of a transition function.
 * Each unique state becomes a node; each (state, event) -> nextState becomes an edge.
 *
 * - Node IDs are determined by `serializeState` (default: `JSON.stringify`).
 * - Edge IDs use the format `sourceId|serializedEvent|targetId` for uniqueness
 *   and debuggability. Edge labels are just the serialized event string.
 *
 * @example
 * ```ts
 * const graph = createGraphFromTransition(
 *   (state, event) => {
 *     if (state === 'green' && event === 'TIMER') return 'yellow';
 *     if (state === 'yellow' && event === 'TIMER') return 'red';
 *     if (state === 'red' && event === 'TIMER') return 'green';
 *     return state;
 *   },
 *   {
 *     initialState: 'green',
 *     events: ['TIMER'],
 *     serializeState: (s) => s,
 *     serializeEvent: (e) => e,
 *   },
 * );
 * // graph.nodes.length === 3
 * ```
 */
export function createGraphFromTransition<TState, TEvent>(
  transition: (state: TState, event: TEvent) => TState,
  options: TransitionOptions<TState, TEvent>,
): Graph<TState, TEvent> {
  const serializeState = options.serializeState ?? JSON.stringify;
  const serializeEvent = options.serializeEvent ?? JSON.stringify;
  const limit = options.limit ?? Infinity;
  const getEvents =
    typeof options.events === 'function'
      ? options.events
      : () => options.events as TEvent[];

  const nodes: NodeConfig<TState>[] = [];
  const edges: EdgeConfig<TEvent>[] = [];
  const visited = new Set<string>();
  const edgeSet = new Set<string>();
  const queue: TState[] = [options.initialState];

  const initialStateId = serializeState(options.initialState);
  visited.add(initialStateId);
  nodes.push({
    id: initialStateId,
    label: initialStateId,
    data: options.initialState,
  });

  let iterations = 0;

  while (queue.length > 0) {
    const state = queue.shift()!;
    const stateId = serializeState(state);

    if (++iterations > limit) {
      throw new Error('Traversal limit exceeded');
    }

    if (options.stopWhen?.(state)) {
      continue;
    }

    const events = getEvents(state);
    for (const event of events) {
      const nextState = transition(state, event);
      const nextStateId = serializeState(nextState);
      const eventStr = serializeEvent(event);

      if (!visited.has(nextStateId)) {
        visited.add(nextStateId);
        nodes.push({ id: nextStateId, label: nextStateId, data: nextState });
        queue.push(nextState);
      }

      const edgeKey = `${stateId}|${eventStr}|${nextStateId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({
          id: edgeKey,
          sourceId: stateId,
          targetId: nextStateId,
          label: eventStr,
          data: event,
        });
      }
    }
  }

  return createGraph({
    id: options.id ?? '',
    mode: 'directed',
    initialNodeId: initialStateId,
    nodes,
    edges,
  });
}

// Lookup helpers

/**
 * Get a node by id, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const graph = createGraph({ nodes: [{ id: 'a' }] });
 * const node = getNode(graph, 'a'); // GraphNode
 * const missing = getNode(graph, 'z'); // undefined
 * ```
 */
export function getNode<N>(
  graph: Graph<N>,
  id: string,
): GraphNode<N> | undefined {
  const idx = getIndex(graph);
  const arrayIdx = idx.nodeById.get(id);
  return arrayIdx !== undefined ? graph.nodes[arrayIdx] : undefined;
}

/**
 * Get an edge by id, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * const edge = getEdge(graph, 'e1'); // GraphEdge
 * const missing = getEdge(graph, 'z'); // undefined
 * ```
 */
export function getEdge<N, E>(
  graph: Graph<N, E>,
  id: string,
): GraphEdge<E> | undefined {
  const idx = getIndex(graph);
  const arrayIdx = idx.edgeById.get(id);
  return arrayIdx !== undefined ? graph.edges[arrayIdx] : undefined;
}

/**
 * Check if a node exists in the graph.
 *
 * @example
 * ```ts
 * const graph = createGraph({ nodes: [{ id: 'a' }] });
 * hasNode(graph, 'a'); // true
 * hasNode(graph, 'z'); // false
 * ```
 */
export function hasNode(graph: Graph, id: string): boolean {
  return getIndex(graph).nodeById.has(id);
}

/**
 * Check if an edge exists in the graph.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * hasEdge(graph, 'e1'); // true
 * hasEdge(graph, 'z'); // false
 * ```
 */
export function hasEdge(graph: Graph, id: string): boolean {
  return getIndex(graph).edgeById.has(id);
}

// Mutable operations — mutate the graph in place

/**
 * **Mutable.** Add a node to the graph. Mutates `graph.nodes` in place.
 * @returns The resolved node that was added.
 *
 * @example
 * ```ts
 * const graph = createGraph();
 * const node = addNode(graph, { id: 'a', label: 'Node A' });
 * // graph.nodes.length === 1
 * ```
 */
export function addNode<N, P = any>(
  graph: Graph<N, any, any, P>,
  config: NodeConfig<N, P>,
): GraphNode<N, P> {
  const node = createGraphNode(config);
  const idx = getIndex(graph);
  if (idx.nodeById.has(config.id)) {
    throw new Error(`Node "${config.id}" already exists`);
  }
  if (config.parentId && !idx.nodeById.has(config.parentId)) {
    throw new Error(`Parent node "${config.parentId}" does not exist`);
  }
  validateNodeReference(
    new Set([...idx.nodeById.keys(), config.id]),
    config.initialNodeId,
    (initialNodeId) => `Initial node "${initialNodeId}" does not exist`,
  );
  const arrayIndex = graph.nodes.push(node) - 1;
  indexAddNode(idx, node, arrayIndex);
  return node;
}

/**
 * **Mutable.** Add an edge to the graph. Mutates `graph.edges` in place.
 * @returns The resolved edge that was added.
 *
 * @example
 * ```ts
 * const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
 * const edge = addEdge(graph, { id: 'e1', sourceId: 'a', targetId: 'b' });
 * // graph.edges.length === 1
 * ```
 */
export function addEdge<N, E>(
  graph: Graph<N, E>,
  config: EdgeConfig<E>,
): GraphEdge<E> {
  const edge = createGraphEdge(config);
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
  // Validate port references
  if (config.sourcePort !== undefined) {
    const sourceNode = graph.nodes[idx.nodeById.get(config.sourceId)!];
    if (!sourceNode.ports?.some((p) => p.name === config.sourcePort)) {
      throw new Error(
        `Port "${config.sourcePort}" does not exist on source node "${config.sourceId}"`,
      );
    }
  }
  if (config.targetPort !== undefined) {
    const targetNode = graph.nodes[idx.nodeById.get(config.targetId)!];
    if (!targetNode.ports?.some((p) => p.name === config.targetPort)) {
      throw new Error(
        `Port "${config.targetPort}" does not exist on target node "${config.targetId}"`,
      );
    }
  }
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
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * deleteNode(graph, 'a');
 * // graph.nodes.length === 1, edge e1 also removed
 * ```
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
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * deleteEdge(graph, 'e1');
 * // graph.edges.length === 0
 * ```
 */
export function deleteEdge(graph: Graph, id: string): void {
  if (!hasEdge(graph, id)) {
    throw new Error(`Edge "${id}" does not exist`);
  }
  graph.edges = graph.edges.filter((e) => e.id !== id);
  invalidateIndex(graph);
}

/** Optional fields where `null` in an update unsets the field. */
const NODE_OPTIONAL_KEYS = [
  'x',
  'y',
  'width',
  'height',
  'shape',
  'color',
  'style',
] as const;

const EDGE_OPTIONAL_KEYS = [
  'weight',
  'mode',
  'points',
  'routing',
  'x',
  'y',
  'width',
  'height',
  'color',
  'style',
] as const;

/** Apply optional-field updates: `null` unsets, a value sets, `undefined` is ignored. */
function applyOptionalUpdates(
  target: Record<string, any>,
  update: Record<string, any>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const value = update[key];
    if (value === undefined) continue;
    if (value === null) delete target[key];
    else target[key] = value;
  }
}

/**
 * **Mutable.** Update a node in place.
 * Optional fields (`x`, `y`, `width`, `height`, `shape`, `color`, `style`,
 * `ports`) accept `null` to unset; `undefined` leaves them unchanged.
 * @returns The updated node.
 *
 * @example
 * ```ts
 * const graph = createGraph({ nodes: [{ id: 'a', label: 'old' }] });
 * const updated = updateNode(graph, 'a', { label: 'new', x: 100 });
 * // updated.label === 'new', updated.x === 100
 * ```
 */
export function updateNode<N, P = any>(
  graph: Graph<N, any, any, P>,
  id: string,
  update: NodeUpdate<N, P>,
): GraphNode<N, P> {
  const idx = getIndex(graph);
  const arrayIdx = idx.nodeById.get(id);
  if (arrayIdx === undefined) {
    throw new Error(`Node "${id}" does not exist`);
  }
  if (update.parentId !== undefined && update.parentId !== null) {
    if (!idx.nodeById.has(update.parentId)) {
      throw new Error(`Parent node "${update.parentId}" does not exist`);
    }
    // Reject hierarchy cycles: the new parent must not be the node itself or
    // one of its descendants — queries like getAncestors would loop forever.
    // The seen-set guards against pre-existing (authored) parent cycles not
    // involving `id`, which would otherwise make this walk spin forever.
    let ancestorId: string | null = update.parentId;
    const seen = new Set<string>();
    while (ancestorId !== null && !seen.has(ancestorId)) {
      if (ancestorId === id) {
        throw new Error(
          `Cannot set parentId of node "${id}" to "${update.parentId}": ` +
            `"${update.parentId}" is "${id}" or one of its descendants, which would create a hierarchy cycle. ` +
            `Reparent "${update.parentId}" elsewhere first.`,
        );
      }
      seen.add(ancestorId);
      const ai = idx.nodeById.get(ancestorId);
      ancestorId =
        ai !== undefined ? (graph.nodes[ai].parentId ?? null) : null;
    }
  }
  validateNodeReference(
    new Set(idx.nodeById.keys()),
    update.initialNodeId,
    (initialNodeId) => `Initial node "${initialNodeId}" does not exist`,
  );
  if (update.ports != null && update.ports.length > 0) {
    validatePortNames(update.ports);
  }
  const node = graph.nodes[arrayIdx];
  // Replacing/removing ports must not orphan edge port references
  if (update.ports !== undefined) {
    const newPortNames = new Set((update.ports ?? []).map((p) => p.name));
    for (const eid of idx.outEdges.get(id) ?? []) {
      const e = graph.edges[idx.edgeById.get(eid)!];
      if (e.sourcePort !== undefined && !newPortNames.has(e.sourcePort)) {
        throw new Error(
          `Cannot update ports of node "${id}": edge "${e.id}" references port "${e.sourcePort}" via sourcePort. ` +
            `Keep that port, or update/delete the edge first.`,
        );
      }
    }
    for (const eid of idx.inEdges.get(id) ?? []) {
      const e = graph.edges[idx.edgeById.get(eid)!];
      if (e.targetPort !== undefined && !newPortNames.has(e.targetPort)) {
        throw new Error(
          `Cannot update ports of node "${id}": edge "${e.id}" references port "${e.targetPort}" via targetPort. ` +
            `Keep that port, or update/delete the edge first.`,
        );
      }
    }
  }
  const oldParentId = node.parentId;
  const updated: GraphNode<N, P> = {
    ...node,
    ...(update.parentId !== undefined && { parentId: update.parentId ?? null }),
    ...(update.initialNodeId !== undefined && {
      initialNodeId: update.initialNodeId ?? null,
    }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  if (update.ports !== undefined) {
    if (update.ports === null) delete updated.ports;
    else updated.ports = update.ports.map(createGraphPort);
  }
  applyOptionalUpdates(updated, update, NODE_OPTIONAL_KEYS);
  graph.nodes[arrayIdx] = updated;
  // Derived caches holding node objects (CSR snapshot) patch this slot
  indexReplaceNode(idx, arrayIdx, updated);

  // Update hierarchy index if parentId changed
  if (update.parentId !== undefined && updated.parentId !== oldParentId) {
    indexReparentNode(idx, id, oldParentId, updated.parentId);
  }

  return updated;
}

/**
 * **Mutable.** Update an edge in place.
 * Optional fields (`weight`, `mode`, `sourcePort`, `targetPort`, `x`, `y`,
 * `width`, `height`, `color`, `style`) accept `null` to unset; `undefined`
 * leaves them unchanged.
 * @returns The updated edge.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'old' }],
 * });
 * const updated = updateEdge(graph, 'e1', { label: 'new', weight: 2 });
 * // updated.label === 'new', updated.weight === 2
 * ```
 */
export function updateEdge<N, E>(
  graph: Graph<N, E>,
  id: string,
  update: EdgeUpdate<E>,
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
  // Validate port references against the *effective* endpoints, including
  // port references kept from the existing edge when only an endpoint changes
  const effectiveSourceId = update.sourceId ?? edge.sourceId;
  const effectiveTargetId = update.targetId ?? edge.targetId;
  const effectiveSourcePort =
    update.sourcePort !== undefined
      ? (update.sourcePort ?? undefined)
      : edge.sourcePort;
  const effectiveTargetPort =
    update.targetPort !== undefined
      ? (update.targetPort ?? undefined)
      : edge.targetPort;
  if (effectiveSourcePort !== undefined) {
    const sourceNode = graph.nodes[idx.nodeById.get(effectiveSourceId)!];
    if (!sourceNode.ports?.some((p) => p.name === effectiveSourcePort)) {
      throw new Error(
        update.sourcePort !== undefined
          ? `Port "${effectiveSourcePort}" does not exist on source node "${effectiveSourceId}"`
          : `Cannot update edge "${id}": its sourcePort "${effectiveSourcePort}" does not exist on the new source node "${effectiveSourceId}". ` +
            `Include sourcePort in the update (a port on "${effectiveSourceId}", or null to clear it).`,
      );
    }
  }
  if (effectiveTargetPort !== undefined) {
    const targetNode = graph.nodes[idx.nodeById.get(effectiveTargetId)!];
    if (!targetNode.ports?.some((p) => p.name === effectiveTargetPort)) {
      throw new Error(
        update.targetPort !== undefined
          ? `Port "${effectiveTargetPort}" does not exist on target node "${effectiveTargetId}"`
          : `Cannot update edge "${id}": its targetPort "${effectiveTargetPort}" does not exist on the new target node "${effectiveTargetId}". ` +
            `Include targetPort in the update (a port on "${effectiveTargetId}", or null to clear it).`,
      );
    }
  }
  const updated: GraphEdge<E> = {
    ...edge,
    ...(update.sourceId !== undefined && { sourceId: update.sourceId }),
    ...(update.targetId !== undefined && { targetId: update.targetId }),
    ...(update.label !== undefined && { label: update.label }),
    ...(update.data !== undefined && { data: update.data }),
  };
  if (update.sourcePort !== undefined) {
    if (update.sourcePort === null) delete updated.sourcePort;
    else updated.sourcePort = update.sourcePort;
  }
  if (update.targetPort !== undefined) {
    if (update.targetPort === null) delete updated.targetPort;
    else updated.targetPort = update.targetPort;
  }
  applyOptionalUpdates(updated, update, EDGE_OPTIONAL_KEYS);
  graph.edges[arrayIdx] = updated;

  // Mode changes alter derived traversal caches (CSR arcs); weight changes
  // alter the CSR's cached negative-weight flag
  if (update.mode !== undefined || update.weight !== undefined) {
    touchIndex(idx);
  }

  // Update adjacency index if endpoints changed
  if (updated.sourceId !== oldSourceId || updated.targetId !== oldTargetId) {
    indexUpdateEdgeEndpoints(
      idx,
      id,
      oldSourceId,
      oldTargetId,
      updated.sourceId,
      updated.targetId,
    );
  }

  return updated;
}

// Batch mutable operations

/**
 * **Mutable.** Add multiple nodes and edges to the graph.
 * Nodes are added first, then edges (so edges can reference new nodes).
 *
 * @example
 * ```ts
 * const graph = createGraph();
 * addEntities(graph, {
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * // graph.nodes.length === 2, graph.edges.length === 1
 * ```
 */
export function addEntities<N, E>(
  graph: Graph<N, E>,
  entities: EntitiesConfig<N, E>,
): void {
  const nodeConfigs = entities.nodes ?? [];
  if (nodeConfigs.length > 0) {
    const idx = getIndex(graph);
    const nodeIds = new Set(idx.nodeById.keys());
    for (const nodeConfig of nodeConfigs) {
      if (nodeIds.has(nodeConfig.id)) {
        throw new Error(`Node "${nodeConfig.id}" already exists`);
      }
      nodeIds.add(nodeConfig.id);
    }
    const nodes = nodeConfigs.map(createGraphNode);
    for (const nodeConfig of nodeConfigs) {
      validateNodeReference(
        nodeIds,
        nodeConfig.parentId,
        (parentId) => `Parent node "${parentId}" does not exist`,
      );
      validateNodeReference(
        nodeIds,
        nodeConfig.initialNodeId,
        (initialNodeId) => `Initial node "${initialNodeId}" does not exist`,
      );
    }
    for (const node of nodes) {
      const arrayIndex = graph.nodes.push(node) - 1;
      indexAddNode(idx, node, arrayIndex);
    }
  }
  for (const edgeConfig of entities.edges ?? []) {
    addEdge(graph, edgeConfig);
  }
}

/**
 * **Mutable.** Delete entities by id(s). Automatically detects whether each id
 * is a node or edge. Node deletions cascade to children and connected edges.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * deleteEntities(graph, ['a', 'e1']);
 * // graph.nodes.length === 1, graph.edges.length === 0
 * ```
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

// Batch update operations

/**
 * **Mutable.** Update multiple nodes and edges in place.
 * Each entry must include an `id` to identify which entity to update.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a', label: 'old' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'a', label: 'old' }],
 * });
 * updateEntities(graph, {
 *   nodes: [{ id: 'a', label: 'new' }],
 *   edges: [{ id: 'e1', label: 'new' }],
 * });
 * ```
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

// Immutable operations — return a graph copy and leave the input untouched

function getGraphMutationCopy<N, E, G, P>(
  graph: Graph<N, E, G, P>,
): Graph<N, E, G, P> {
  return {
    ...graph,
    nodes: [...graph.nodes],
    edges: [...graph.edges],
  };
}

/** Return a graph copy with a node added. */
export function getGraphWithNode<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  config: NodeConfig<N, P>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  addNode(next, config);
  return next;
}

/** Return a graph copy with an edge added. */
export function getGraphWithEdge<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  config: EdgeConfig<E>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  addEdge(next, config);
  return next;
}

/** Return a graph copy without a node and its connected edges. */
export function getGraphWithoutNode<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  id: string,
  opts?: DeleteNodeOptions,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  if (opts?.reparent) {
    next.nodes = graph.nodes.map((node) => ({ ...node }));
  }
  deleteNode(next, id, opts);
  return next;
}

/** Return a graph copy without an edge. */
export function getGraphWithoutEdge<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  id: string,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  deleteEdge(next, id);
  return next;
}

/** Return a graph copy with a node updated. */
export function getGraphWithUpdatedNode<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  id: string,
  update: NodeUpdate<N, P>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  updateNode(next, id, update);
  return next;
}

/** Return a graph copy with an edge updated. */
export function getGraphWithUpdatedEdge<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  id: string,
  update: EdgeUpdate<E>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  updateEdge(next, id, update);
  return next;
}

/** Return a graph copy with multiple nodes and edges added. */
export function getGraphWithEntities<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  entities: EntitiesConfig<N, E, P>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  addEntities(next, entities);
  return next;
}

/** Return a graph copy without the identified nodes and edges. */
export function getGraphWithoutEntities<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  ids: string | string[],
  opts?: DeleteNodeOptions,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  if (opts?.reparent) {
    next.nodes = graph.nodes.map((node) => ({ ...node }));
  }
  deleteEntities(next, ids, opts);
  return next;
}

/** Return a graph copy with multiple nodes and edges updated. */
export function getGraphWithUpdatedEntities<
  N = any,
  E = any,
  G = any,
  P = any,
>(
  graph: Graph<N, E, G, P>,
  updates: EntitiesUpdate<N, E, P>,
): Graph<N, E, G, P> {
  const next = getGraphMutationCopy(graph);
  updateEntities(next, updates);
  return next;
}

// Class wrapper

/**
 * OOP wrapper around a plain `Graph` object.
 * Delegates to the standalone mutable functions.
 *
 * @example
 * ```ts
 * const instance = new GraphInstance({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * instance.addNode({ id: 'c' });
 * instance.hasNode('c'); // true
 * instance.toJSON(); // plain Graph object
 * ```
 */
export class GraphInstance<N = any, E = any, G = any, P = any> {
  public graph: Graph<N, E, G, P>;

  constructor(config?: GraphConfig<N, E, G, P>) {
    this.graph = createGraph(config);
  }

  /**
   * Wrap an existing plain graph object.
   *
   * @example
   * ```ts
   * const graph = createGraph({ nodes: [{ id: 'a' }] });
   * const instance = GraphInstance.from(graph);
   * instance.hasNode('a'); // true
   * ```
   */
  static from<N = any, E = any, G = any, P = any>(
    graph: Graph<N, E, G, P>,
  ): GraphInstance<N, E, G, P> {
    const instance = Object.create(
      GraphInstance.prototype,
    ) as GraphInstance<N, E, G, P>;
    instance.graph = graph;
    return instance;
  }

  get id() {
    return this.graph.id;
  }
  /** Default directedness for all edges. */
  get mode() {
    return this.graph.mode;
  }
  get nodes() {
    return this.graph.nodes;
  }
  get edges() {
    return this.graph.edges;
  }
  get data() {
    return this.graph.data;
  }

  getNode(id: string) {
    return getNode(this.graph, id);
  }
  getEdge(id: string) {
    return getEdge(this.graph, id);
  }
  hasNode(id: string) {
    return hasNode(this.graph, id);
  }
  hasEdge(id: string) {
    return hasEdge(this.graph, id);
  }

  addNode(config: NodeConfig<N, P>) {
    return addNode(this.graph, config);
  }
  addEdge(config: EdgeConfig<E>) {
    return addEdge(this.graph, config);
  }
  deleteNode(id: string, opts?: DeleteNodeOptions) {
    return deleteNode(this.graph, id, opts);
  }
  deleteEdge(id: string) {
    return deleteEdge(this.graph, id);
  }
  updateNode(id: string, update: NodeUpdate<N, P>) {
    return updateNode(this.graph, id, update);
  }
  updateEdge(id: string, update: EdgeUpdate<E>) {
    return updateEdge(this.graph, id, update);
  }

  addEntities(entities: EntitiesConfig<N, E, P>) {
    return addEntities(this.graph, entities);
  }
  deleteEntities(ids: string | string[], opts?: DeleteNodeOptions) {
    return deleteEntities(this.graph, ids, opts);
  }
  updateEntities(updates: EntitiesUpdate<N, E, P>) {
    return updateEntities(this.graph, updates);
  }

  toJSON() {
    return this.graph;
  }
}

// Internal helpers

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
