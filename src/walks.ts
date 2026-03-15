import { getOutEdges } from './queries';
import { getNode } from './graph';
import { getShortestPath } from './algorithms';
import type {
  Graph,
  GraphEdge,
  GraphStep,
  WalkOptions,
  WeightedWalkOptions,
  WalkContext,
  CoverageStats,
} from './types';

// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed?: number): () => number {
  return seed !== undefined ? mulberry32(seed) : Math.random;
}

// --- Resolve start node (same logic as algorithms.ts) ---

function resolveFrom(graph: Graph, from?: string): string {
  if (from) return from;
  if (graph.initialNodeId) return graph.initialNodeId;

  const inDeg = new Map<string, number>();
  for (const n of graph.nodes) inDeg.set(n.id, 0);
  for (const e of graph.edges)
    inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1);
  const roots = [...inDeg.entries()].filter(([, d]) => d === 0);
  if (roots.length === 1) return roots[0][0];

  throw new Error(
    'Cannot determine start node: provide `from`, set graph.initialNodeId, or have exactly one source node.',
  );
}

// --- Walk generators ---

/**
 * Random walk. At each node, picks a uniformly random outgoing edge.
 * Yields steps indefinitely (may revisit nodes) until a sink node is reached.
 */
export function* genRandomWalk<N, E>(
  graph: Graph<N, E>,
  options?: WalkOptions<E>,
): Generator<GraphStep<N, E>> {
  const rng = makeRng(options?.seed);
  let currentId = resolveFrom(graph, options?.from);
  const ctx: WalkContext = {
    currentNodeId: currentId,
    visitedNodes: new Set([currentId]),
    visitedEdges: new Set(),
    stepCount: 0,
  };

  while (true) {
    let edges = getOutEdges(graph, currentId);
    if (options?.filter) {
      edges = edges.filter((e) => options.filter!(e, ctx));
    }
    if (edges.length === 0) return;

    const edge = edges[Math.floor(rng() * edges.length)];
    const node = getNode(graph, edge.targetId)!;

    const step: GraphStep<N, E> = { edge, node };
    currentId = node.id;
    ctx.currentNodeId = currentId;
    ctx.visitedNodes.add(currentId);
    ctx.visitedEdges.add(edge.id);
    ctx.stepCount++;

    options?.onStep?.(step, ctx);
    yield step;
  }
}

/**
 * Weighted random walk. Edge selection probability proportional to weight.
 */
export function* genWeightedRandomWalk<N, E>(
  graph: Graph<N, E>,
  options?: WeightedWalkOptions<E>,
): Generator<GraphStep<N, E>> {
  const rng = makeRng(options?.seed);
  const getWeight = options?.getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);
  let currentId = resolveFrom(graph, options?.from);
  const ctx: WalkContext = {
    currentNodeId: currentId,
    visitedNodes: new Set([currentId]),
    visitedEdges: new Set(),
    stepCount: 0,
  };

  while (true) {
    let edges = getOutEdges(graph, currentId);
    if (options?.filter) {
      edges = edges.filter((e) => options.filter!(e, ctx));
    }
    if (edges.length === 0) return;

    const weights = edges.map((e) => Math.max(0, getWeight(e)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let r = rng() * total;
    let chosen = edges[0];
    for (let i = 0; i < edges.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = edges[i];
        break;
      }
    }

    const node = getNode(graph, chosen.targetId)!;
    const step: GraphStep<N, E> = { edge: chosen, node };
    currentId = node.id;
    ctx.currentNodeId = currentId;
    ctx.visitedNodes.add(currentId);
    ctx.visitedEdges.add(chosen.id);
    ctx.stepCount++;

    options?.onStep?.(step, ctx);
    yield step;
  }
}

/**
 * Quick random walk targeting unvisited edges.
 * If unvisited outgoing edges exist, picks one randomly.
 * Otherwise, finds shortest path to a node with unvisited outgoing edges.
 */
export function* genQuickRandomWalk<N, E>(
  graph: Graph<N, E>,
  options?: WalkOptions<E>,
): Generator<GraphStep<N, E>> {
  const rng = makeRng(options?.seed);
  let currentId = resolveFrom(graph, options?.from);
  const visitedEdges = new Set<string>();
  const allEdgeIds = new Set(graph.edges.map((e) => e.id));
  const ctx: WalkContext = {
    currentNodeId: currentId,
    visitedNodes: new Set([currentId]),
    visitedEdges,
    stepCount: 0,
  };

  while (visitedEdges.size < allEdgeIds.size) {
    let edges = getOutEdges(graph, currentId);
    if (options?.filter) {
      edges = edges.filter((e) => options.filter!(e, ctx));
    }

    const unvisited = edges.filter((e) => !visitedEdges.has(e.id));

    if (unvisited.length > 0) {
      const edge = unvisited[Math.floor(rng() * unvisited.length)];
      const node = getNode(graph, edge.targetId)!;
      const step: GraphStep<N, E> = { edge, node };
      currentId = node.id;
      ctx.currentNodeId = currentId;
      ctx.visitedNodes.add(currentId);
      visitedEdges.add(edge.id);
      ctx.stepCount++;
      options?.onStep?.(step, ctx);
      yield step;
    } else {
      // Find a node with unvisited outgoing edges and path to it
      let targetNodeId: string | undefined;
      for (const n of graph.nodes) {
        const outEdges = getOutEdges(graph, n.id);
        if (outEdges.some((e) => !visitedEdges.has(e.id))) {
          targetNodeId = n.id;
          break;
        }
      }
      if (!targetNodeId) return;

      const path = getShortestPath(graph, { from: currentId, to: targetNodeId });
      if (!path || path.steps.length === 0) return;

      for (const step of path.steps) {
        currentId = step.node.id;
        ctx.currentNodeId = currentId;
        ctx.visitedNodes.add(currentId);
        visitedEdges.add(step.edge.id);
        ctx.stepCount++;
        options?.onStep?.(step, ctx);
        yield step;
      }
    }
  }
}

/**
 * Walk a predefined sequence of edge IDs.
 * Validates each edge exists and connects from the current position.
 */
export function* genPredefinedWalk<N, E>(
  graph: Graph<N, E>,
  edgeIds: string[],
  options?: Pick<WalkOptions<E>, 'from'>,
): Generator<GraphStep<N, E>> {
  let currentId = resolveFrom(graph, options?.from);

  for (const edgeId of edgeIds) {
    const edge = graph.edges.find((e) => e.id === edgeId);
    if (!edge) {
      throw new Error(`Edge "${edgeId}" not found in graph.`);
    }
    if (edge.sourceId !== currentId) {
      throw new Error(
        `Edge "${edgeId}" starts at "${edge.sourceId}" but current position is "${currentId}".`,
      );
    }
    const node = getNode(graph, edge.targetId)!;
    currentId = node.id;
    yield { edge, node };
  }
}

// --- Stop conditions (generator wrappers) ---

/**
 * Yield at most `n` steps from the source generator.
 */
export function* takeSteps<N, E>(
  gen: Generator<GraphStep<N, E>>,
  n: number,
): Generator<GraphStep<N, E>> {
  let count = 0;
  for (const step of gen) {
    yield step;
    if (++count >= n) return;
  }
}

/**
 * Yield steps until a specific node is reached.
 */
export function* takeUntilNode<N, E>(
  gen: Generator<GraphStep<N, E>>,
  nodeId: string,
): Generator<GraphStep<N, E>> {
  for (const step of gen) {
    yield step;
    if (step.node.id === nodeId) return;
  }
}

/**
 * Yield steps until a specific edge is traversed.
 */
export function* takeUntilEdge<N, E>(
  gen: Generator<GraphStep<N, E>>,
  edgeId: string,
): Generator<GraphStep<N, E>> {
  for (const step of gen) {
    yield step;
    if (step.edge.id === edgeId) return;
  }
}

/**
 * Yield steps until node coverage reaches the target (0–1).
 */
export function* takeUntilNodeCoverage<N, E>(
  gen: Generator<GraphStep<N, E>>,
  graph: Graph<N, E>,
  coverage: number,
  options?: { from?: string },
): Generator<GraphStep<N, E>> {
  const totalNodes = graph.nodes.length;
  const target = Math.ceil(coverage * totalNodes);
  const startId = options?.from ?? graph.initialNodeId ?? graph.nodes[0]?.id;
  const visited = new Set<string>(startId ? [startId] : []);

  for (const step of gen) {
    visited.add(step.node.id);
    yield step;
    if (visited.size >= target) return;
  }
}

/**
 * Yield steps until edge coverage reaches the target (0–1).
 */
export function* takeUntilEdgeCoverage<N, E>(
  gen: Generator<GraphStep<N, E>>,
  graph: Graph<N, E>,
  coverage: number,
): Generator<GraphStep<N, E>> {
  const totalEdges = graph.edges.length;
  const target = Math.ceil(coverage * totalEdges);
  const visited = new Set<string>();

  for (const step of gen) {
    visited.add(step.edge.id);
    yield step;
    if (visited.size >= target) return;
  }
}

// --- Coverage tracking ---

/**
 * Compute coverage statistics for a completed walk.
 */
export function getCoverage<N, E>(
  graph: Graph<N, E>,
  steps: GraphStep<N, E>[],
  options?: { from?: string },
): CoverageStats {
  const startId = options?.from ?? graph.initialNodeId ?? graph.nodes[0]?.id;
  const visitedNodes = new Set<string>(startId ? [startId] : []);
  const visitedEdges = new Set<string>();

  for (const step of steps) {
    visitedNodes.add(step.node.id);
    visitedEdges.add(step.edge.id);
  }

  return {
    nodeCoverage: graph.nodes.length > 0 ? visitedNodes.size / graph.nodes.length : 1,
    edgeCoverage: graph.edges.length > 0 ? visitedEdges.size / graph.edges.length : 1,
    visitedNodes: [...visitedNodes],
    visitedEdges: [...visitedEdges],
    totalSteps: steps.length,
  };
}
