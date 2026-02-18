import type { Graph } from '../../types';

export function toEdgeList(graph: Graph): [string, string][] {
  return graph.edges.map((e) => [e.sourceId, e.targetId]);
}

export function fromEdgeList(
  edges: [string, string][],
  options?: { directed?: boolean; id?: string },
): Graph {
  const directed = options?.directed ?? true;
  const nodeIds = new Set<string>();

  for (const [source, target] of edges) {
    nodeIds.add(source);
    nodeIds.add(target);
  }

  const nodes = [...nodeIds].map((id) => ({
    type: 'node' as const,
    id,
    parentId: null,
    initialNodeId: null,
    label: '',
    data: undefined as any,
  }));

  const edgeObjects = edges.map(([sourceId, targetId], i) => ({
    type: 'edge' as const,
    id: `e${i}`,
    sourceId,
    targetId,
    label: '',
    data: undefined as any,
  }));

  return {
    id: options?.id ?? '',
    type: directed ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes,
    edges: edgeObjects,
    data: undefined as any,
  };
}
