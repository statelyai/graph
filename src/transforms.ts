import type {
  EdgeConfig,
  Graph,
  GraphEdge,
  GraphNode,
  NodeConfig,
} from './types';
import { getIndex } from './indexing';
import { createGraph } from './graph';
import { toNodeConfig, toEdgeConfig } from './config';
import { getEdgeMode } from './mode';

/**
 * Flattens a hierarchical graph into a flat graph with only leaf nodes.
 *
 * - Edges targeting a compound node resolve to its initial child (recursively).
 * - Edges originating from a compound node expand to all leaf descendants.
 * - Only leaf nodes (nodes with no children) appear in the result.
 * - Duplicate edges (same source + target) are deduplicated.
 *
 * @example
 * ```ts
 * import { createGraph, getFlattenedGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'parent', initialNodeId: 'child1' },
 *     { id: 'child1', parentId: 'parent' },
 *     { id: 'child2', parentId: 'parent' },
 *     { id: 'other' },
 *   ],
 *   edges: [{ id: 'e1', sourceId: 'other', targetId: 'parent' }],
 * });
 *
 * const flat = getFlattenedGraph(graph);
 * // flat.nodes → [child1, child2, other] (leaf nodes only)
 * // flat.edges → edge from 'other' → 'child1' (resolved via initialNodeId)
 * ```
 */
export function getFlattenedGraph<N, E, G>(graph: Graph<N, E, G>): Graph<N, E, G> {
  const idx = getIndex(graph);

  // Identify leaf nodes (nodes with no children)
  const leaves = new Set<string>();
  for (const node of graph.nodes) {
    const childIds = idx.childNodes.get(node.id) ?? [];
    if (childIds.length === 0) {
      leaves.add(node.id);
    }
  }

  // Resolve a node to its deepest initial child (leaf).
  // If it's already a leaf, returns its id.
  // If it's compound, follows initialNodeId recursively.
  function resolveInitial(
    nodeId: string,
    seen: Set<string> = new Set(),
  ): string | null {
    if (leaves.has(nodeId)) return nodeId;
    if (seen.has(nodeId)) return null; // malformed initialNodeId cycle
    seen.add(nodeId);

    const ni = idx.nodeById.get(nodeId);
    if (ni === undefined) return null;
    const node = graph.nodes[ni];

    if (node.initialNodeId) {
      return resolveInitial(node.initialNodeId, seen);
    }

    // No initialNodeId set — use first child
    const childIds = idx.childNodes.get(nodeId) ?? [];
    if (childIds.length > 0) {
      return resolveInitial(childIds[0], seen);
    }

    return nodeId;
  }

  // Get all leaf descendants of a node
  function getLeafDescendants(nodeId: string): string[] {
    if (leaves.has(nodeId)) return [nodeId];
    const result: string[] = [];
    const collect = (id: string) => {
      const childIds = idx.childNodes.get(id) ?? [];
      for (const childId of childIds) {
        if (leaves.has(childId)) {
          result.push(childId);
        } else {
          collect(childId);
        }
      }
    };
    collect(nodeId);
    return result;
  }

  // Build flattened edges
  const edgeSeen = new Set<string>();
  const flatEdges: GraphEdge<E>[] = [];

  for (const edge of graph.edges) {
    // Resolve source(s): if compound, expand to all leaf descendants
    const sources = leaves.has(edge.sourceId)
      ? [edge.sourceId]
      : getLeafDescendants(edge.sourceId);

    // Resolve target: if compound, follow initialNodeId to leaf
    const target = leaves.has(edge.targetId)
      ? edge.targetId
      : resolveInitial(edge.targetId);

    if (target === null) continue;

    for (const source of sources) {
      // Skip self-loops *introduced by flattening* (compound resolution made
      // source === target); authored self-loops on leaf nodes are preserved.
      const isAuthoredLeafSelfLoop =
        edge.sourceId === edge.targetId && leaves.has(edge.sourceId);
      if (source === target && !isAuthoredLeafSelfLoop) continue;
      const key = `${source}->${target}`;
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);

      flatEdges.push({
        type: 'edge',
        id: `${edge.id}:${source}->${target}`,
        sourceId: source,
        targetId: target,
        label: edge.label,
        data: edge.data,
        ...(edge.weight !== undefined && { weight: edge.weight }),
        ...(edge.mode !== undefined && { mode: edge.mode }),
        // Port refs only survive when the endpoint they belong to is unchanged
        ...(source === edge.sourceId &&
          edge.sourcePort !== undefined && { sourcePort: edge.sourcePort }),
        ...(target === edge.targetId &&
          edge.targetPort !== undefined && { targetPort: edge.targetPort }),
      });
    }
  }

  // Collect leaf nodes in document order, dropping hierarchy-only fields
  const leafNodes: NodeConfig<N>[] = graph.nodes
    .filter((n) => leaves.has(n.id))
    .map((n) => {
      const { type, parentId, initialNodeId, ...rest } = n;
      return rest as NodeConfig<N>;
    });

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId
      ? (resolveInitial(graph.initialNodeId) ?? undefined)
      : undefined,
    nodes: leafNodes,
    edges: flatEdges,
    data: graph.data,
  });
}

/**
 * @deprecated Use {@link getFlattenedGraph}.
 */
export function flatten<N, E, G>(graph: Graph<N, E, G>): Graph<N, E, G> {
  return getFlattenedGraph(graph);
}

/**
 * Return the line graph: each original edge becomes a node, and adjacency
 * means the original edges can be traversed consecutively.
 */
export function getLineGraph<N, E, G>(
  graph: Graph<N, E, G>,
): Graph<GraphEdge<E>, { viaNodeId: string }, G> {
  const directed =
    graph.edges.length === 0
      ? graph.mode === 'directed'
      : graph.edges.some(
          (edge) => getEdgeMode(graph, edge) === 'directed',
        );
  const arcs = graph.edges.flatMap((edge) => {
    const result = [
      { fromId: edge.sourceId, toId: edge.targetId, edge },
    ];
    if (
      getEdgeMode(graph, edge) !== 'directed' &&
      edge.sourceId !== edge.targetId
    ) {
      result.push({ fromId: edge.targetId, toId: edge.sourceId, edge });
    }
    return result;
  });
  const arcsBySource = new Map<string, typeof arcs>();
  for (const arc of arcs) {
    const existing = arcsBySource.get(arc.fromId);
    if (existing) existing.push(arc);
    else arcsBySource.set(arc.fromId, [arc]);
  }
  const seen = new Set<string>();
  const edges = [];

  for (const first of arcs) {
    for (const second of arcsBySource.get(first.toId) ?? []) {
      if (
        first.edge.id === second.edge.id &&
        first.edge.sourceId !== first.edge.targetId
      ) {
        continue;
      }
      const endpoints = directed
        ? [first.edge.id, second.edge.id]
        : [first.edge.id, second.edge.id].sort();
      const key = `${endpoints[0]}\u0000${endpoints[1]}\u0000${first.toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: `l${edges.length}`,
        sourceId: endpoints[0],
        targetId: endpoints[1],
        data: { viaNodeId: first.toId },
      });
    }
  }

  return createGraph({
    id: `${graph.id}:line`,
    mode: directed ? 'directed' : 'undirected',
    nodes: graph.edges.map((edge) => ({
      id: edge.id,
      label: edge.label,
      data: edge,
    })),
    edges,
    data: graph.data,
  });
}

// Induced subgraph

/**
 * Convert a node to a config, stripping parentId/initialNodeId references
 * to nodes outside the given set.
 */
function toScopedNodeConfig<N, P>(
  node: GraphNode<N, P>,
  nodeIdSet?: Set<string>,
): NodeConfig<N, P> {
  const config = toNodeConfig(node);
  if (nodeIdSet) {
    if (config.parentId != null && !nodeIdSet.has(config.parentId)) {
      delete config.parentId;
    }
    if (config.initialNodeId != null && !nodeIdSet.has(config.initialNodeId)) {
      delete config.initialNodeId;
    }
  }
  return config;
}

/**
 * Returns the induced subgraph containing only the given node IDs
 * and edges whose endpoints are both in the set.
 *
 * Parent references to nodes outside the set are removed.
 *
 * @example
 * ```ts
 * import { createGraph, getSubgraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const sub = getSubgraph(graph, ['a', 'b']);
 * // sub.nodes: [a, b], sub.edges: [ab]
 * ```
 */
export function getSubgraph<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  nodeIds: readonly string[],
): Graph<N, E, G, P> {
  const nodeIdSet = new Set(nodeIds);

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId:
      graph.initialNodeId && nodeIdSet.has(graph.initialNodeId)
        ? graph.initialNodeId
        : undefined,
    nodes: graph.nodes
      .filter((n) => nodeIdSet.has(n.id))
      .map((n) => toScopedNodeConfig(n, nodeIdSet)),
    edges: graph.edges
      .filter((e) => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId))
      .map(toEdgeConfig),
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}

// Reverse graph

/**
 * Returns a new graph with all edge directions flipped (source ↔ target).
 * Optionally filters which edges to include.
 *
 * @example
 * ```ts
 * import { createGraph, getReversedGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const rev = getReversedGraph(graph);
 * // rev edges: b→a, c→b
 *
 * const filtered = getReversedGraph(graph, (e) => e.id !== 'bc');
 * // filtered edges: b→a (only ab reversed, bc excluded)
 * ```
 */
export function getReversedGraph<N, E, G>(
  graph: Graph<N, E, G>,
  filterEdge?: (edge: GraphEdge<E>) => boolean,
): Graph<N, E, G> {
  const edges = filterEdge ? graph.edges.filter(filterEdge) : graph.edges;

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map((n) => toNodeConfig(n)),
    edges: edges.map((e) => {
      const config = toEdgeConfig(e);
      // Flip source and target (and their port references)
      config.sourceId = e.targetId;
      config.targetId = e.sourceId;
      delete config.sourcePort;
      delete config.targetPort;
      if (e.targetPort !== undefined) config.sourcePort = e.targetPort;
      if (e.sourcePort !== undefined) config.targetPort = e.sourcePort;
      return config;
    }),
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}

// Map & filter transforms

export interface MappedGraphOptions<N, E, P, N2, E2> {
  /** Map each node's `data`. All other fields and the structure are preserved. */
  node?: (node: GraphNode<N, P>) => N2;
  /** Map each edge's `data`. All other fields and the structure are preserved. */
  edge?: (edge: GraphEdge<E>) => E2;
}

export interface FilteredGraphOptions<N, E, P> {
  /** Keep only nodes passing this predicate. Incident edges of dropped nodes are removed. */
  node?: (node: GraphNode<N, P>) => boolean;
  /** Keep only edges passing this predicate. Endpoints are unaffected. */
  edge?: (edge: GraphEdge<E>) => boolean;
}

/**
 * Returns a new graph with node and/or edge `data` transformed by the given
 * mapping functions. Structure (IDs, endpoints, hierarchy, ports, layout) is
 * preserved; only `data` changes. Returning `undefined` clears `data`.
 *
 * Keep mapped data JSON-serializable — no functions, classes, or symbols.
 * Node and edge collections are snapshotted before callbacks run.
 *
 * @example
 * ```ts
 * import { createGraph, getMappedGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a', data: 1 }, { id: 'b', data: 2 }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', data: 'x' }],
 * });
 *
 * const doubled = getMappedGraph(graph, {
 *   node: (n) => n.data * 2,
 *   edge: (e) => e.data.toUpperCase(),
 * });
 * // doubled node data: 2, 4; edge data: 'X'
 * ```
 */
export function getMappedGraph<N, E, G, P, N2 = N, E2 = E>(
  graph: Graph<N, E, G, P>,
  options: MappedGraphOptions<N, E, P, N2, E2>,
): Graph<N2, E2, G, P> {
  // Callbacks may structurally mutate the source graph. Capture both
  // collections before invoking either callback so the result is coherent.
  const sourceNodes = graph.nodes.slice();
  const sourceEdges = graph.edges.slice();
  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: sourceNodes.map((n) => {
      const config = toNodeConfig(n) as NodeConfig<unknown, P>;
      if (options.node) {
        const data = options.node(n);
        if (data === undefined) delete config.data;
        else config.data = data;
      }
      return config as NodeConfig<N2, P>;
    }),
    edges: sourceEdges.map((e) => {
      const config = toEdgeConfig(e) as EdgeConfig<unknown>;
      if (options.edge) {
        const data = options.edge(e);
        if (data === undefined) delete config.data;
        else config.data = data;
      }
      return config as EdgeConfig<E2>;
    }),
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}

/**
 * Returns a new graph keeping only nodes and edges that pass the given
 * predicates. Dropping a node also drops its incident edges; parent and
 * initial-node references to dropped nodes are removed (as in
 * {@link getSubgraph}).
 * Node and edge collections are snapshotted before predicates run.
 *
 * @example
 * ```ts
 * import { createGraph, getFilteredGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a', data: 1 }, { id: 'b', data: 2 }, { id: 'c', data: 3 }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const filtered = getFilteredGraph(graph, { node: (n) => n.data < 3 });
 * // filtered.nodes: [a, b], filtered.edges: [ab]
 * ```
 */
export function getFilteredGraph<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options: FilteredGraphOptions<N, E, P>,
): Graph<N, E, G, P> {
  // Keep node and edge selection on one structural snapshot even when a
  // predicate mutates the source graph through the public mutation API.
  const sourceNodes = graph.nodes.slice();
  const sourceEdges = graph.edges.slice();
  const nodes = options.node
    ? sourceNodes.filter((n) => options.node!(n))
    : sourceNodes;
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId:
      graph.initialNodeId && nodeIdSet.has(graph.initialNodeId)
        ? graph.initialNodeId
        : undefined,
    nodes: nodes.map((n) => toScopedNodeConfig(n, nodeIdSet)),
    edges: sourceEdges
      .filter(
        (e) =>
          nodeIdSet.has(e.sourceId) &&
          nodeIdSet.has(e.targetId) &&
          (options.edge ? options.edge(e) : true),
      )
      .map(toEdgeConfig),
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}

/**
 * @deprecated Use {@link getReversedGraph}.
 */
export function reverseGraph<N, E, G>(
  graph: Graph<N, E, G>,
  filterEdge?: (edge: GraphEdge<E>) => boolean,
): Graph<N, E, G> {
  return getReversedGraph(graph, filterEdge);
}
