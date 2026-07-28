import { describe, expect, it } from 'vitest';
import {
  createGraph,
  getCoveragePreservingPaths,
  getCoverageTargets,
  getEdgeCoveragePaths,
  getEulerianCircuit,
  getEulerianPath,
  getLineGraph,
  getPathCoverage,
  getPathEdges,
  getPathNodes,
  getPathWeight,
  getReducedPaths,
  getShortestPath,
  getSimplePaths,
  getShortestSimplePaths,
  hasSubpath,
  isValidPath,
  type Graph,
  type GraphPath,
} from '../src';

function getPath<N, E>(
  graph: Graph<N, E>,
  from: string,
  to: string,
): GraphPath<N, E> {
  return getShortestPath(graph, { from, to })!;
}

describe('path utilities', () => {
  const graph = createGraph({
    initialNodeId: 'a',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b', weight: 2 },
      { id: 'bc', sourceId: 'b', targetId: 'c', weight: 3 },
    ],
  });
  const ab = getPath(graph, 'a', 'b');
  const abc = getPath(graph, 'a', 'c');
  const bc = getPath(graph, 'b', 'c');

  it('inspects and validates paths', () => {
    expect(getPathNodes(abc).map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(getPathEdges(abc).map((edge) => edge.id)).toEqual(['ab', 'bc']);
    expect(getPathWeight(abc)).toBe(5);
    expect(isValidPath(graph, abc)).toBe(true);
    expect(
      isValidPath(graph, {
        source: abc.source,
        steps: [{ edge: graph.edges[0], node: graph.nodes[2] }],
      }),
    ).toBe(false);
  });

  it('distinguishes prefix and contiguous containment', () => {
    expect(hasSubpath(abc, ab, { containment: 'prefix' })).toBe(true);
    expect(hasSubpath(abc, bc, { containment: 'prefix' })).toBe(false);
    expect(hasSubpath(abc, bc, { containment: 'contiguous' })).toBe(true);
  });

  it('removes contained paths without reordering retained paths', () => {
    expect(
      getReducedPaths([ab, bc, abc], { containment: 'prefix' }),
    ).toEqual([bc, abc]);
    expect(
      getReducedPaths([ab, bc, abc]),
    ).toEqual([abc]);
  });
});

describe('coverage targets and measurement', () => {
  const graph = createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'ba', sourceId: 'b', targetId: 'a' },
    ],
  });

  it('derives node, edge, edge-pair, and maximal-simple-path targets', () => {
    expect(getCoverageTargets(graph, { kind: 'nodes' })).toHaveLength(3);
    expect(getCoverageTargets(graph, { kind: 'edges' })).toHaveLength(3);
    expect(getCoverageTargets(graph, { kind: 'edge-pairs' })).toEqual([
      { type: 'subpath', sourceId: 'a', edgeIds: ['ab', 'bc'] },
      { type: 'subpath', sourceId: 'a', edgeIds: ['ab', 'ba'] },
      { type: 'subpath', sourceId: 'b', edgeIds: ['ba', 'ab'] },
    ]);
    expect(
      getCoverageTargets(graph, { kind: 'maximal-simple-paths' }).length,
    ).toBeGreaterThan(0);
  });

  it('represents an isolated maximal simple path by its source node', () => {
    const isolated = createGraph({ nodes: [{ id: 'only' }] });
    expect(
      getCoverageTargets(isolated, { kind: 'maximal-simple-paths' }),
    ).toEqual([{ type: 'subpath', sourceId: 'only', edgeIds: [] }]);
  });

  it('measures a path set against explicit targets', () => {
    const path = getPath(graph, 'a', 'c');
    const targets = getCoverageTargets(graph, { kind: 'edge-pairs' });
    const coverage = getPathCoverage(graph, [path], { targets });

    expect(coverage.coveredNodeIds).toEqual(['a', 'b', 'c']);
    expect(coverage.coveredEdgeIds).toEqual(['ab', 'bc']);
    expect(coverage.coveredTargets).toEqual([targets[0]]);
    expect(coverage.uncoveredTargets).toEqual(targets.slice(1));
  });

  it('reduces candidates without losing target coverage', () => {
    const ab = getPath(graph, 'a', 'b');
    const abc = getPath(graph, 'a', 'c');
    const ba = getPath(graph, 'b', 'a');
    const targets = getCoverageTargets(graph, { kind: 'edges' });

    for (const strategy of ['greedy', 'exact'] as const) {
      const reduced = getCoveragePreservingPaths([ab, abc, ba], {
        targets,
        strategy,
      });
      expect(reduced).toEqual([abc, ba]);
      expect(
        getPathCoverage(graph, reduced, { targets }).coveredTargets,
      ).toHaveLength(3);
    }
  });

  it('bounds exponential exact reduction', () => {
    const path = getPath(graph, 'a', 'b');
    expect(() =>
      getCoveragePreservingPaths([path, path], {
        targets: getCoverageTargets(graph, { kind: 'edges' }),
        strategy: 'exact',
        exactLimit: 1,
      }),
    ).toThrow('at most 1 paths');
  });
});

describe('getEdgeCoveragePaths', () => {
  it('covers reachable back-edges and reports unreachable edges', () => {
    const graph = createGraph({
      initialNodeId: 'a',
      nodes: [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'x' },
        { id: 'y' },
      ],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'xy', sourceId: 'x', targetId: 'y' },
      ],
    });

    const result = getEdgeCoveragePaths(graph);

    expect(result.paths).toHaveLength(2);
    expect(new Set(result.coveredEdgeIds)).toEqual(new Set(['ab', 'ba', 'ac']));
    expect(result.uncoveredEdgeIds).toEqual(['xy']);
    expect(result.optimal).toBe(false);
  });

  it('keeps parallel edges and self-loops distinct', () => {
    const graph = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'fast', sourceId: 'a', targetId: 'b' },
        { id: 'slow', sourceId: 'a', targetId: 'b' },
        { id: 'loop', sourceId: 'a', targetId: 'a' },
      ],
    });
    const result = getEdgeCoveragePaths(graph);
    expect(new Set(result.coveredEdgeIds)).toEqual(
      new Set(['fast', 'slow', 'loop']),
    );
  });

  it('returns empty coverage for an edgeless graph without requiring a source', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    expect(getEdgeCoveragePaths(graph)).toEqual({
      paths: [],
      coveredEdgeIds: [],
      uncoveredEdgeIds: [],
      totalWeight: 0,
      optimal: false,
    });
  });

  it('rejects negative weights consistently', () => {
    const graph = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'negative', sourceId: 'a', targetId: 'a', weight: -1 }],
    });
    expect(() => getEdgeCoveragePaths(graph)).toThrow('non-negative');
  });
});

describe('ordered shortest simple paths', () => {
  it('yields alternatives in nondecreasing weight order', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bd', sourceId: 'b', targetId: 'd', weight: 1 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 1 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 3 },
      ],
    });

    const paths = getShortestSimplePaths(graph, { from: 'a', to: 'd' });
    expect(paths.map((path) => getPathWeight(path))).toEqual([2, 2, 3]);
    expect(
      getShortestSimplePaths(graph, { from: 'a', to: 'd', limit: 2 }),
    ).toHaveLength(2);
    expect(
      getShortestSimplePaths(graph, { from: 'a', to: 'd', limit: 0 }),
    ).toEqual([]);

    const expected = new Set([
      'ab,bd',
      'ac,cd',
      'ad',
    ]);
    expect(
      new Set(
        paths.map((path) => path.steps.map((step) => step.edge.id).join(',')),
      ),
    ).toEqual(expected);
  });

  it('matches exhaustive simple paths on cycles and parallel edges', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'ab2', sourceId: 'a', targetId: 'b', weight: 2 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 1 },
        { id: 'bd', sourceId: 'b', targetId: 'd', weight: 1 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 1 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 5 },
      ],
    });
    const identity = (path: GraphPath) =>
      path.steps.map((step) => step.edge.id).join(',');
    const exhaustive = getSimplePaths(graph, { from: 'a', to: 'd' });
    const ordered = getShortestSimplePaths(graph, { from: 'a', to: 'd' });

    expect(new Set(ordered.map(identity))).toEqual(
      new Set(exhaustive.map(identity)),
    );
    expect(ordered.map((path) => getPathWeight(path))).toEqual(
      ordered.map((path) => getPathWeight(path)).sort((a, b) => a - b),
    );
  });
});

describe('Eulerian paths', () => {
  it('finds directed paths and circuits', () => {
    const pathGraph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(
      getEulerianPath(pathGraph)?.steps.map((step) => step.edge.id),
    ).toEqual(['ab', 'bc']);
    expect(getEulerianCircuit(pathGraph)).toBeUndefined();

    const circuitGraph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
      ],
    });
    expect(getEulerianCircuit(circuitGraph)?.steps).toHaveLength(2);
  });

  it('allows either odd endpoint as an undirected start', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(getEulerianPath(graph, { from: 'c' })?.steps).toHaveLength(2);
  });

  it('rejects disconnected and genuinely mixed graphs', () => {
    const disconnected = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'x' }, { id: 'y' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
        { id: 'xy', sourceId: 'x', targetId: 'y' },
        { id: 'yx', sourceId: 'y', targetId: 'x' },
      ],
    });
    expect(getEulerianCircuit(disconnected)).toBeUndefined();

    const mixed = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'directed', sourceId: 'a', targetId: 'b' },
        {
          id: 'undirected',
          sourceId: 'a',
          targetId: 'b',
          mode: 'undirected',
        },
      ],
    });
    expect(getEulerianPath(mixed)).toBeUndefined();
  });
});

describe('getLineGraph', () => {
  it('maps edges to nodes and consecutive traversals to edges', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });
    const line = getLineGraph(graph);
    expect(line.nodes.map((node) => node.id)).toEqual(['ab', 'bc', 'ac']);
    expect(line.edges).toMatchObject([
      { sourceId: 'ab', targetId: 'bc', data: { viaNodeId: 'b' } },
    ]);
  });

  it('preserves both shared endpoints of undirected parallel edges', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'one', sourceId: 'a', targetId: 'b' },
        { id: 'two', sourceId: 'a', targetId: 'b' },
      ],
    });
    const line = getLineGraph(graph);
    expect(line.edges.map((edge) => edge.data.viaNodeId).sort()).toEqual([
      'a',
      'b',
    ]);
  });
});
