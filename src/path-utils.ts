import { getEdgeMode } from './mode';
import { getEdge, getNode } from './graph';
import type {
  Graph,
  GraphEdge,
  GraphNode,
  GraphPath,
  PathReductionOptions,
} from './types';

export function getPathNodes<N, E>(path: GraphPath<N, E>): GraphNode<N>[] {
  return [path.source, ...path.steps.map((step) => step.node)];
}

export function getPathEdges<N, E>(path: GraphPath<N, E>): GraphEdge<E>[] {
  return path.steps.map((step) => step.edge);
}

export function getPathWeight<N, E>(
  path: GraphPath<N, E>,
  getWeight: (edge: GraphEdge<E>) => number = (edge) => edge.weight ?? 1,
): number {
  return path.steps.reduce(
    (total, step) => total + getWeight(step.edge),
    0,
  );
}

/** Validate edge identity, direction, and reached-node identity for a path. */
export function isValidPath<N, E>(
  graph: Graph<N, E>,
  path: GraphPath<N, E>,
): boolean {
  if (!getNode(graph, path.source.id)) return false;

  let currentId = path.source.id;
  for (const step of path.steps) {
    const edge = getEdge(graph, step.edge.id);
    if (!edge || !getNode(graph, step.node.id)) {
      return false;
    }

    const forward =
      edge.sourceId === currentId && edge.targetId === step.node.id;
    const reverse =
      getEdgeMode(graph, edge) !== 'directed' &&
      edge.targetId === currentId &&
      edge.sourceId === step.node.id;
    if (!forward && !reverse) return false;
    currentId = step.node.id;
  }

  return true;
}

/** Whether `path` contains `candidate` as a prefix or contiguous subpath. */
export function hasSubpath<N, E>(
  path: GraphPath<N, E>,
  candidate: GraphPath<N, E>,
  options?: { containment?: 'prefix' | 'contiguous' },
): boolean {
  const containment = options?.containment ?? 'contiguous';
  if (candidate.steps.length > path.steps.length) return false;

  const pathNodes = getPathNodes(path);
  const starts = containment === 'prefix' ? [0] : pathNodes.map((_, index) => index);

  for (const start of starts) {
    if (pathNodes[start]?.id !== candidate.source.id) continue;
    if (start + candidate.steps.length > path.steps.length) continue;

    let matches = true;
    for (let index = 0; index < candidate.steps.length; index++) {
      const actual = path.steps[start + index];
      const expected = candidate.steps[index];
      if (
        actual.edge.id !== expected.edge.id ||
        actual.node.id !== expected.node.id
      ) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

/** Remove duplicate paths and paths contained by another candidate. */
export function getReducedPaths<N, E>(
  paths: GraphPath<N, E>[],
  options?: PathReductionOptions,
): GraphPath<N, E>[] {
  const containment = options?.containment ?? 'contiguous';

  return paths.filter((candidate, candidateIndex) =>
    !paths.some((path, pathIndex) => {
      if (candidateIndex === pathIndex) return false;
      if (path.steps.length < candidate.steps.length) return false;
      if (
        path.steps.length === candidate.steps.length &&
        pathIndex > candidateIndex
      ) {
        return false;
      }
      return hasSubpath(path, candidate, { containment });
    }),
  );
}
