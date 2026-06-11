import { describe, it, expect } from 'vitest';
import { createGraph } from '../src';
import type { GraphConfig } from '../src/types';
import {
  isAcyclic,
  getCycles,
  getDegreeCentrality,
  getInDegreeCentrality,
  getOutDegreeCentrality,
  getClosenessCentrality,
  getPageRank,
  getMinimumSpanningTree,
  getStronglyConnectedComponents,
  getAllPairsShortestPaths,
  isIsomorphic,
} from '../src/algorithms';

describe('isAcyclic with per-edge mode overrides', () => {
  it('detects a cycle formed by a directed edge plus an undirected override', () => {
    // a→b directed, plus an undirected a—b: traversable back → cycle
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b', mode: 'undirected' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
    expect(getCycles(g)).toHaveLength(1);
  });

  it('does not report parallel directed-override edges in an undirected graph as a cycle', () => {
    // All effective modes are directed → two parallel a→b edges are acyclic
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', mode: 'directed' },
        { id: 'e2', sourceId: 'a', targetId: 'b', mode: 'directed' },
      ],
    });
    expect(isAcyclic(g)).toBe(true);
    expect(getCycles(g)).toHaveLength(0);
  });

  it('finds mixed cycles that arrival-edge-skip DFS misses', () => {
    // u→a, a→v directed; v—u undirected. The only cycle uses all 3 edges.
    const g = createGraph({
      nodes: [{ id: 'u' }, { id: 'a' }, { id: 'v' }],
      edges: [
        { id: 'ua', sourceId: 'u', targetId: 'a' },
        { id: 'av', sourceId: 'a', targetId: 'v' },
        { id: 'vu', sourceId: 'v', targetId: 'u', mode: 'undirected' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(3);
  });

  it('resolves large acyclic mixed graphs in polynomial time', () => {
    // 30 chained diamonds = 2^30 simple paths. Before the SCC-restricted
    // fast path, mixed isAcyclic enumerated paths from every start node and
    // effectively hung on this shape; now it resolves via the SCC singleton
    // check plus one trivial 2-node SCC.
    const nodes = [{ id: 'n0' }];
    const edges: { id: string; sourceId: string; targetId: string; mode?: 'undirected' }[] = [];
    for (let i = 0; i < 30; i++) {
      const from = `n${i}`;
      const to = `n${i + 1}`;
      nodes.push({ id: `${from}_t` }, { id: `${from}_b` }, { id: to });
      edges.push(
        { id: `${from}-t`, sourceId: from, targetId: `${from}_t` },
        { id: `${from}-b`, sourceId: from, targetId: `${from}_b` },
        { id: `t-${to}`, sourceId: `${from}_t`, targetId: to },
        { id: `b-${to}`, sourceId: `${from}_b`, targetId: to },
      );
    }
    // One undirected edge to a fresh leaf makes the graph genuinely mixed
    nodes.push({ id: 'leaf' });
    edges.push({ id: 'u', sourceId: 'n30', targetId: 'leaf', mode: 'undirected' });
    const g = createGraph({ nodes, edges });

    const start = performance.now();
    expect(isAcyclic(g)).toBe(true);
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it('fast path catches cycles among directed edges only', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
        { id: 'e3', sourceId: 'a', targetId: 'c', mode: 'undirected' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
  });

  it('fast path catches cycles among non-directed edges only', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', mode: 'undirected' },
        { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'undirected' },
        { id: 'e3', sourceId: 'c', targetId: 'a', mode: 'undirected' },
        { id: 'e4', sourceId: 'a', targetId: 'd' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
  });

  it('fast path catches non-directed self-loops in mixed graphs', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'loop', sourceId: 'a', targetId: 'a', mode: 'undirected' },
        { id: 'e', sourceId: 'a', targetId: 'b' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
  });

  it('acyclic mixed graph stays acyclic', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'undirected' },
      ],
    });
    expect(isAcyclic(g)).toBe(true);
    expect(getCycles(g)).toHaveLength(0);
  });
});

describe('undirected 2-cycles via parallel edges', () => {
  it('reports two parallel undirected edges as one 2-step cycle, consistent with isAcyclic', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(2);
  });

  it('does not invent a cycle from a single undirected edge', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(isAcyclic(g)).toBe(true);
    expect(getCycles(g)).toHaveLength(0);
  });

  it('still reports each triangle exactly once', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
      ],
    });
    expect(getCycles(g)).toHaveLength(1);
  });
});

describe('override-equivalence: undirected graph ≡ directed graph with all edges overridden', () => {
  // The same topology expressed two ways must agree everywhere.
  const topology = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
      { id: 'bc', sourceId: 'b', targetId: 'c', weight: 2 },
      { id: 'cd', sourceId: 'c', targetId: 'd', weight: 3 },
      { id: 'da', sourceId: 'd', targetId: 'a', weight: 4 },
      { id: 'ce', sourceId: 'c', targetId: 'e', weight: 5 },
    ],
  };
  const asUndirected = () =>
    createGraph({ mode: 'undirected', ...structuredClone(topology) });
  const asOverridden = () =>
    createGraph({
      mode: 'directed',
      nodes: structuredClone(topology.nodes),
      edges: structuredClone(topology.edges).map((e) => ({
        ...e,
        mode: 'undirected' as const,
      })),
    });

  it('agrees on isAcyclic and cycle count', () => {
    expect(isAcyclic(asOverridden())).toBe(isAcyclic(asUndirected()));
    expect(getCycles(asOverridden()).length).toBe(
      getCycles(asUndirected()).length,
    );
  });

  it('agrees on degree/in/out centrality', () => {
    expect(getDegreeCentrality(asOverridden())).toEqual(
      getDegreeCentrality(asUndirected()),
    );
    expect(getInDegreeCentrality(asOverridden())).toEqual(
      getInDegreeCentrality(asUndirected()),
    );
    expect(getOutDegreeCentrality(asOverridden())).toEqual(
      getOutDegreeCentrality(asUndirected()),
    );
  });

  it('agrees on closeness and PageRank', () => {
    expect(getClosenessCentrality(asOverridden())).toEqual(
      getClosenessCentrality(asUndirected()),
    );
    expect(getPageRank(asOverridden())).toEqual(getPageRank(asUndirected()));
  });

  it('agrees on MST total weight (prim and kruskal)', () => {
    for (const algorithm of ['prim', 'kruskal'] as const) {
      const total = (g: ReturnType<typeof asUndirected>) =>
        getMinimumSpanningTree(g, { algorithm }).edges.reduce(
          (sum, e) => sum + (e.weight ?? 1),
          0,
        );
      expect(total(asOverridden())).toBe(total(asUndirected()));
    }
  });

  it('agrees on strongly connected components', () => {
    const sizes = (g: ReturnType<typeof asUndirected>) =>
      getStronglyConnectedComponents(g)
        .map((c) => c.length)
        .sort();
    expect(sizes(asOverridden())).toEqual(sizes(asUndirected()));
  });

  it('the two representations are isomorphic to each other', () => {
    expect(isIsomorphic(asUndirected(), asOverridden())).toBe(true);
  });
});

describe('per-edge mode in centrality', () => {
  it('PageRank treats an undirected-override edge symmetrically', () => {
    // Directed graph; the only edge is an undirected override, so both
    // endpoints must end with identical scores.
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', mode: 'undirected' }],
    });
    const scores = getPageRank(g);
    expect(scores.a).toBeCloseTo(scores.b, 10);
  });

  it('closeness reaches nodes backwards across undirected-override edges', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'c', targetId: 'b', mode: 'undirected' },
      ],
    });
    // From a: reach b (directed), then c (undirected backwards traversal of e2)
    const scores = getClosenessCentrality(g);
    expect(scores.a).toBeGreaterThan(0);
  });
});

describe('per-edge mode in MST (prim)', () => {
  it('prim spans across undirected-override edges in a directed graph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        // Only traversable b←c via the override; without per-edge handling
        // prim never reaches c from the a-component
        { id: 'e2', sourceId: 'c', targetId: 'b', weight: 2, mode: 'undirected' },
      ],
    });
    const mst = getMinimumSpanningTree(g, { algorithm: 'prim' });
    expect(mst.edges).toHaveLength(2);
  });
});

describe('MST output preserves entity fields', () => {
  it('keeps node ports/visual fields and edge mode/ports', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out' }], shape: 'circle', x: 5 },
        { id: 'b', ports: [{ name: 'in' }] },
      ],
      edges: [
        {
          id: 'e',
          sourceId: 'a',
          targetId: 'b',
          weight: 1,
          mode: 'undirected',
          sourcePort: 'out',
          targetPort: 'in',
          color: 'red',
        },
      ],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.nodes[0].ports?.[0].name).toBe('out');
    expect(mst.nodes[0].shape).toBe('circle');
    expect(mst.nodes[0].x).toBe(5);
    expect(mst.edges[0].mode).toBe('undirected');
    expect(mst.edges[0].sourcePort).toBe('out');
    expect(mst.edges[0].targetPort).toBe('in');
    expect(mst.edges[0].color).toBe('red');
  });
});

describe('per-edge mode in isomorphism', () => {
  it('distinguishes a directed edge from an undirected override', () => {
    const directed = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const overridden = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', mode: 'undirected' }],
    });
    expect(isIsomorphic(directed, overridden)).toBe(false);
  });

  it('matches graphs whose override placement is mirrored', () => {
    const g1 = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'undirected' },
      ],
    });
    const g2 = createGraph({
      nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      edges: [
        { id: 'f1', sourceId: 'x', targetId: 'y' },
        // Same shape: the undirected edge authored in the other direction
        { id: 'f2', sourceId: 'z', targetId: 'y', mode: 'undirected' },
      ],
    });
    expect(isIsomorphic(g1, g2)).toBe(true);
  });
});

describe('Floyd-Warshall negative cycles', () => {
  it('throws a descriptive error instead of crashing on reconstruction', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'a', weight: -2 },
      ],
    });
    expect(() =>
      getAllPairsShortestPaths(g, { algorithm: 'floyd-warshall' }),
    ).toThrowError(/Negative cycle detected through node ".+"/);
  });

  it('still works with negative weights but no negative cycle', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: -2 },
      ],
    });
    const paths = getAllPairsShortestPaths(g, { algorithm: 'floyd-warshall' });
    expect(paths.length).toBeGreaterThan(0);
  });
});
