import type { Graph, GraphEdge, NodeConfig } from './types';
import { getIndex } from './indexing';
import { createGraph } from './graph';

/**
 * Flattens a hierarchical graph into a flat graph with only leaf nodes.
 *
 * - Edges targeting a compound node resolve to its initial child (recursively).
 * - Edges originating from a compound node expand to all leaf descendants.
 * - Only leaf nodes (nodes with no children) appear in the result.
 * - Duplicate edges (same source + target) are deduplicated.
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
