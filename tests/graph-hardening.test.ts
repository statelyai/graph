import { describe, expect, it } from 'vitest';
import {
  createGraph,
  deleteEntities,
  getAllPairsShortestPaths,
  getAStarPath,
  getArticulationPoints,
  getBiconnectedComponents,
  getBridges,
  getFilteredGraph,
  getMappedGraph,
  getMinimumSpanningTree,
  getShortestPath,
  getShortestPaths,
  getUnweightedDistances,
  isStronglyConnected,
  isWeaklyConnected,
} from '../src';
import { getMaxFlow } from '../src/algorithms';

describe('finite weighted arithmetic', () => {
  const pathGraph = createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b', weight: Number.MAX_VALUE },
      { id: 'bc', sourceId: 'b', targetId: 'c', weight: Number.MAX_VALUE },
    ],
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects a non-finite shortest-path weight: %s',
    (weight) => {
      expect(() =>
        getShortestPath(pathGraph, {
          from: 'a',
          to: 'c',
          getWeight: () => weight,
        }),
      ).toThrow(/finite/);
    },
  );

  it('rejects shortest-path cost overflow', () => {
    expect(() => getShortestPath(pathGraph, { from: 'a', to: 'c' })).toThrow(
      /finite number range/,
    );
  });

  it('applies the finite contract to Bellman-Ford, Floyd-Warshall, and A*', () => {
    expect(() =>
      getShortestPaths(pathGraph, {
        from: 'a',
        algorithm: 'bellman-ford',
        getWeight: () => NaN,
      }),
    ).toThrow(/finite/);
    expect(() =>
      getAllPairsShortestPaths(pathGraph, { algorithm: 'floyd-warshall' }),
    ).toThrow(/finite number range/);
    expect(() =>
      getAStarPath(pathGraph, {
        from: 'a',
        to: 'c',
        heuristic: () => 0,
      }),
    ).toThrow(/finite number range/);
    expect(() =>
      getAStarPath(pathGraph, {
        from: 'a',
        to: 'a',
        heuristic: () => NaN,
      }),
    ).toThrow(/finite/);
  });

  it('rejects non-finite minimum-spanning-tree weights', () => {
    expect(() =>
      getMinimumSpanningTree(pathGraph, { getWeight: () => NaN }),
    ).toThrow(/finite/);
  });

  it('rejects non-finite capacities and total-flow overflow', () => {
    const flowGraph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }],
      edges: [
        { id: 'a', sourceId: 's', targetId: 't' },
        { id: 'b', sourceId: 's', targetId: 't' },
      ],
    });
    expect(() =>
      getMaxFlow(flowGraph, {
        from: 's',
        to: 't',
        getCapacity: () => Infinity,
      }),
    ).toThrow(/finite/);
    expect(() =>
      getMaxFlow(flowGraph, {
        from: 's',
        to: 't',
        getCapacity: () => Number.MAX_VALUE,
      }),
    ).toThrow(/finite number range/);
  });
});

describe('unweighted reachability', () => {
  const graph = createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'cb', sourceId: 'c', targetId: 'b' },
    ],
  });

  it('returns hop distances in each traversal direction', () => {
    expect([...getUnweightedDistances(graph, 'a')]).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect([
      ...getUnweightedDistances(graph, 'b', { direction: 'incoming' }),
    ]).toEqual([
      ['b', 0],
      ['a', 1],
      ['c', 1],
    ]);
    expect([
      ...getUnweightedDistances(graph, 'a', { direction: 'undirected' }),
    ]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(getUnweightedDistances(graph, 'missing').size).toBe(0);
  });

  it('distinguishes weak and strong connectivity', () => {
    expect(isWeaklyConnected(graph)).toBe(true);
    expect(isStronglyConnected(graph)).toBe(false);

    const cycle = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
      ],
    });
    expect(isStronglyConnected(cycle)).toBe(true);
  });
});

describe('low-link hardening', () => {
  it('includes a self-loop as a singleton biconnected component', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    expect(getBiconnectedComponents(graph)).toEqual([[graph.nodes[0]]]);
    expect(getBridges(graph)).toEqual([]);
    expect(getArticulationPoints(graph)).toEqual([]);
  });

  it('is stack-safe on a deep chain', () => {
    const count = 20_000;
    const graph = createGraph({
      mode: 'undirected',
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}` })),
      edges: Array.from({ length: count - 1 }, (_, index) => ({
        id: `e${index}`,
        sourceId: `n${index}`,
        targetId: `n${index + 1}`,
      })),
    });
    expect(getBridges(graph)).toHaveLength(count - 1);
    expect(getArticulationPoints(graph)).toHaveLength(count - 2);
  });
});

describe('mutation-stable transforms and bulk deletion', () => {
  it('maps a structural snapshot when a callback mutates the source', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', data: 1 }, { id: 'b', data: 2 }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', data: 3 }],
    });
    const mapped = getMappedGraph(graph, {
      node: (node) => {
        if (node.id === 'a') deleteEntities(graph, 'b');
        return node.data * 2;
      },
      edge: (edge) => edge.data * 2,
    });
    expect(mapped.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(mapped.edges.map((edge) => edge.id)).toEqual(['ab']);
  });

  it('filters a structural snapshot when a callback mutates the source', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    const filtered = getFilteredGraph(graph, {
      node: (node) => {
        if (node.id === 'a') deleteEntities(graph, 'b');
        return true;
      },
    });
    expect(filtered.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(filtered.edges.map((edge) => edge.id)).toEqual(['ab']);
  });

  it('accepts a same-graph-backed iterable and deletes in one batch', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    deleteEntities(
      graph,
      (function* () {
        for (const node of graph.nodes) {
          if (node.id !== 'c') yield node.id;
        }
      })(),
    );
    expect(graph.nodes.map((node) => node.id)).toEqual(['c']);
    expect(graph.edges).toEqual([]);
  });
});
