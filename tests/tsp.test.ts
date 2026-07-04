import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { getTSPTour } from '../src/algorithms/tsp';

/** Undirected weighted graph from an id → {neighborId: weight} adjacency. */
function makeWeighted(
  adjacency: Record<string, Record<string, number>>,
): ReturnType<typeof createGraph> {
  const nodes = Object.keys(adjacency).map((id) => ({ id }));
  const edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    weight: number;
  }> = [];
  const seen = new Set<string>();
  let e = 0;
  for (const [u, nbrs] of Object.entries(adjacency)) {
    for (const [v, w] of Object.entries(nbrs)) {
      const key = [u, v].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: `e${e++}`, sourceId: u, targetId: v, weight: w });
    }
  }
  return createGraph({ mode: 'undirected', nodes, edges });
}

describe('getTSPTour', () => {
  it('empty graph → zero-cost empty tour', () => {
    const g = createGraph({ mode: 'undirected' });
    expect(getTSPTour(g)).toEqual({ path: [], cost: 0 });
  });

  it('single node → zero-cost single tour', () => {
    const g = createGraph({ mode: 'undirected', nodes: [{ id: 'a' }] });
    expect(getTSPTour(g)).toEqual({ path: ['a'], cost: 0 });
  });

  it('disconnected graph → undefined', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'c', targetId: 'd' },
      ],
    });
    expect(getTSPTour(g)).toBeUndefined();
  });

  it('visits every node exactly once (valid permutation)', () => {
    const g = makeWeighted({
      a: { b: 1, c: 2, d: 3 },
      b: { c: 1, d: 2 },
      c: { d: 1 },
      d: {},
    });
    const tour = getTSPTour(g)!;
    expect(tour.path.length).toBe(4);
    expect(new Set(tour.path).size).toBe(4);
  });

  it('finds the optimal tour on a known square (metric)', () => {
    // 4 corners of a unit square, only the 4 side edges given (weight 1) plus
    // the diagonals (weight ~1.414). Optimal Hamiltonian cycle = 4 sides = 4.
    const g = makeWeighted({
      a: { b: 1, d: 1, c: 1.414 },
      b: { c: 1, d: 1.414 },
      c: { d: 1 },
      d: {},
    });
    const tour = getTSPTour(g, { method: '2opt' })!;
    expect(tour.cost).toBeCloseTo(4, 5);
  });

  it('2opt cost ≤ greedy cost', () => {
    // An instance where nearest-neighbor from a is known to be suboptimal.
    const g = makeWeighted({
      a: { b: 1, c: 10, d: 1, e: 10 },
      b: { c: 1, d: 10, e: 10 },
      c: { d: 1, e: 10 },
      d: { e: 1 },
      e: {},
    });
    const greedy = getTSPTour(g, { method: 'greedy' })!;
    const twoOpt = getTSPTour(g, { method: '2opt' })!;
    expect(twoOpt.cost).toBeLessThanOrEqual(greedy.cost + 1e-9);
  });

  it('uses metric closure for missing edges (shortest-path distance)', () => {
    // Path a–b–c–d, each weight 1. No direct a–d edge; the tour must route
    // through the path. Only Hamiltonian cycle on a line closes back: cost is
    // a-b-c-d (3) + d..a shortest path (3) = 6.
    const g = makeWeighted({
      a: { b: 1 },
      b: { c: 1 },
      c: { d: 1 },
      d: {},
    });
    const tour = getTSPTour(g, { method: '2opt' })!;
    expect(tour.path.length).toBe(4);
    expect(tour.cost).toBeCloseTo(6, 5);
  });

  it('respects the getWeight option', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 5 },
        { id: 'e2', sourceId: 'b', targetId: 'c', data: 7 },
        { id: 'e3', sourceId: 'a', targetId: 'c', data: 2 },
      ],
    });
    const tour = getTSPTour(g, {
      method: '2opt',
      getWeight: (e) => e.data as number,
    })!;
    // Triangle: only tour is a-b-c-a = 5+7+2 = 14 (any rotation/direction).
    expect(tour.cost).toBeCloseTo(14, 5);
  });
});
