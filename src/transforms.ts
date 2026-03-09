import type {
  Graph,
  GraphEdge,
  GraphNode,
  NodeConfig,
  EdgeConfig,
} from './types';
import { getIndex } from './indexing';
import { createGraph } from './graph';

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
 * import { createGraph, flatten } from '@statelyai/graph';
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
 * const flat = flatten(graph);
 * // flat.nodes → [child1, child2, other] (leaf nodes only)
 * // flat.edges → edge from 'other' → 'child1' (resolved via initialNodeId)
 * ```
 */
export function flatten<N, E, G>(graph: Graph<N, E, G>): Graph<N, E, G> {
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
  function resolveInitial(nodeId: string): string | null {
    if (leaves.has(nodeId)) return nodeId;

    const ni = idx.nodeById.get(nodeId);
    if (ni === undefined) return null;
    const node = graph.nodes[ni];

    if (node.initialNodeId) {
      return resolveInitial(node.initialNodeId);
    }

    // No initialNodeId set — use first child
    const childIds = idx.childNodes.get(nodeId) ?? [];
    if (childIds.length > 0) {
      return resolveInitial(childIds[0]);
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
      if (source === target) continue; // skip self-loops from flattening
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
      });
    }
  }

  // Collect leaf nodes in document order
  const leafNodes: NodeConfig<N>[] = graph.nodes
    .filter((n) => leaves.has(n.id))
    .map((n) => ({
      id: n.id,
      label: n.label,
      data: n.data,
    }));

  return createGraph({
    id: graph.id,
    type: graph.type,
    nodes: leafNodes,
    edges: flatEdges,
    data: graph.data,
  });
}

// Induced subgraph

function nodeToConfig<N>(
  node: GraphNode<N>,
  nodeIdSet?: Set<string>,
): NodeConfig<N> {
  const config: NodeConfig<N> = {
    id: node.id,
    label: node.label,
    data: node.data,
  };
  if (node.parentId !== undefined && node.parentId !== null) {
    config.parentId =
      nodeIdSet && !nodeIdSet.has(node.parentId) ? undefined : node.parentId;
  }
  if (node.initialNodeId !== undefined)
    config.initialNodeId = node.initialNodeId ?? undefined;
  if (node.x !== undefined) config.x = node.x;
  if (node.y !== undefined) config.y = node.y;
  if (node.width !== undefined) config.width = node.width;
  if (node.height !== undefined) config.height = node.height;
  if (node.shape !== undefined) config.shape = node.shape;
  if (node.color !== undefined) config.color = node.color;
  if (node.style !== undefined) config.style = node.style;
  return config;
}

function edgeToConfig<E>(edge: GraphEdge<E>): EdgeConfig<E> {
  const config: EdgeConfig<E> = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: edge.label,
    data: edge.data,
  };
  if (edge.weight !== undefined) config.weight = edge.weight;
  if (edge.x !== undefined) config.x = edge.x;
  if (edge.y !== undefined) config.y = edge.y;
  if (edge.width !== undefined) config.width = edge.width;
  if (edge.height !== undefined) config.height = edge.height;
  if (edge.color !== undefined) config.color = edge.color;
  if (edge.style !== undefined) config.style = edge.style;
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
export function getSubgraph<N, E, G>(
  graph: Graph<N, E, G>,
  nodeIds: string[],
): Graph<N, E, G> {
  const nodeIdSet = new Set(nodeIds);

  return createGraph({
    id: graph.id,
    type: graph.type,
    initialNodeId:
      graph.initialNodeId && nodeIdSet.has(graph.initialNodeId)
        ? graph.initialNodeId
        : undefined,
    nodes: graph.nodes
      .filter((n) => nodeIdSet.has(n.id))
      .map((n) => nodeToConfig(n, nodeIdSet)),
    edges: graph.edges
      .filter((e) => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId))
      .map(edgeToConfig),
    data: graph.data,
  });
}

// Reverse graph

/**
 * Returns a new graph with all edge directions flipped (source ↔ target).
 * Optionally filters which edges to include.
 *
 * @example
 * ```ts
 * import { createGraph, reverseGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const rev = reverseGraph(graph);
 * // rev edges: b→a, c→b
 *
 * const filtered = reverseGraph(graph, (e) => e.id !== 'bc');
 * // filtered edges: b→a (only ab reversed, bc excluded)
 * ```
 */
export function reverseGraph<N, E, G>(
  graph: Graph<N, E, G>,
  filterEdge?: (edge: GraphEdge<E>) => boolean,
): Graph<N, E, G> {
  const edges = filterEdge ? graph.edges.filter(filterEdge) : graph.edges;

  return createGraph({
    id: graph.id,
    type: graph.type,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map((n) => nodeToConfig(n)),
    edges: edges.map((e) => {
      const config = edgeToConfig(e);
      // Flip source and target
      config.sourceId = e.targetId;
      config.targetId = e.sourceId;
      return config;
    }),
    data: graph.data,
  });
}
