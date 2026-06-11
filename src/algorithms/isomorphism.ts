import type { Graph, GraphEdge, GraphNode } from '../types';
import { getIndex } from '../indexing';
import { getEdgeMode } from '../mode';

export interface IsomorphismOptions<N = any, E = any> {
  nodeMatch?: (a: GraphNode<N>, b: GraphNode<N>) => boolean;
  edgeMatch?: (a: GraphEdge<E>, b: GraphEdge<E>) => boolean;
}

function getDegreeSignature(graph: Graph, nodeId: string): string {
  // Count per effective edge mode so per-edge overrides participate in
  // structural matching: directed edges contribute in/out, non-directed
  // edges contribute one undirected incidence each.
  const idx = getIndex(graph);
  let inDegree = 0;
  let outDegree = 0;
  let undirected = 0;
  const countedNonDirected = new Set<string>();
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const edge = graph.edges[idx.edgeById.get(eid)!];
    if (getEdgeMode(graph, edge) === 'directed') outDegree++;
    else if (!countedNonDirected.has(eid)) {
      countedNonDirected.add(eid);
      undirected++;
    }
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const edge = graph.edges[idx.edgeById.get(eid)!];
    if (getEdgeMode(graph, edge) === 'directed') inDegree++;
    else if (!countedNonDirected.has(eid)) {
      countedNonDirected.add(eid);
      undirected++;
    }
  }
  return `d:${inDegree}:${outDegree}:u:${undirected}`;
}

function getEdgesBetween<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  targetId: string,
): GraphEdge<E>[] {
  // Directed edges match the requested orientation; edges whose effective
  // mode is not 'directed' match either way.
  return graph.edges.filter((edge) => {
    if (edge.sourceId === sourceId && edge.targetId === targetId) return true;
    return (
      edge.sourceId === targetId &&
      edge.targetId === sourceId &&
      getEdgeMode(graph, edge) !== 'directed'
    );
  });
}

function edgesAreCompatible<E>(
  edgesA: GraphEdge<E>[],
  edgesB: GraphEdge<E>[],
  edgeMatch?: (a: GraphEdge<E>, b: GraphEdge<E>) => boolean,
): boolean {
  if (edgesA.length !== edgesB.length) {
    return false;
  }

  if (!edgeMatch || edgesA.length === 0) {
    return true;
  }

  const remaining = [...edgesB];
  for (const edgeA of edgesA) {
    const matchIndex = remaining.findIndex((edgeB) => edgeMatch(edgeA, edgeB));
    if (matchIndex === -1) {
      return false;
    }
    remaining.splice(matchIndex, 1);
  }

  return true;
}

/**
 * Returns whether two graphs are structurally isomorphic.
 *
 * Optional `nodeMatch` and `edgeMatch` predicates can refine the match using
 * node and edge payloads.
 */
export function isIsomorphic<N, E>(
  graphA: Graph<N, E>,
  graphB: Graph<N, E>,
  options?: IsomorphismOptions<N, E>,
): boolean {
  // graph.mode is only the *default* edge mode — what matters structurally is
  // each edge's effective mode, which the degree signatures and per-pair edge
  // checks below already account for.
  if (graphA.nodes.length !== graphB.nodes.length) return false;
  if (graphA.edges.length !== graphB.edges.length) return false;

  const nodeMatch = options?.nodeMatch;
  const edgeMatch = options?.edgeMatch;

  const nodesA = [...graphA.nodes].sort((a, b) => {
    const sigDiff = getDegreeSignature(graphA, b.id).localeCompare(
      getDegreeSignature(graphA, a.id),
    );
    if (sigDiff !== 0) return sigDiff;
    return a.id.localeCompare(b.id);
  });
  const nodesB = [...graphB.nodes];

  const signaturesA = nodesA.map((node) => getDegreeSignature(graphA, node.id)).sort();
  const signaturesB = nodesB.map((node) => getDegreeSignature(graphB, node.id)).sort();
  if (signaturesA.join('|') !== signaturesB.join('|')) {
    return false;
  }

  const mapping = new Map<string, string>();
  const usedB = new Set<string>();

  const backtrack = (index: number): boolean => {
    if (index >= nodesA.length) {
      return true;
    }

    const nodeA = nodesA[index];
    const signatureA = getDegreeSignature(graphA, nodeA.id);

    for (const nodeB of nodesB) {
      if (usedB.has(nodeB.id)) continue;
      if (getDegreeSignature(graphB, nodeB.id) !== signatureA) continue;
      if (nodeMatch && !nodeMatch(nodeA, nodeB)) continue;

      // Self-loop edges are never covered by the mapped-pair loop below, so
      // compare them directly when proposing this candidate pair.
      const selfLoopsA = getEdgesBetween(graphA, nodeA.id, nodeA.id);
      const selfLoopsB = getEdgesBetween(graphB, nodeB.id, nodeB.id);
      if (!edgesAreCompatible(selfLoopsA, selfLoopsB, edgeMatch)) continue;

      let compatible = true;
      for (const [mappedAId, mappedBId] of mapping.entries()) {
        const edgesAForward = getEdgesBetween(graphA, nodeA.id, mappedAId);
        const edgesBForward = getEdgesBetween(graphB, nodeB.id, mappedBId);
        if (!edgesAreCompatible(edgesAForward, edgesBForward, edgeMatch)) {
          compatible = false;
          break;
        }

        const edgesAReverse = getEdgesBetween(graphA, mappedAId, nodeA.id);
        const edgesBReverse = getEdgesBetween(graphB, mappedBId, nodeB.id);
        if (!edgesAreCompatible(edgesAReverse, edgesBReverse, edgeMatch)) {
          compatible = false;
          break;
        }
      }

      if (!compatible) continue;

      mapping.set(nodeA.id, nodeB.id);
      usedB.add(nodeB.id);
      if (backtrack(index + 1)) {
        return true;
      }
      mapping.delete(nodeA.id);
      usedB.delete(nodeB.id);
    }

    return false;
  };

  return backtrack(0);
}
