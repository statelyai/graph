import { getNode } from './graph';
import { getEdgeMode } from './mode';
import {
  getPathNodes,
  getPathWeight,
  getReducedPaths,
} from './path-utils';
import { getShortestPath, getSimplePaths } from './algorithms/paths';
import { resolveFromIds } from './algorithms/shared';
import type {
  CoveragePreservingPathsOptions,
  EdgeCoveragePathsOptions,
  EdgeCoveragePathsResult,
  Graph,
  GraphEdge,
  GraphPath,
  GraphStep,
  PathCoverageKind,
  PathCoverageStats,
  PathCoverageTarget,
} from './types';

type Traversal<E> = { fromId: string; toId: string; edge: GraphEdge<E> };

function getTraversals<N, E>(graph: Graph<N, E>): Traversal<E>[] {
  const result: Traversal<E>[] = [];
  for (const edge of graph.edges) {
    result.push({ fromId: edge.sourceId, toId: edge.targetId, edge });
    if (
      getEdgeMode(graph, edge) !== 'directed' &&
      edge.sourceId !== edge.targetId
    ) {
      result.push({ fromId: edge.targetId, toId: edge.sourceId, edge });
    }
  }
  return result;
}

function getTargetKey(target: PathCoverageTarget): string {
  if (target.type === 'node') return `node:${target.nodeId}`;
  if (target.type === 'edge') return `edge:${target.edgeId}`;
  return `subpath:${target.sourceId ?? '*'}:${target.edgeIds.join('\u0000')}`;
}

function getUniqueTargets(
  targets: PathCoverageTarget[],
): PathCoverageTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = getTargetKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pathCoversTarget<N, E>(
  path: GraphPath<N, E>,
  target: PathCoverageTarget,
): boolean {
  if (target.type === 'node') {
    return getPathNodes(path).some((node) => node.id === target.nodeId);
  }
  if (target.type === 'edge') {
    return path.steps.some((step) => step.edge.id === target.edgeId);
  }

  if (target.edgeIds.length === 0) {
    return target.sourceId === undefined
      ? true
      : getPathNodes(path).some((node) => node.id === target.sourceId);
  }

  const lastStart = path.steps.length - target.edgeIds.length;
  for (let start = 0; start <= lastStart; start++) {
    const startId = start === 0 ? path.source.id : path.steps[start - 1].node.id;
    if (target.sourceId !== undefined && target.sourceId !== startId) continue;
    if (
      target.edgeIds.every(
        (edgeId, offset) => path.steps[start + offset].edge.id === edgeId,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function getCoverageTargets<N, E>(
  graph: Graph<N, E>,
  options: { kind: PathCoverageKind },
): PathCoverageTarget[] {
  if (options.kind === 'nodes') {
    return graph.nodes.map((node) => ({ type: 'node', nodeId: node.id }));
  }
  if (options.kind === 'edges') {
    return graph.edges.map((edge) => ({ type: 'edge', edgeId: edge.id }));
  }
  if (options.kind === 'edge-pairs') {
    const traversals = getTraversals(graph);
    const result: PathCoverageTarget[] = [];
    for (const first of traversals) {
      for (const second of traversals) {
        if (first.toId !== second.fromId) continue;
        result.push({
          type: 'subpath',
          sourceId: first.fromId,
          edgeIds: [first.edge.id, second.edge.id],
        });
      }
    }
    return getUniqueTargets(result);
  }

  const paths: GraphPath<N, E>[] = [
    ...graph.nodes.map((source) => ({ source, steps: [] })),
    ...getSimplePaths(graph, { from: () => true }),
  ];
  const maximal = getReducedPaths(paths, { containment: 'contiguous' });
  return maximal.map((path) => ({
    type: 'subpath',
    sourceId: path.source.id,
    edgeIds: path.steps.map((step) => step.edge.id),
  }));
}

export function getPathCoverage<N, E>(
  graph: Graph<N, E>,
  paths: GraphPath<N, E>[],
  options?: { targets?: PathCoverageTarget[] },
): PathCoverageStats {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const graphEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const coveredNodeIds = new Set<string>();
  const coveredEdgeIds = new Set<string>();
  let totalSteps = 0;

  for (const path of paths) {
    if (graphNodeIds.has(path.source.id)) coveredNodeIds.add(path.source.id);
    totalSteps += path.steps.length;
    for (const step of path.steps) {
      if (graphNodeIds.has(step.node.id)) coveredNodeIds.add(step.node.id);
      if (graphEdgeIds.has(step.edge.id)) coveredEdgeIds.add(step.edge.id);
    }
  }

  const targets = getUniqueTargets(
    options?.targets ?? [
      ...getCoverageTargets(graph, { kind: 'nodes' }),
      ...getCoverageTargets(graph, { kind: 'edges' }),
    ],
  );
  const coveredTargets = targets.filter((target) =>
    paths.some((path) => pathCoversTarget(path, target)),
  );
  const coveredTargetKeys = new Set(coveredTargets.map(getTargetKey));

  return {
    nodeCoverage:
      graph.nodes.length === 0 ? 1 : coveredNodeIds.size / graph.nodes.length,
    edgeCoverage:
      graph.edges.length === 0 ? 1 : coveredEdgeIds.size / graph.edges.length,
    coveredNodeIds: [...coveredNodeIds],
    coveredEdgeIds: [...coveredEdgeIds],
    coveredTargets,
    uncoveredTargets: targets.filter(
      (target) => !coveredTargetKeys.has(getTargetKey(target)),
    ),
    totalSteps,
  };
}

function getPathTargetKeys<N, E>(
  path: GraphPath<N, E>,
  targets: PathCoverageTarget[],
): Set<string> {
  return new Set(
    targets
      .filter((target) => pathCoversTarget(path, target))
      .map(getTargetKey),
  );
}

function getGreedyCoveragePaths<N, E>(
  paths: GraphPath<N, E>[],
  targets: PathCoverageTarget[],
): GraphPath<N, E>[] {
  const coverage = paths.map((path) => getPathTargetKeys(path, targets));
  const uncovered = new Set(coverage.flatMap((keys) => [...keys]));
  const selected = new Set<number>();

  while (uncovered.size > 0) {
    let best = -1;
    let bestGain = 0;
    for (let index = 0; index < paths.length; index++) {
      if (selected.has(index)) continue;
      let gain = 0;
      for (const key of coverage[index]) if (uncovered.has(key)) gain++;
      if (
        gain > bestGain ||
        (gain === bestGain &&
          gain > 0 &&
          best !== -1 &&
          paths[index].steps.length < paths[best].steps.length)
      ) {
        best = index;
        bestGain = gain;
      }
    }
    if (best === -1) break;
    selected.add(best);
    for (const key of coverage[best]) uncovered.delete(key);
  }

  return paths.filter((_, index) => selected.has(index));
}

function getExactCoveragePaths<N, E>(
  paths: GraphPath<N, E>[],
  targets: PathCoverageTarget[],
  limit: number,
): GraphPath<N, E>[] {
  if (paths.length > limit) {
    throw new Error(
      `Exact coverage reduction accepts at most ${limit} paths; received ${paths.length}. Use strategy "greedy" or raise exactLimit.`,
    );
  }

  const coverage = paths.map((path) => getPathTargetKeys(path, targets));
  const universe = new Set(coverage.flatMap((keys) => [...keys]));
  if (universe.size === 0) return [];

  const coversUniverse = (indices: number[]): boolean => {
    const covered = new Set<string>();
    for (const index of indices) {
      for (const key of coverage[index]) covered.add(key);
    }
    return covered.size === universe.size;
  };

  const search = (
    size: number,
    start: number,
    indices: number[],
  ): number[] | undefined => {
    if (indices.length === size) {
      return coversUniverse(indices) ? [...indices] : undefined;
    }
    const remaining = size - indices.length;
    for (let index = start; index <= paths.length - remaining; index++) {
      indices.push(index);
      const result = search(size, index + 1, indices);
      indices.pop();
      if (result) return result;
    }
    return undefined;
  };

  for (let size = 1; size <= paths.length; size++) {
    const result = search(size, 0, []);
    if (result) {
      const selected = new Set(result);
      return paths.filter((_, index) => selected.has(index));
    }
  }
  return [];
}

export function getCoveragePreservingPaths<N, E>(
  paths: GraphPath<N, E>[],
  options: CoveragePreservingPathsOptions,
): GraphPath<N, E>[] {
  const targets = getUniqueTargets(options.targets);
  return options.strategy === 'exact'
    ? getExactCoveragePaths(paths, targets, options.exactLimit ?? 24)
    : getGreedyCoveragePaths(paths, targets);
}

function getEmptyPath<N, E>(
  graph: Graph<N, E>,
  nodeId: string,
): GraphPath<N, E> | undefined {
  const source = getNode(graph, nodeId);
  return source ? { source, steps: [] } : undefined;
}

function getShortestAccessPath<N, E>(
  graph: Graph<N, E>,
  fromIds: string[],
  toId: string,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphPath<N, E> | undefined {
  let best: GraphPath<N, E> | undefined;
  let bestWeight = Infinity;
  for (const fromId of fromIds) {
    const candidate =
      fromId === toId
        ? getEmptyPath(graph, fromId)
        : getShortestPath(graph, { from: fromId, to: toId, getWeight });
    if (!candidate) continue;
    const weight = getPathWeight(candidate, getWeight);
    if (weight < bestWeight) {
      best = candidate;
      bestWeight = weight;
    }
  }
  return best;
}

function getShortestTailPath<N, E>(
  graph: Graph<N, E>,
  fromId: string,
  toIds: string[],
  getWeight: (edge: GraphEdge<E>) => number,
): GraphPath<N, E> | undefined {
  return toIds.reduce<GraphPath<N, E> | undefined>((best, toId) => {
    const candidate =
      fromId === toId
        ? getEmptyPath(graph, fromId)
        : getShortestPath(graph, { from: fromId, to: toId, getWeight });
    if (!candidate) return best;
    if (!best) return candidate;
    return getPathWeight(candidate, getWeight) < getPathWeight(best, getWeight)
      ? candidate
      : best;
  }, undefined);
}

function getEdgeCandidate<N, E>(
  graph: Graph<N, E>,
  traversal: Traversal<E>,
  fromIds: string[],
  toIds: string[] | undefined,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphPath<N, E> | undefined {
  const access = getShortestAccessPath(
    graph,
    fromIds,
    traversal.fromId,
    getWeight,
  );
  if (!access) return undefined;
  const node = getNode(graph, traversal.toId);
  if (!node) return undefined;
  const steps: GraphStep<N, E>[] = [
    ...access.steps,
    { edge: traversal.edge, node },
  ];

  if (toIds === undefined) return { source: access.source, steps };
  const tail = getShortestTailPath(graph, traversal.toId, toIds, getWeight);
  if (!tail) return undefined;
  return { source: access.source, steps: [...steps, ...tail.steps] };
}

export function getEdgeCoveragePaths<N, E>(
  graph: Graph<N, E>,
  options?: EdgeCoveragePathsOptions<E, N>,
): EdgeCoveragePathsResult<N, E> {
  const getWeight = options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  if (graph.edges.length === 0) {
    return {
      paths: [],
      coveredEdgeIds: [],
      uncoveredEdgeIds: [],
      totalWeight: 0,
      optimal: false,
    };
  }
  const negativeEdge = graph.edges.find((edge) => getWeight(edge) < 0);
  if (negativeEdge) {
    throw new Error(
      `Negative weight on edge "${negativeEdge.id}": edge coverage planning requires non-negative weights.`,
    );
  }
  const fromIds = resolveFromIds(graph, options?.from);
  const toIds =
    options?.to === undefined ? undefined : resolveFromIds(graph, options.to);
  const traversals = getTraversals(graph);
  const candidates: GraphPath<N, E>[] = [];

  for (const edge of graph.edges) {
    let best: GraphPath<N, E> | undefined;
    for (const traversal of traversals) {
      if (traversal.edge.id !== edge.id) continue;
      const candidate = getEdgeCandidate(
        graph,
        traversal,
        fromIds,
        toIds,
        getWeight,
      );
      if (
        candidate &&
        (!best ||
          getPathWeight(candidate, getWeight) < getPathWeight(best, getWeight))
      ) {
        best = candidate;
      }
    }
    if (best) candidates.push(best);
  }

  const edgeTargets = getCoverageTargets(graph, { kind: 'edges' });
  const reduce = options?.reduce ?? 'greedy';
  const paths =
    reduce === false
      ? candidates
      : reduce === 'prefix'
        ? getReducedPaths(candidates, { containment: 'prefix' })
        : getCoveragePreservingPaths(candidates, {
            targets: edgeTargets,
            strategy: reduce,
            exactLimit: options?.exactLimit,
          });
  const coverage = getPathCoverage(graph, paths, { targets: edgeTargets });

  return {
    paths,
    coveredEdgeIds: coverage.coveredEdgeIds,
    uncoveredEdgeIds: coverage.uncoveredTargets
      .filter((target): target is Extract<PathCoverageTarget, { type: 'edge' }> =>
        target.type === 'edge',
      )
      .map((target) => target.edgeId),
    totalWeight: paths.reduce(
      (total, path) => total + getPathWeight(path, getWeight),
      0,
    ),
    optimal: false,
  };
}
