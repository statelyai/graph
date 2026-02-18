import type { Graph } from '../../types';

export function toAdjacencyList(graph: Graph): Record<string, string[]> {
  const adj: Record<string, string[]> = {};

  for (const node of graph.nodes) {
    adj[node.id] = [];
  }

  for (const edge of graph.edges) {
    adj[edge.sourceId]?.push(edge.targetId);
    if (graph.type === 'undirected') {
      adj[edge.targetId]?.push(edge.sourceId);
    }
  }

  return adj;
}

export function fromAdjacencyList(
  adj: Record<string, string[]>,
  options?: { directed?: boolean; id?: string },
): Graph {
  const directed = options?.directed ?? true;
  const seen = new Set<string>();

  const nodes = Object.keys(adj).map((id) => ({
    type: 'node' as const,
    id,
    parentId: null,
    initialNodeId: null,
    label: '',
    data: undefined as any,
  }));

  const edges: Graph['edges'] = [];
  let edgeIdx = 0;

  for (const [sourceId, targets] of Object.entries(adj)) {
    for (const targetId of targets) {
      const key = directed
        ? `${sourceId}->${targetId}`
        : [sourceId, targetId].sort().join('<->');

      if (!seen.has(key)) {
        seen.add(key);
        edges.push({
          type: 'edge',
          id: `e${edgeIdx++}`,
          sourceId,
          targetId,
          label: '',
          data: undefined as any,
        });
      }
    }
  }

  return {
    id: options?.id ?? '',
    type: directed ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes,
    edges,
    data: undefined as any,
  };
}
