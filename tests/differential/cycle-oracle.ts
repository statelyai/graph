// Reference simple-cycle enumerators (plain backtracking, exhaustive per
// start node). Kept only as a differential oracle for `genCycles`.
import { getIndex } from '../../src/indexing';
import {
  getNeighborEdges,
  getNeighborEdgesAll,
} from '../../src/algorithms/shared';
import type { Graph, GraphEdge, GraphPath, GraphStep } from '../../src/types';

export function* oracleCyclesDirected<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sortedIds = graph.nodes.map((node) => node.id).sort();

  for (let startIndex = 0; startIndex < sortedIds.length; startIndex++) {
    const startId = sortedIds[startIndex];
    const allowed = new Set(sortedIds.slice(startIndex));
    const visited = new Set<string>();
    const steps: GraphStep<N, E>[] = [];
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string): void {
      visited.add(currentId);

      for (const eid of idx.outEdges.get(currentId) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const edge = graph.edges[ai];
        const neighborId = edge.targetId;

        if (
          neighborId === startId &&
          (steps.length > 0 || currentId === startId)
        ) {
          found.push({
            source: startNode,
            steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
          });
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          dfsFind(neighborId);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId);
    yield* found;
  }
}

export function* oracleCyclesUndirected<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sortedIds = graph.nodes.map((node) => node.id).sort();
  const seen = new Set<string>();

  for (let startIndex = 0; startIndex < sortedIds.length; startIndex++) {
    const startId = sortedIds[startIndex];
    const allowed = new Set(sortedIds.slice(startIndex));
    const visited = new Set<string>();
    const steps: GraphStep<N, E>[] = [];
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string, arrivalEdgeId: string | null): void {
      visited.add(currentId);

      for (const { neighborId, edge } of getNeighborEdgesAll(graph, currentId)) {
        // An undirected edge cannot be re-traversed back the way we came;
        // skipping by edge id (not parent node) keeps parallel edges distinct,
        // so two parallel edges between the same pair form a genuine 2-cycle.
        if (edge.id === arrivalEdgeId) continue;

        if (
          neighborId === startId &&
          (steps.length >= 1 || edge.sourceId === edge.targetId)
        ) {
          // Identify a cycle by its full set of traversed edge ids — distinct
          // cycles can share the same vertex set (e.g. parallel chords).
          const cycleEdgeIds = [...steps.map((step) => step.edge.id), edge.id]
            .sort()
            .join(',');
          if (!seen.has(cycleEdgeIds)) {
            seen.add(cycleEdgeIds);
            found.push({
              source: startNode,
              steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
            });
          }
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          dfsFind(neighborId, edge.id);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId, null);
    yield* found;
  }
}

/**
 * Exact simple-cycle enumeration for graphs mixing directed and non-directed
 * edges. Traverses directed edges source→target only and non-directed edges
 * both ways; a cycle may use each edge at most once, visits distinct nodes,
 * and is identified by its set of traversed edge ids.
 */
export function* oracleCyclesMixed<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sortedIds = graph.nodes.map((node) => node.id).sort();
  const seen = new Set<string>();

  for (let startIndex = 0; startIndex < sortedIds.length; startIndex++) {
    const startId = sortedIds[startIndex];
    const allowed = new Set(sortedIds.slice(startIndex));
    const visited = new Set<string>();
    const steps: GraphStep<N, E>[] = [];
    const pathEdgeIds = new Set<string>();
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string): void {
      visited.add(currentId);

      for (const { neighborId, edge } of getNeighborEdges(graph, currentId)) {
        if (pathEdgeIds.has(edge.id)) continue;

        if (
          neighborId === startId &&
          (steps.length >= 1 || edge.sourceId === edge.targetId)
        ) {
          const cycleEdgeIds = [...steps.map((step) => step.edge.id), edge.id]
            .sort()
            .join(',');
          if (!seen.has(cycleEdgeIds)) {
            seen.add(cycleEdgeIds);
            found.push({
              source: startNode,
              steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
            });
          }
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          pathEdgeIds.add(edge.id);
          dfsFind(neighborId);
          pathEdgeIds.delete(edge.id);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId);
    yield* found;
  }
}

