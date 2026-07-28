import { getShortestPath } from './paths';
import { getPathWeight } from '../path-utils';
import type {
  Graph,
  GraphEdge,
  GraphPath,
  ShortestSimplePathsOptions,
} from '../types';

function getPathKey<N, E>(path: GraphPath<N, E>): string {
  return `${path.source.id}|${path.steps
    .map((step) => `${step.edge.id}>${step.node.id}`)
    .join('|')}`;
}

function hasSamePrefix<N, E>(
  path: GraphPath<N, E>,
  root: GraphPath<N, E>,
): boolean {
  if (path.source.id !== root.source.id || path.steps.length < root.steps.length) {
    return false;
  }
  return root.steps.every(
    (step, index) =>
      path.steps[index].edge.id === step.edge.id &&
      path.steps[index].node.id === step.node.id,
  );
}

/** Yield loopless paths in nondecreasing weight order using Yen's algorithm. */
export function* genShortestSimplePaths<N, E>(
  graph: Graph<N, E>,
  options: ShortestSimplePathsOptions<E>,
): Generator<GraphPath<N, E>> {
  const getWeight = options.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const first = getShortestPath(graph, {
    from: options.from,
    to: options.to,
    getWeight,
  });
  if (!first) return;

  const accepted: GraphPath<N, E>[] = [first];
  const acceptedKeys = new Set([getPathKey(first)]);
  const candidates = new Map<string, GraphPath<N, E>>();
  let yielded = 0;

  while (yielded < accepted.length) {
    if (options.limit !== undefined && yielded >= options.limit) return;
    const current = accepted[yielded++];
    yield current;

    const currentNodes = [
      current.source,
      ...current.steps.map((step) => step.node),
    ];
    for (let spurIndex = 0; spurIndex < currentNodes.length - 1; spurIndex++) {
      const root: GraphPath<N, E> = {
        source: current.source,
        steps: current.steps.slice(0, spurIndex),
      };
      const spurNode = currentNodes[spurIndex];
      const removedNodeIds = new Set(
        currentNodes.slice(0, spurIndex).map((node) => node.id),
      );
      const removedEdgeIds = new Set<string>();
      for (const path of accepted) {
        if (hasSamePrefix(path, root) && path.steps[spurIndex]) {
          removedEdgeIds.add(path.steps[spurIndex].edge.id);
        }
      }

      const spurGraph: Graph<N, E> = {
        ...graph,
        initialNodeId: spurNode.id,
        nodes: graph.nodes.filter((node) => !removedNodeIds.has(node.id)),
        edges: graph.edges.filter(
          (edge) =>
            !removedEdgeIds.has(edge.id) &&
            !removedNodeIds.has(edge.sourceId) &&
            !removedNodeIds.has(edge.targetId),
        ),
      };
      const spur = getShortestPath(spurGraph, {
        from: spurNode.id,
        to: options.to,
        getWeight,
      });
      if (!spur) continue;

      const candidate: GraphPath<N, E> = {
        source: root.source,
        steps: [...root.steps, ...spur.steps],
      };
      const key = getPathKey(candidate);
      if (!acceptedKeys.has(key)) candidates.set(key, candidate);
    }

    if (candidates.size === 0) return;
    let bestKey: string | undefined;
    let best: GraphPath<N, E> | undefined;
    let bestWeight = Infinity;
    for (const [key, candidate] of candidates) {
      const weight = getPathWeight(candidate, getWeight);
      if (weight < bestWeight) {
        bestKey = key;
        best = candidate;
        bestWeight = weight;
      }
    }
    candidates.delete(bestKey!);
    accepted.push(best!);
    acceptedKeys.add(bestKey!);
  }
}

export function getShortestSimplePaths<N, E>(
  graph: Graph<N, E>,
  options: ShortestSimplePathsOptions<E>,
): GraphPath<N, E>[] {
  return [...genShortestSimplePaths(graph, options)];
}
