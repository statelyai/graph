import { describe, expect, it } from 'vitest';
import GraphologyGraph from 'graphology';
import { connectedComponents } from 'graphology-components';
import { dijkstra } from 'graphology-shortest-path';
import pagerank from 'graphology-metrics/centrality/pagerank';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';

import { createGraph } from '../../src/graph';
import {
  getConnectedComponents,
  getShortestPath,
  getBetweennessCentrality,
  getPageRank,
} from '../../src/algorithms';
import { getDegree, getInDegree, getOutDegree } from '../../src/queries';
import type { Graph } from '../../src/types';
import { makeRandomGraph } from './generators';

/**
 * Differential oracle tests: build the same seeded random SIMPLE graph
 * (no self-loops, no parallel edges) in both our library and graphology,
 * and require the results to agree.
 *
 * Every oracle is first verified on a hand-checked small example so the
 * comparison itself is known to be meaningful (not vacuously aligned).
 */

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];
const MODES = ['directed', 'undirected'] as const;

function toGraphology(
  graph: Graph,
  type: 'directed' | 'undirected',
): InstanceType<typeof GraphologyGraph> {
  const gg = new GraphologyGraph({ type, multi: false, allowSelfLoops: true });
  for (const node of graph.nodes) gg.addNode(node.id);
  for (const edge of graph.edges) {
    gg.addEdgeWithKey(
      edge.id,
      edge.sourceId,
      edge.targetId,
      edge.weight !== undefined ? { weight: edge.weight } : {},
    );
  }
  return gg;
}

/** Canonical form for sets-of-sets comparison: sort inner, sort outer. */
function canonicalComponents(components: string[][]): string[][] {
  return components
    .map((component) => [...component].sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 1. Connected components
// ---------------------------------------------------------------------------

describe('oracle: connected components', () => {
  it('hand-verified: directed a->b plus isolated c (weak connectivity in both libs)', () => {
    // Both our getConnectedComponents and graphology's connectedComponents
    // treat directed edges as connections (weak connectivity), so the
    // directed oracle is valid. Verified here on a known example.
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const theirs = toGraphology(ours, 'directed');

    const ourComponents = canonicalComponents(
      getConnectedComponents(ours).map((c) => c.map((n) => n.id)),
    );
    const theirComponents = canonicalComponents(connectedComponents(theirs));

    expect(ourComponents).toEqual([['a', 'b'], ['c']]);
    expect(theirComponents).toEqual([['a', 'b'], ['c']]);
  });

  for (const mode of MODES) {
    for (const seed of SEEDS) {
      it(`agrees with graphology (${mode}, seed ${seed})`, () => {
        const ours = makeRandomGraph(seed, { mode, density: 1.2 });
        const theirs = toGraphology(ours, mode);

        expect(
          canonicalComponents(
            getConnectedComponents(ours).map((c) => c.map((n) => n.id)),
          ),
        ).toEqual(canonicalComponents(connectedComponents(theirs)));
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Dijkstra distances + reachability
// ---------------------------------------------------------------------------

/** Sum the weight of a graphology node-sequence path using our edge list. */
function pathWeightFromNodeSequence(
  graph: Graph,
  nodeSequence: string[],
  undirected: boolean,
): number {
  const weightByPair = new Map<string, number>();
  for (const edge of graph.edges) {
    const w = edge.weight ?? 1;
    const forward = `${edge.sourceId}|${edge.targetId}`;
    weightByPair.set(forward, Math.min(weightByPair.get(forward) ?? Infinity, w));
    if (undirected) {
      const back = `${edge.targetId}|${edge.sourceId}`;
      weightByPair.set(back, Math.min(weightByPair.get(back) ?? Infinity, w));
    }
  }
  let total = 0;
  for (let i = 1; i < nodeSequence.length; i++) {
    const w = weightByPair.get(`${nodeSequence[i - 1]}|${nodeSequence[i]}`);
    expect(w).toBeDefined();
    total += w!;
  }
  return total;
}

function ourPathWeight(graph: Graph, from: string, to: string): number | undefined {
  const path = getShortestPath(graph, { from, to });
  if (path === undefined) return undefined;
  return path.steps.reduce((sum, step) => sum + (step.edge.weight ?? 1), 0);
}

describe('oracle: dijkstra distances', () => {
  it('hand-verified: a->b->c (1+1) beats direct a->c (5)', () => {
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'a', targetId: 'c', weight: 5 },
      ],
    });
    const theirs = toGraphology(ours, 'directed');

    expect(ourPathWeight(ours, 'a', 'c')).toBe(2);
    const theirPaths = dijkstra.singleSource(theirs, 'a', 'weight');
    expect(pathWeightFromNodeSequence(ours, theirPaths['c'], false)).toBe(2);
    // d is unreachable in both
    expect(ourPathWeight(ours, 'a', 'd')).toBeUndefined();
    expect(theirPaths['d']).toBeUndefined();
  });

  for (const mode of MODES) {
    for (const seed of SEEDS) {
      it(`agrees with graphology (${mode}, seed ${seed})`, () => {
        const ours = makeRandomGraph(seed, {
          mode,
          weighted: true,
          density: 1.6,
          maxNodes: 100,
        });
        const theirs = toGraphology(ours, mode);
        const source = 'n0';

        const theirPaths = dijkstra.singleSource(theirs, source, 'weight');
        const theirReachable = new Set(
          Object.keys(theirPaths).filter((id) => id !== source),
        );

        for (const node of ours.nodes) {
          if (node.id === source) continue;
          const ourWeight = ourPathWeight(ours, source, node.id);

          // Reachability sets must agree
          expect(theirReachable.has(node.id)).toBe(ourWeight !== undefined);

          if (ourWeight !== undefined) {
            const theirWeight = pathWeightFromNodeSequence(
              ours,
              theirPaths[node.id],
              mode === 'undirected',
            );
            expect(ourWeight).toBe(theirWeight);
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. PageRank
// ---------------------------------------------------------------------------

// Tolerance for PageRank comparison. Both implementations redistribute
// dangling-node mass uniformly and use power iteration, but their
// convergence checks differ (ours: max per-node delta; graphology: L1 error
// < N * tolerance) and ours re-normalizes at the end. With a tight inner
// tolerance (1e-9) both converge far enough that 1e-3 per-node agreement is
// meaningful.
const PAGERANK_TOLERANCE = 1e-3;
const PAGERANK_OPTIONS = { alpha: 0.85, maxIterations: 200, tolerance: 1e-9 };

describe('oracle: pagerank', () => {
  it('hand-verified: 3-cycle gives 1/3 each in both libs', () => {
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    const theirs = toGraphology(ours, 'directed');

    const ourScores = getPageRank(ours, PAGERANK_OPTIONS);
    const theirScores = pagerank(theirs, {
      ...PAGERANK_OPTIONS,
      getEdgeWeight: null,
    });

    for (const id of ['a', 'b', 'c']) {
      expect(ourScores[id]).toBeCloseTo(1 / 3, 6);
      expect(theirScores[id]).toBeCloseTo(1 / 3, 6);
    }
  });

  it('hand-verified: dangling sink (a->c, b->c) handled identically', () => {
    // c is a dangling node (out-degree 0). Both implementations
    // redistribute dangling mass uniformly across all nodes, so the
    // sink-bearing oracle is valid — verified here before the random loop.
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'c' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const theirs = toGraphology(ours, 'directed');

    const ourScores = getPageRank(ours, PAGERANK_OPTIONS);
    const theirScores = pagerank(theirs, {
      ...PAGERANK_OPTIONS,
      getEdgeWeight: null,
    });

    expect(ourScores['a']).toBeCloseTo(ourScores['b'], 9);
    expect(ourScores['c']).toBeGreaterThan(ourScores['a']);
    for (const id of ['a', 'b', 'c']) {
      expect(Math.abs(ourScores[id] - theirScores[id])).toBeLessThan(
        PAGERANK_TOLERANCE,
      );
    }
  });

  for (const mode of MODES) {
    for (const seed of SEEDS) {
      it(`agrees with graphology within ${PAGERANK_TOLERANCE} (${mode}, seed ${seed})`, () => {
        const ours = makeRandomGraph(seed, { mode, density: 1.8 });
        const theirs = toGraphology(ours, mode);

        const ourScores = getPageRank(ours, PAGERANK_OPTIONS);
        // Our PageRank is unweighted, so disable graphology's default
        // 'weight' attribute lookup.
        const theirScores = pagerank(theirs, {
          ...PAGERANK_OPTIONS,
          getEdgeWeight: null,
        });

        for (const node of ours.nodes) {
          expect(
            Math.abs(ourScores[node.id] - theirScores[node.id]),
            `pagerank(${node.id})`,
          ).toBeLessThan(PAGERANK_TOLERANCE);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Degrees
// ---------------------------------------------------------------------------

describe('oracle: degrees', () => {
  it('hand-verified: directed square', () => {
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'a', targetId: 'd' },
      ],
    });
    const theirs = toGraphology(ours, 'directed');

    expect(getDegree(ours, 'a')).toBe(2);
    expect(getOutDegree(ours, 'a')).toBe(2);
    expect(getInDegree(ours, 'd')).toBe(2);
    expect(theirs.degree('a')).toBe(2);
    expect(theirs.outDegree('a')).toBe(2);
    expect(theirs.inDegree('d')).toBe(2);
  });

  for (const seed of SEEDS) {
    it(`directed degree/inDegree/outDegree agree exactly (seed ${seed})`, () => {
      const ours = makeRandomGraph(seed, { mode: 'directed' });
      const theirs = toGraphology(ours, 'directed');

      for (const node of ours.nodes) {
        expect(getDegree(ours, node.id), `degree(${node.id})`).toBe(
          theirs.degree(node.id),
        );
        expect(getInDegree(ours, node.id), `inDegree(${node.id})`).toBe(
          theirs.inDegree(node.id),
        );
        expect(getOutDegree(ours, node.id), `outDegree(${node.id})`).toBe(
          theirs.outDegree(node.id),
        );
      }
    });

    it(`undirected degree agrees exactly (seed ${seed})`, () => {
      // Only total degree is compared for undirected graphs: graphology's
      // inDegree/outDegree count directed edges only (0 on a pure
      // undirected graph), while ours count undirected edges toward both.
      const ours = makeRandomGraph(seed, { mode: 'undirected' });
      const theirs = toGraphology(ours, 'undirected');

      for (const node of ours.nodes) {
        expect(getDegree(ours, node.id), `degree(${node.id})`).toBe(
          theirs.degree(node.id),
        );
      }
    });
  }

  it('pinned divergence: undirected self-loop counts 1 for us, 2 for graphology', () => {
    // Intentional, documented in src/queries.ts getDegree JSDoc: a
    // non-directed self-loop counts once for us; graphology (like most
    // libraries) counts a self-loop as 2 in undirected degree. Oracle
    // graphs exclude self-loops so this divergence never triggers above.
    const ours = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    const theirs = toGraphology(ours, 'undirected');

    expect(getDegree(ours, 'a')).toBe(1);
    expect(theirs.degree('a')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Betweenness centrality
// ---------------------------------------------------------------------------

const BETWEENNESS_TOLERANCE = 1e-6;

describe('oracle: betweenness centrality', () => {
  it('hand-verified: undirected path a-b-c gives b=1, a=c=0', () => {
    const ours = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const theirs = toGraphology(ours, 'undirected');

    const ourScores = getBetweennessCentrality(ours);
    const theirScores = betweennessCentrality(theirs, {
      normalized: true,
      getEdgeWeight: null,
    });

    expect(ourScores['b']).toBeCloseTo(1, 9);
    expect(ourScores['a']).toBeCloseTo(0, 9);
    expect(theirScores['b']).toBeCloseTo(1, 9);
    expect(theirScores['a']).toBeCloseTo(0, 9);
  });

  it('hand-verified: directed path a->b->c gives b=0.5 (1 of (n-1)(n-2)=2 ordered pairs)', () => {
    const ours = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const theirs = toGraphology(ours, 'directed');

    const ourScores = getBetweennessCentrality(ours);
    const theirScores = betweennessCentrality(theirs, {
      normalized: true,
      getEdgeWeight: null,
    });

    expect(ourScores['b']).toBeCloseTo(0.5, 9);
    expect(theirScores['b']).toBeCloseTo(0.5, 9);
  });

  for (const mode of MODES) {
    for (const seed of SEEDS) {
      it(`agrees with graphology within ${BETWEENNESS_TOLERANCE} (${mode}, seed ${seed})`, () => {
        // Our betweenness is unweighted (Brandes over BFS shortest paths),
        // so graphology gets getEdgeWeight: null.
        const ours = makeRandomGraph(seed, { mode, density: 1.6, maxNodes: 100 });
        const theirs = toGraphology(ours, mode);

        const ourScores = getBetweennessCentrality(ours);
        const theirScores = betweennessCentrality(theirs, {
          normalized: true,
          getEdgeWeight: null,
        });

        for (const node of ours.nodes) {
          expect(
            Math.abs(ourScores[node.id] - theirScores[node.id]),
            `betweenness(${node.id})`,
          ).toBeLessThan(BETWEENNESS_TOLERANCE);
        }
      });
    }
  }
});
