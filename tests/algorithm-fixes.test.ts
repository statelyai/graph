import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  hasPath,
  isAcyclic,
  isTree,
  getCycles,
  getShortestPath,
  getShortestPaths,
  getAStarPath,
  getTopologicalSort,
  getStronglyConnectedComponents,
  getConnectedComponents,
  getBiconnectedComponents,
  getArticulationPoints,
  getMinimumSpanningTree,
  isIsomorphic,
} from '../src/algorithms';

describe('zero-weight cycle path reconstruction (bug 1)', () => {
  function makeZeroWeightCycleGraph() {
    return createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 0 },
        { id: 'e3', sourceId: 'c', targetId: 'b', weight: 0 },
      ],
    });
  }

  it('hasPath does not crash on zero-weight cycles', () => {
    const graph = makeZeroWeightCycleGraph();
    expect(hasPath(graph, 'a', 'b')).toBe(true);
    expect(hasPath(graph, 'a', 'c')).toBe(true);
    expect(hasPath(graph, 'b', 'a')).toBe(false);
  });

  it('getShortestPath does not crash on zero-weight cycles', () => {
    const graph = makeZeroWeightCycleGraph();
    const path = getShortestPath(graph, { from: 'a', to: 'b' });
    expect(path).toBeDefined();
    expect(path!.steps.map((step) => step.edge.id)).toEqual(['e1']);
  });

  it('getShortestPaths does not crash on zero-weight cycles', () => {
    const graph = makeZeroWeightCycleGraph();
    const paths = getShortestPaths(graph, { from: 'a' });
    expect(paths.length).toBe(2);
  });

  it('hasPath is correct on directed graphs', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(hasPath(graph, 'a', 'c')).toBe(true);
    expect(hasPath(graph, 'c', 'a')).toBe(false);
    expect(hasPath(graph, 'a', 'a')).toBe(true);
  });

  it('hasPath is correct on undirected graphs', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(hasPath(graph, 'a', 'c')).toBe(true);
    expect(hasPath(graph, 'c', 'a')).toBe(true);
  });
});

describe('negative weights with dijkstra (bug 2)', () => {
  function makeNegativeWeightGraph() {
    return createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 2 },
        { id: 'e2', sourceId: 'b', targetId: 'd', weight: 9 },
        { id: 'e3', sourceId: 'a', targetId: 'd', weight: 11 },
        { id: 'e4', sourceId: 'c', targetId: 'b', weight: -2 },
        { id: 'e5', sourceId: 'a', targetId: 'c', weight: 3 },
      ],
    });
  }

  it('getShortestPath throws on negative weights with dijkstra', () => {
    const graph = makeNegativeWeightGraph();
    expect(() => getShortestPath(graph, { from: 'a', to: 'd' })).toThrow(
      /Negative edge weight -2 on edge "c->b" \(id "e4"\).*bellman-ford/,
    );
  });

  it('getShortestPaths throws on negative weights with dijkstra', () => {
    const graph = makeNegativeWeightGraph();
    expect(() => getShortestPaths(graph, { from: 'a' })).toThrow(
      /Dijkstra requires non-negative weights/,
    );
  });

  it('getAStarPath throws on negative weights', () => {
    const graph = makeNegativeWeightGraph();
    expect(() =>
      getAStarPath(graph, { from: 'a', to: 'd', heuristic: () => 0 }),
    ).toThrow(/Negative edge weight -2/);
  });

  it('bellman-ford returns the cost-10 path', () => {
    const graph = makeNegativeWeightGraph();
    const path = getShortestPath(graph, {
      from: 'a',
      to: 'd',
      algorithm: 'bellman-ford',
    });
    expect(path).toBeDefined();
    expect(path!.steps.map((step) => step.edge.id)).toEqual(['e5', 'e4', 'e2']);
  });
});

describe('isTree on directed graphs (bug 3)', () => {
  it('returns false for a directed diamond', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'b', targetId: 'd' },
        { id: 'e4', sourceId: 'c', targetId: 'd' },
      ],
    });
    expect(isTree(graph)).toBe(false);
  });

  it('returns false for parallel edges', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b' },
      ],
    });
    expect(isTree(graph)).toBe(false);
  });

  it('returns true for a directed path graph', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(isTree(graph)).toBe(true);
  });

  it('returns true for an undirected tree', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(isTree(graph)).toBe(true);
  });

  it('returns true for empty and single-node graphs', () => {
    expect(isTree(createGraph({ nodes: [], edges: [] }))).toBe(true);
    expect(isTree(createGraph({ nodes: [{ id: 'a' }], edges: [] }))).toBe(true);
  });
});

describe('undirected cycle enumeration (bugs 4 and 10)', () => {
  it('finds all 3 distinct cycles sharing vertex subsets', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'c' },
        { id: 'e2', sourceId: 'c', targetId: 'd' },
        { id: 'e3', sourceId: 'd', targetId: 'a' },
        { id: 'e4', sourceId: 'b', targetId: 'c' },
        { id: 'e5', sourceId: 'b', targetId: 'd' },
      ],
    });
    expect(getCycles(graph)).toHaveLength(3);
  });

  it('reports a simple triangle exactly once', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    expect(getCycles(graph)).toHaveLength(1);
  });

  it('reports an undirected self-loop as a cycle, consistent with isAcyclic', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a' }],
    });
    expect(isAcyclic(graph)).toBe(false);
    const cycles = getCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps.map((step) => step.edge.id)).toEqual(['e1']);
  });
});

describe('biconnected components at DFS root (bug 5)', () => {
  it('splits components at a root-adjacent articulation point', () => {
    // Node order [b, a, c] makes b the DFS root.
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'b' }, { id: 'a' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const components = getBiconnectedComponents(graph).map((component) =>
      component.map((node) => node.id),
    );
    expect(components).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(getArticulationPoints(graph).map((node) => node.id)).toEqual(['b']);
  });
});

describe('SCC with non-directed edges (bug 6)', () => {
  it('treats an undirected edge as mutual reachability', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const sccs = getStronglyConnectedComponents(graph).map((component) =>
      component.map((node) => node.id).sort(),
    );
    expect(sccs).toEqual([['a', 'b']]);
  });

  it('SCCs of a fully undirected graph equal its connected components', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'd', targetId: 'e' },
      ],
    });
    const norm = (components: { id: string }[][]) =>
      components
        .map((component) => component.map((node) => node.id).sort().join(','))
        .sort();
    expect(norm(getStronglyConnectedComponents(graph))).toEqual(
      norm(getConnectedComponents(graph)),
    );
  });

  it('one undirected edge merges two directed cycles', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'd', targetId: 'c' },
        { id: 'e5', sourceId: 'b', targetId: 'c', mode: 'undirected' },
      ],
    });
    const sccs = getStronglyConnectedComponents(graph).map((component) =>
      component.map((node) => node.id).sort(),
    );
    expect(sccs).toEqual([['a', 'b', 'c', 'd']]);
  });
});

describe('getTopologicalSort with non-directed edges (bug 7)', () => {
  it('returns null for an undirected graph', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getTopologicalSort(graph)).toBeNull();
  });

  it('returns null for a directed DAG with one undirected-override edge', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'undirected' },
      ],
    });
    expect(getTopologicalSort(graph)).toBeNull();
  });
});

describe('isIsomorphic self-loop edgeMatch (bug 8)', () => {
  it('compares self-loop edges with edgeMatch', () => {
    const red = createGraph({
      nodes: [{ id: 'a' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'a', data: { color: 'red' } },
      ],
    });
    const blue = createGraph({
      nodes: [{ id: 'a' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'a', data: { color: 'blue' } },
      ],
    });
    const edgeMatch = (
      x: { data: { color: string } },
      y: { data: { color: string } },
    ) => x.data.color === y.data.color;
    expect(isIsomorphic(red, blue, { edgeMatch })).toBe(false);
    expect(isIsomorphic(red, red, { edgeMatch })).toBe(true);
  });
});

describe('Prim spanning forest on disconnected graphs (bug 9)', () => {
  it('prim and kruskal both return the full spanning forest', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'c', targetId: 'd', weight: 1 },
      ],
    });
    const prim = getMinimumSpanningTree(graph, { algorithm: 'prim' });
    const kruskal = getMinimumSpanningTree(graph, { algorithm: 'kruskal' });
    expect(prim.edges).toHaveLength(2);
    expect(kruskal.edges).toHaveLength(2);
  });
});
