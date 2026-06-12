import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  isBipartite,
  getMaximumBipartiteMatching,
  getMaxFlow,
} from '../src/algorithms';
import { createGridGraph } from '../src/generators';
import type { Graph } from '../src/types';
import type { BipartiteMatch } from '../src/algorithms';

function makeCycle(n: number): Graph {
  return createGraph({
    mode: 'undirected',
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges: Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      sourceId: `n${i}`,
      targetId: `n${(i + 1) % n}`,
    })),
  });
}

/** A matching is valid when its edges exist as claimed and share no node. */
function expectValidMatching(graph: Graph, matches: BipartiteMatch[]): void {
  const used = new Set<string>();
  for (const match of matches) {
    const edge = graph.edges.find((e) => e.id === match.edgeId);
    expect(edge).toBeDefined();
    expect(edge!.sourceId).toBe(match.sourceId);
    expect(edge!.targetId).toBe(match.targetId);
    expect(used.has(match.sourceId)).toBe(false);
    expect(used.has(match.targetId)).toBe(false);
    used.add(match.sourceId);
    used.add(match.targetId);
  }
}

describe('isBipartite', () => {
  it('accepts even cycles and rejects odd cycles', () => {
    expect(isBipartite(makeCycle(4))).toBe(true);
    expect(isBipartite(makeCycle(6))).toBe(true);
    expect(isBipartite(makeCycle(3))).toBe(false);
    expect(isBipartite(makeCycle(5))).toBe(false);
  });

  it('accepts trees and the empty graph', () => {
    const tree = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });

    expect(isBipartite(tree)).toBe(true);
    expect(isBipartite(createGraph())).toBe(true);
  });

  it('treats directed edges as undirected (directed odd cycle is not bipartite)', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
      ],
    });

    expect(isBipartite(graph)).toBe(false);
  });

  it('rejects self-loops', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });

    expect(isBipartite(graph)).toBe(false);
  });

  it('rejects a graph whose only odd cycle sits in a later component', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: ['a', 'b', 'x', 'y', 'z'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'xy', sourceId: 'x', targetId: 'y' },
        { id: 'yz', sourceId: 'y', targetId: 'z' },
        { id: 'zx', sourceId: 'z', targetId: 'x' },
      ],
    });

    expect(isBipartite(graph)).toBe(false);
  });

  it('considers grid graphs bipartite', () => {
    expect(isBipartite(createGridGraph(3, 4))).toBe(true);
  });
});

describe('getMaximumBipartiteMatching', () => {
  it('finds the known maximum on an instance where greedy gets stuck', () => {
    // l1:{r1,r2}, l2:{r1}, l3:{r2,r3}. Greedy l1→r1 strands l2; the maximum
    // matching has size 3 (l1-r2, l2-r1, l3-r3) — hand-verified.
    const graph = createGraph({
      mode: 'undirected',
      nodes: ['l1', 'l2', 'l3', 'r1', 'r2', 'r3'].map((id) => ({ id })),
      edges: [
        { id: 'e1', sourceId: 'l1', targetId: 'r1' },
        { id: 'e2', sourceId: 'l1', targetId: 'r2' },
        { id: 'e3', sourceId: 'l2', targetId: 'r1' },
        { id: 'e4', sourceId: 'l3', targetId: 'r2' },
        { id: 'e5', sourceId: 'l3', targetId: 'r3' },
      ],
    });

    const matches = getMaximumBipartiteMatching(graph);

    expect(matches).toHaveLength(3);
    expectValidMatching(graph, matches);
  });

  it('finds the known maximum on a graph without a perfect matching', () => {
    // l1:{r1,r2}, l2:{r1}, l3:{r2}: only 2 right nodes are reachable by
    // {l2, l3}, so the maximum matching has size 2 — hand-verified (König).
    const graph = createGraph({
      mode: 'undirected',
      nodes: ['l1', 'l2', 'l3', 'r1', 'r2'].map((id) => ({ id })),
      edges: [
        { id: 'e1', sourceId: 'l1', targetId: 'r1' },
        { id: 'e2', sourceId: 'l1', targetId: 'r2' },
        { id: 'e3', sourceId: 'l2', targetId: 'r1' },
        { id: 'e4', sourceId: 'l3', targetId: 'r2' },
      ],
    });

    const matches = getMaximumBipartiteMatching(graph);

    expect(matches).toHaveLength(2);
    expectValidMatching(graph, matches);
  });

  it('finds a perfect matching on an even cycle', () => {
    const graph = makeCycle(6);
    const matches = getMaximumBipartiteMatching(graph);

    expect(matches).toHaveLength(3);
    expectValidMatching(graph, matches);
  });

  it('matches floor(n·m / 2) nodes on grid graphs', () => {
    const grid3x3 = createGridGraph(3, 3);
    const grid4x4 = createGridGraph(4, 4);

    const matches3x3 = getMaximumBipartiteMatching(grid3x3);
    const matches4x4 = getMaximumBipartiteMatching(grid4x4);

    expect(matches3x3).toHaveLength(4);
    expect(matches4x4).toHaveLength(8);
    expectValidMatching(grid3x3, matches3x3);
    expectValidMatching(grid4x4, matches4x4);
  });

  it('agrees with the unit-capacity max-flow formulation', () => {
    // Cross-check on the 3x4 grid: matching size must equal max flow in
    // the network s→left (cap 1), left→right (cap 1), right→t (cap 1).
    const grid = createGridGraph(3, 4);
    const matches = getMaximumBipartiteMatching(grid);

    // Bipartition by checkerboard parity of `n{r}_{c}` ids.
    const isLeft = (id: string): boolean => {
      const [r, c] = id.slice(1).split('_').map(Number);
      return (r + c) % 2 === 0;
    };
    const flowGraph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }, ...grid.nodes.map((n) => ({ id: n.id }))],
      edges: [
        ...grid.nodes.map((n) => ({
          id: `cap-${n.id}`,
          sourceId: isLeft(n.id) ? 's' : n.id,
          targetId: isLeft(n.id) ? n.id : 't',
          weight: 1,
        })),
        ...grid.edges.map((e) => ({
          id: e.id,
          sourceId: isLeft(e.sourceId) ? e.sourceId : e.targetId,
          targetId: isLeft(e.sourceId) ? e.targetId : e.sourceId,
          weight: 1,
        })),
      ],
    });

    const { value } = getMaxFlow(flowGraph, { from: 's', to: 't' });
    expect(matches).toHaveLength(value);
  });

  it('returns an empty matching for empty and edgeless graphs', () => {
    expect(getMaximumBipartiteMatching(createGraph())).toEqual([]);
    expect(
      getMaximumBipartiteMatching(createGraph({ nodes: [{ id: 'a' }] })),
    ).toEqual([]);
  });

  it('throws a descriptive error on non-bipartite graphs', () => {
    expect(() => getMaximumBipartiteMatching(makeCycle(5))).toThrow(
      /not bipartite/,
    );
  });
});
