import { toEdgeConfig, toNodeConfig } from './config';
import { createGraph } from './graph';
import { getEdgeMode } from './mode';
import type {
  EdgeConfig,
  Graph,
  GraphNode,
  NodeConfig,
} from './types';

export interface DisjointUnionOptions {
  /** Override the generated ID for each node from the right graph. */
  getRightNodeId?: (id: string) => string;
  /** Override the generated ID for each edge from the right graph. */
  getRightEdgeId?: (id: string) => string;
}

export interface GraphComplementOptions<N, E> {
  /** Customize each generated edge. Endpoints are always supplied by the operation. */
  createEdge?: (
    source: GraphNode<N>,
    target: GraphNode<N>,
    index: number,
  ) => Omit<EdgeConfig<E>, 'id' | 'sourceId' | 'targetId'> & { id?: string };
}

function assertSameMode(left: Graph, right: Graph): void {
  if (left.mode !== right.mode) {
    throw new Error(
      `Cannot combine graphs with modes "${left.mode}" and "${right.mode}"`,
    );
  }
}

function createFromLeft<N, E, G, P>(
  left: Graph<N, E, G, P>,
  nodes: NodeConfig<N, P>[],
  edges: EdgeConfig<E>[],
): Graph<N, E, G, P> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return createGraph({
    id: left.id,
    mode: left.mode,
    initialNodeId:
      left.initialNodeId && nodeIds.has(left.initialNodeId)
        ? left.initialNodeId
        : undefined,
    nodes: nodes.map((node) => {
      const result = { ...node };
      if (result.parentId != null && !nodeIds.has(result.parentId)) {
        delete result.parentId;
      }
      if (result.initialNodeId != null && !nodeIds.has(result.initialNodeId)) {
        delete result.initialNodeId;
      }
      return result;
    }),
    edges: edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId),
    ),
    data: left.data,
    direction: left.direction,
    style: left.style,
  });
}

function mergeById<T extends { id: string }>(left: T[], right: T[]): T[] {
  const merged = new Map<string, T>();
  for (const entity of left) merged.set(entity.id, entity);
  for (const entity of right) merged.set(entity.id, entity);
  return [...merged.values()];
}

/**
 * Returns the union of two graphs by stable node and edge ID.
 *
 * The right graph wins entity conflicts. Graph metadata comes from the left.
 */
export function getGraphUnion<N, E, G, P>(
  left: Graph<N, E, G, P>,
  right: Graph<N, E, G, P>,
): Graph<N, E, G, P> {
  assertSameMode(left, right);
  return createFromLeft(
    left,
    mergeById(left.nodes, right.nodes).map(toNodeConfig),
    mergeById(left.edges, right.edges).map(toEdgeConfig),
  );
}

/**
 * Returns entities whose stable IDs occur in both graphs.
 *
 * Entity data comes from the right graph. Graph metadata comes from the left.
 */
export function getGraphIntersection<N, E, G, P>(
  left: Graph<N, E, G, P>,
  right: Graph<N, E, G, P>,
): Graph<N, E, G, P> {
  assertSameMode(left, right);
  const rightNodes = new Map(right.nodes.map((node) => [node.id, node]));
  const rightEdges = new Map(right.edges.map((edge) => [edge.id, edge]));
  return createFromLeft(
    left,
    left.nodes
      .map((node) => rightNodes.get(node.id))
      .filter((node): node is GraphNode<N, P> => node !== undefined)
      .map(toNodeConfig),
    left.edges
      .map((edge) => rightEdges.get(edge.id))
      .filter((edge): edge is Graph<N, E>['edges'][number] => edge !== undefined)
      .map(toEdgeConfig),
  );
}

/** Returns the left graph with edge IDs present in the right graph removed. */
export function getGraphDifference<N, E, G, P>(
  left: Graph<N, E, G, P>,
  right: Graph<N, E, G, P>,
): Graph<N, E, G, P> {
  assertSameMode(left, right);
  const rightEdgeIds = new Set(right.edges.map((edge) => edge.id));
  return createFromLeft(
    left,
    left.nodes.map(toNodeConfig),
    left.edges
      .filter((edge) => !rightEdgeIds.has(edge.id))
      .map(toEdgeConfig),
  );
}

/** Returns edges whose stable IDs occur in exactly one graph. */
export function getGraphSymmetricDifference<N, E, G, P>(
  left: Graph<N, E, G, P>,
  right: Graph<N, E, G, P>,
): Graph<N, E, G, P> {
  assertSameMode(left, right);
  const leftEdgeIds = new Set(left.edges.map((edge) => edge.id));
  const rightEdgeIds = new Set(right.edges.map((edge) => edge.id));
  return createFromLeft(
    left,
    mergeById(left.nodes, right.nodes).map(toNodeConfig),
    [
      ...left.edges.filter((edge) => !rightEdgeIds.has(edge.id)),
      ...right.edges.filter((edge) => !leftEdgeIds.has(edge.id)),
    ].map(toEdgeConfig),
  );
}

function getUniqueId(
  id: string,
  occupied: Set<string>,
  reserved: ReadonlySet<string>,
): string {
  if (!occupied.has(id)) return id;
  let suffix = 2;
  while (
    occupied.has(`${id}#${suffix}`) ||
    reserved.has(`${id}#${suffix}`)
  ) {
    suffix++;
  }
  return `${id}#${suffix}`;
}

function assertAvailableId(
  kind: 'node' | 'edge',
  id: string,
  occupied: Set<string>,
): void {
  if (!id) throw new Error(`Disjoint-union ${kind} IDs must be non-empty`);
  if (occupied.has(id)) {
    throw new Error(`Disjoint-union ${kind} ID "${id}" is not unique`);
  }
}

/**
 * Returns a disjoint union, preserving left IDs and remapping right collisions
 * with `#2`, `#3`, and so on unless custom remappers are provided.
 */
export function getDisjointUnion<N, E, G, P>(
  left: Graph<N, E, G, P>,
  right: Graph<N, E, G, P>,
  options: DisjointUnionOptions = {},
): Graph<N, E, G, P> {
  assertSameMode(left, right);
  const occupiedNodeIds = new Set(left.nodes.map((node) => node.id));
  const occupiedEdgeIds = new Set(left.edges.map((edge) => edge.id));
  const reservedNodeIds = new Set(right.nodes.map((node) => node.id));
  const reservedEdgeIds = new Set(right.edges.map((edge) => edge.id));
  const rightNodeIds = new Map<string, string>();

  for (const node of right.nodes) {
    const id = options.getRightNodeId
      ? options.getRightNodeId(node.id)
      : getUniqueId(node.id, occupiedNodeIds, reservedNodeIds);
    assertAvailableId('node', id, occupiedNodeIds);
    occupiedNodeIds.add(id);
    rightNodeIds.set(node.id, id);
  }

  const rightNodes = right.nodes.map((node): NodeConfig<N, P> => {
    const config = toNodeConfig(node);
    config.id = rightNodeIds.get(node.id)!;
    if (config.parentId != null) {
      config.parentId = rightNodeIds.get(config.parentId) ?? config.parentId;
    }
    if (config.initialNodeId != null) {
      config.initialNodeId =
        rightNodeIds.get(config.initialNodeId) ?? config.initialNodeId;
    }
    return config;
  });

  const rightEdges = right.edges.map((edge): EdgeConfig<E> => {
    const config = toEdgeConfig(edge);
    const id = options.getRightEdgeId
      ? options.getRightEdgeId(edge.id)
      : getUniqueId(edge.id, occupiedEdgeIds, reservedEdgeIds);
    assertAvailableId('edge', id, occupiedEdgeIds);
    occupiedEdgeIds.add(id);
    config.id = id;
    config.sourceId = rightNodeIds.get(edge.sourceId) ?? edge.sourceId;
    config.targetId = rightNodeIds.get(edge.targetId) ?? edge.targetId;
    return config;
  });

  return createFromLeft(
    left,
    [...left.nodes.map(toNodeConfig), ...rightNodes],
    [...left.edges.map(toEdgeConfig), ...rightEdges],
  );
}

/**
 * Returns the complement over the existing node set, excluding self-loops.
 * Generated edges inherit the graph's default mode.
 */
export function getGraphComplement<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options: GraphComplementOptions<N, E> = {},
): Graph<N, E, G, P> {
  const edges: EdgeConfig<E>[] = [];
  const edgeIds = new Set<string>();
  const directed = graph.mode === 'directed';
  const connections = new Map<string, Set<string>>();
  const addConnection = (sourceId: string, targetId: string) => {
    const targets = connections.get(sourceId);
    if (targets) targets.add(targetId);
    else connections.set(sourceId, new Set([targetId]));
  };
  for (const edge of graph.edges) {
    addConnection(edge.sourceId, edge.targetId);
    if (getEdgeMode(graph, edge) !== 'directed') {
      addConnection(edge.targetId, edge.sourceId);
    }
  }

  for (let sourceIndex = 0; sourceIndex < graph.nodes.length; sourceIndex++) {
    const start = directed ? 0 : sourceIndex + 1;
    for (let targetIndex = start; targetIndex < graph.nodes.length; targetIndex++) {
      const source = graph.nodes[sourceIndex];
      const target = graph.nodes[targetIndex];
      if (
        source.id === target.id ||
        connections.get(source.id)?.has(target.id) ||
        (!directed && connections.get(target.id)?.has(source.id))
      ) {
        continue;
      }
      const custom = options.createEdge?.(source, target, edges.length);
      const edge: EdgeConfig<E> = {
        ...custom,
        id:
          custom?.id ??
          `complement:${JSON.stringify([source.id, target.id])}`,
        sourceId: source.id,
        targetId: target.id,
      };
      if (edgeIds.has(edge.id)) {
        throw new Error(`Complement edge ID "${edge.id}" is not unique`);
      }
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  }

  return createFromLeft(graph, graph.nodes.map(toNodeConfig), edges);
}
