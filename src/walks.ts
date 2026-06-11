import { getOutEdges, getInEdges } from './queries';
import { getNode } from './graph';
import { getEdgeMode } from './mode';
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

// --- Mode-aware traversal ---

/**
 * Edges traversable from a node, with the node reached by taking each one.
 * Out-edges always; in-edges too when their effective mode is not 'directed'.
 */
function getTraversableEdges<N, E>(
  graph: Graph<N, E>,
  nodeId: string,
): { edge: GraphEdge<E>; nextId: string }[] {
  const result: { edge: GraphEdge<E>; nextId: string }[] = [];
  for (const edge of getOutEdges(graph, nodeId)) {
    result.push({ edge, nextId: edge.targetId });
  }
  for (const edge of getInEdges(graph, nodeId)) {
    // Self-loops already covered by the out-edge loop above
    if (edge.sourceId !== edge.targetId && getEdgeMode(graph, edge) !== 'directed') {
      result.push({ edge, nextId: edge.sourceId });
    }
  }
  return result;
}

// --- Walk generators ---

/**
 * Random walk. At each node, picks a uniformly random traversable edge
 * (outgoing edges, plus non-directed edges both ways).
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
    let traversable = getTraversableEdges(graph, currentId);
    if (options?.filter) {
      traversable = traversable.filter(({ edge }) => options.filter!(edge, ctx));
    }
    if (traversable.length === 0) return;

    const { edge, nextId } = traversable[Math.floor(rng() * traversable.length)];
    const node = getNode(graph, nextId)!;

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
    let traversable = getTraversableEdges(graph, currentId);
    if (options?.filter) {
      traversable = traversable.filter(({ edge }) => options.filter!(edge, ctx));
    }
    if (traversable.length === 0) return;

    const weights = traversable.map(({ edge }) => Math.max(0, getWeight(edge)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let r = rng() * total;
    let chosen = traversable[0];
    for (let i = 0; i < traversable.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = traversable[i];
        break;
      }
    }

    const node = getNode(graph, chosen.nextId)!;
    const step: GraphStep<N, E> = { edge: chosen.edge, node };
    currentId = node.id;
    ctx.currentNodeId = currentId;
    ctx.visitedNodes.add(currentId);
    ctx.visitedEdges.add(chosen.edge.id);
    ctx.stepCount++;

    options?.onStep?.(step, ctx);
    yield step;
  }
}

/**
 * Quick random walk targeting unvisited edges.
 * If unvisited traversable edges exist at the current node, picks one randomly.
 * Otherwise, walks the fewest-hop path (BFS, honoring `filter` and edge modes)
 * to the nearest unvisited edge. Ends when no unvisited edge is reachable.
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

  const allowedEdges = (nodeId: string) => {
    let traversable = getTraversableEdges(graph, nodeId);
    if (options?.filter) {
      traversable = traversable.filter(({ edge }) => options.filter!(edge, ctx));
    }
    return traversable;
  };

  while (visitedEdges.size < allEdgeIds.size) {
    const unvisited = allowedEdges(currentId).filter(
      ({ edge }) => !visitedEdges.has(edge.id),
    );

    if (unvisited.length > 0) {
      const { edge, nextId } = unvisited[Math.floor(rng() * unvisited.length)];
      const node = getNode(graph, nextId)!;
      const step: GraphStep<N, E> = { edge, node };
      currentId = node.id;
      ctx.currentNodeId = currentId;
      ctx.visitedNodes.add(currentId);
      visitedEdges.add(edge.id);
      ctx.stepCount++;
      options?.onStep?.(step, ctx);
      yield step;
    } else {
      // BFS to the nearest unvisited (filter-allowed) edge
      const prevStep = new Map<string, { edge: GraphEdge<E>; fromId: string }>();
      const seen = new Set([currentId]);
      const queue = [currentId];
      let found:
        | { atId: string; edge: GraphEdge<E>; nextId: string }
        | undefined;
      while (queue.length > 0 && !found) {
        const id = queue.shift()!;
        for (const t of allowedEdges(id)) {
          if (!visitedEdges.has(t.edge.id)) {
            found = { atId: id, edge: t.edge, nextId: t.nextId };
            break;
          }
          if (!seen.has(t.nextId)) {
            seen.add(t.nextId);
            prevStep.set(t.nextId, { edge: t.edge, fromId: id });
            queue.push(t.nextId);
          }
        }
      }
      if (!found) return; // no unvisited edge reachable under the filter

      // Reconstruct path currentId → found.atId, then take the unvisited edge
      const pathSteps: { edge: GraphEdge<E>; nextId: string }[] = [
        { edge: found.edge, nextId: found.nextId },
      ];
      let cursor = found.atId;
      while (cursor !== currentId) {
        const p = prevStep.get(cursor)!;
        pathSteps.unshift({ edge: p.edge, nextId: cursor });
        cursor = p.fromId;
      }

      for (const { edge, nextId } of pathSteps) {
        const node = getNode(graph, nextId)!;
        const step: GraphStep<N, E> = { edge, node };
        currentId = nextId;
        ctx.currentNodeId = currentId;
        ctx.visitedNodes.add(currentId);
        visitedEdges.add(edge.id);
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
 * Edges whose effective mode is not `'directed'` may be traversed
 * target → source as well.
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
    let nextId: string;
    if (edge.sourceId === currentId) {
      nextId = edge.targetId;
    } else if (
      edge.targetId === currentId &&
      getEdgeMode(graph, edge) !== 'directed'
    ) {
      nextId = edge.sourceId;
    } else {
      throw new Error(
        `Edge "${edgeId}" connects "${edge.sourceId}" → "${edge.targetId}" but current position is "${currentId}".`,
      );
    }
    const node = getNode(graph, nextId)!;
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

  if (visited.size >= target) return; // already covered before any step

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

  if (target <= 0) return; // nothing to cover

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
