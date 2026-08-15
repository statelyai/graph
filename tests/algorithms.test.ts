import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  genBFS,
  genDFS,
  isAcyclic,
  getConnectedComponents,
  getTopologicalSort,
  hasPath,
  isConnected,
  isTree,
  getShortestPath,
  getShortestPaths,
  getAllPairsShortestPaths,
  getSimplePaths,
  genSimplePaths,
} from '../src/algorithms';
import { getIndex } from '../src/indexing';

function makeDAG() {
  return createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'a', targetId: 'c' },
      { id: 'e3', sourceId: 'b', targetId: 'd' },
      { id: 'e4', sourceId: 'c', targetId: 'd' },
    ],
  });
}

function makeCyclicGraph() {
  return createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
      { id: 'e3', sourceId: 'c', targetId: 'a' },
    ],
  });
}

function makeDisconnectedGraph() {
  return createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'c', targetId: 'd' },
    ],
  });
}

describe('BFS / DFS', () => {
  it('genBFS visits in breadth-first order', () => {
    const g = makeDAG();
    const visited = [...genBFS(g, 'a')].map((n) => n.id);
    expect(visited[0]).toBe('a');
    // b and c should come before d
    expect(visited.indexOf('b')).toBeLessThan(visited.indexOf('d'));
    expect(visited.indexOf('c')).toBeLessThan(visited.indexOf('d'));
  });

  it('genDFS visits in depth-first order', () => {
    const g = makeDAG();
    const visited = [...genDFS(g, 'a')].map((n) => n.id);
    expect(visited[0]).toBe('a');
    expect(visited).toHaveLength(4);
  });

  it('genDFS re-pushes pending nodes to preserve depth-first order', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'p' }, { id: 'q' }, { id: 'r' }],
      edges: [
        { id: 'ap', sourceId: 'a', targetId: 'p' },
        { id: 'aq', sourceId: 'a', targetId: 'q' },
        { id: 'ar', sourceId: 'a', targetId: 'r' },
        { id: 'rp', sourceId: 'r', targetId: 'p' },
      ],
    });

    expect([...genDFS(g, 'a')].map((node) => node.id)).toEqual([
      'a',
      'r',
      'p',
      'q',
    ]);
    expect([...genDFS(g, { from: 'a' })].map((node) => node.id)).toEqual([
      'a',
      'r',
      'p',
      'q',
    ]);
  });

  it('genBFS follows undirected edge overrides in directed graphs', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', mode: 'undirected' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
      ],
    });

    expect([...genBFS(g, 'b')].map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('genBFS follows directed edge overrides in undirected graphs', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', mode: 'directed' }],
    });

    expect([...genBFS(g, 'b')].map((n) => n.id)).toEqual(['b']);
  });

  it('supports multiple BFS sources in source order', () => {
    const g = makeDAG();
    expect(
      [...genBFS(g, { from: ['a', 'c'] })].map((node) => node.id),
    ).toEqual(['a', 'c', 'b', 'd']);
  });

  it('supports incoming and undirected traversal', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(
      [...genBFS(g, { from: 'c', direction: 'incoming' })].map(
        (node) => node.id,
      ),
    ).toEqual(['c', 'b', 'a']);
    expect(
      [...genDFS(g, { from: 'c', direction: 'undirected' })].map(
        (node) => node.id,
      ),
    ).toEqual(['c', 'b', 'a']);
  });

  it('limits BFS and DFS by radius', () => {
    const g = makeDAG();
    expect(
      [...genBFS(g, { from: 'a', radius: 1 })].map((node) => node.id),
    ).toEqual(['a', 'b', 'c']);
    expect(
      [...genDFS(g, { from: 'a', radius: 0 })].map((node) => node.id),
    ).toEqual(['a']);
  });

  it('depth-first traverses the complete shortest-distance radius neighborhood', () => {
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'hub' },
        { id: 'deep' },
        { id: 'child' },
        { id: 'outside' },
      ],
      edges: [
        { id: 'direct', sourceId: 'a', targetId: 'hub' },
        { id: 'branch', sourceId: 'a', targetId: 'deep' },
        { id: 'rejoin', sourceId: 'deep', targetId: 'hub' },
        { id: 'child', sourceId: 'hub', targetId: 'child' },
        { id: 'outside', sourceId: 'child', targetId: 'outside' },
      ],
    });

    expect(
      [...genDFS(g, { from: 'a', radius: 2 })].map((node) => node.id),
    ).toEqual(['a', 'deep', 'hub', 'child']);
  });

  it('ignores unknown sources, deduplicates sources, and rejects invalid radii', () => {
    const g = makeDAG();
    expect(
      [...genBFS(g, { from: ['missing', 'a', 'a'] })].map(
        (node) => node.id,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(() => [...genBFS(g, { from: 'a', radius: -1 })]).toThrow(
      /non-negative integer/,
    );
    expect(() => [...genBFS(g, { from: 'a', radius: 1.5 })]).toThrow(
      /non-negative integer/,
    );
  });
});

describe('isAcyclic', () => {
  it('returns true for DAG', () => {
    expect(isAcyclic(makeDAG())).toBe(true);
  });

  it('returns false for cyclic graph', () => {
    expect(isAcyclic(makeCyclicGraph())).toBe(false);
  });

  it('returns true for empty graph', () => {
    expect(isAcyclic(createGraph())).toBe(true);
  });

  it('works for undirected acyclic (tree)', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(isAcyclic(g)).toBe(true);
  });

  it('works for undirected cyclic', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    expect(isAcyclic(g)).toBe(false);
  });
});

describe('getConnectedComponents', () => {
  it('returns one component for connected graph', () => {
    const components = getConnectedComponents(makeDAG());
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(4);
  });

  it('returns multiple components', () => {
    const components = getConnectedComponents(makeDisconnectedGraph());
    expect(components).toHaveLength(2);
    expect(components[0]).toHaveLength(2);
    expect(components[1]).toHaveLength(2);
  });
});

describe('getTopologicalSort', () => {
  it('returns valid topological order for DAG', () => {
    const result = getTopologicalSort(makeDAG());
    expect(result).not.toBeNull();
    const ids = result!.map((n) => n.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'));
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'));
  });

  it('returns null for cyclic graph', () => {
    expect(getTopologicalSort(makeCyclicGraph())).toBeNull();
  });
});

describe('hasPath', () => {
  it('returns true when path exists', () => {
    expect(hasPath(makeDAG(), 'a', 'd')).toBe(true);
  });

  it('returns false when no path exists', () => {
    expect(hasPath(makeDisconnectedGraph(), 'a', 'c')).toBe(false);
  });
});

describe('isConnected', () => {
  it('returns true for connected graph', () => {
    expect(isConnected(makeDAG())).toBe(true);
  });

  it('returns false for disconnected graph', () => {
    expect(isConnected(makeDisconnectedGraph())).toBe(false);
  });

  it('returns true for empty graph', () => {
    expect(isConnected(createGraph())).toBe(true);
  });
});

describe('isTree', () => {
  it('returns true for tree', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
      ],
    });
    expect(isTree(g)).toBe(true);
  });

  it('returns false for graph with cycle', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    expect(isTree(g)).toBe(false);
  });
});

// getShortestPaths

describe('getShortestPaths', () => {
  it('fans out from every node matching a source predicate', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', data: { entry: true } },
        { id: 'b', data: { entry: true } },
        { id: 'c', data: { entry: false } },
      ],
      edges: [
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    const paths = getShortestPaths(g, {
      from: (node) => node.data.entry,
      to: 'c',
    });

    expect(paths.map((path) => path.source.id)).toEqual(['a', 'b']);
  });

  it('returns no paths when a source predicate matches nothing', () => {
    expect(
      getShortestPaths(makeDAG(), { from: () => false, to: 'd' }),
    ).toEqual([]);
  });

  it('linear chain: returns paths to each node with increasing weight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const paths = getShortestPaths(g, { from: 'a' });
    expect(paths).toHaveLength(2); // to b and to c

    const toB = paths.find((p) => p.steps.at(-1)?.node.id === 'b')!;
    expect(toB.steps).toHaveLength(1);
    expect(toB.steps[0].edge.id).toBe('e1');
    expect(toB.steps[0].node.id).toBe('b');

    const toC = paths.find((p) => p.steps.at(-1)?.node.id === 'c')!;
    expect(toC.steps).toHaveLength(2);
  });

  it('diamond: returns ALL shortest paths of equal length', () => {
    const g = makeDAG(); // A→B→D, A→C→D
    const paths = getShortestPaths(g, { from: 'a', to: 'd' });

    // Both A→B→D and A→C→D are length 2
    expect(paths).toHaveLength(2);
    const routes = paths.map((p) => p.steps.map((s) => s.node.id).join('→'));
    expect(routes).toContain('b→d');
    expect(routes).toContain('c→d');
  });

  it('to filter returns only paths to that target', () => {
    const g = makeDAG();
    const paths = getShortestPaths(g, { from: 'a', to: 'b' });
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.at(-1)!.node.id).toBe('b');
  });

  it('unreachable node is not included', () => {
    const g = makeDisconnectedGraph(); // a-b, c-d
    const paths = getShortestPaths(g, { from: 'a' });
    const targets = paths.map((p) => p.steps.at(-1)!.node.id);
    expect(targets).toEqual(['b']);
  });

  it('follows undirected edge overrides in directed graphs', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', mode: 'undirected' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
      ],
    });

    const paths = getShortestPaths(g, { from: 'b', to: 'c' });
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.map((s) => s.node.id)).toEqual(['a', 'c']);
  });

  it('follows directed edge overrides in undirected graphs', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', mode: 'directed' }],
    });

    expect(getShortestPaths(g, { from: 'b', to: 'a' })).toEqual([]);
  });

  it('getWeight: Dijkstra picks lighter-weight path', () => {
    // A→B (weight 10), A→C (weight 1), C→B (weight 1)
    // Shortest to B by hops: A→B (1 hop). By weight: A→C→B (weight 2 < 10)
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 10 },
        { id: 'e2', sourceId: 'a', targetId: 'c', data: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', data: 1 },
      ],
    });
    const paths = getShortestPaths(g, {
      from: 'a',
      to: 'b',
      getWeight: (e) => e.data,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('defaults from to graph.initialNodeId', () => {
    const g = createGraph({
      initialNodeId: 'b',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    const paths = getShortestPaths(g);
    // From b, only c is reachable
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.at(-1)!.node.id).toBe('c');
  });

  it('defaults from to sole root (inDegree 0)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    // a is sole node with inDegree 0
    const paths = getShortestPaths(g);
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.at(-1)!.node.id).toBe('b');
  });

  it('throws when from cannot be determined', () => {
    const g = makeCyclicGraph(); // all nodes have inDegree > 0
    expect(() => getShortestPaths(g)).toThrow('Cannot determine start node');
  });

  it('step structure: edge leads to node', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const [path] = getShortestPaths(g, { from: 'a', to: 'b' });
    expect(path.steps[0].edge.sourceId).toBe('a');
    expect(path.steps[0].edge.targetId).toBe('b');
    expect(path.steps[0].node.id).toBe('b'); // node is the destination
  });

  it('source: every path includes the source node', () => {
    const g = makeDAG(); // A→B→D, A→C→D
    const paths = getShortestPaths(g, { from: 'a' });
    for (const path of paths) {
      expect(path.source.id).toBe('a');
    }
  });

  it('source: multi-step path has source distinct from first step node', () => {
    const g = makeDAG();
    const paths = getShortestPaths(g, { from: 'a', to: 'd' });
    for (const path of paths) {
      expect(path.source.id).toBe('a');
      // first step node is b or c, not a
      expect(path.steps[0].node.id).not.toBe('a');
    }
  });
});

// Bellman-Ford

describe('Bellman-Ford (algorithm: bellman-ford)', () => {
  it('finds shortest path with negative weights', () => {
    // A→B (weight 4), A→C (weight 1), C→B (weight -3)
    // Dijkstra would pick A→B (weight 4), Bellman-Ford picks A→C→B (weight -2)
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 4 },
        { id: 'e2', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', weight: -3 },
      ],
    });
    const paths = getShortestPaths(g, {
      from: 'a',
      to: 'b',
      algorithm: 'bellman-ford',
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('matches Dijkstra on non-negative weights', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'e2', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', weight: 1 },
      ],
    });
    const dijkstra = getShortestPaths(g, { from: 'a', to: 'b' });
    const bf = getShortestPaths(g, {
      from: 'a',
      to: 'b',
      algorithm: 'bellman-ford',
    });
    expect(bf).toHaveLength(dijkstra.length);
    expect(bf[0].steps.map((s) => s.node.id)).toEqual(
      dijkstra[0].steps.map((s) => s.node.id),
    );
  });

  it('throws on negative-weight cycle', () => {
    // A→B (1), B→C (-1), C→A (-1) → cycle weight = -1
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: -1 },
        { id: 'e3', sourceId: 'c', targetId: 'a', weight: -1 },
      ],
    });
    expect(() =>
      getShortestPaths(g, { from: 'a', algorithm: 'bellman-ford' }),
    ).toThrow('negative-weight cycle');
  });

  it('works with getWeight option', () => {
    const g = createGraph<unknown, { w: number }>({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: { w: 5 } },
        { id: 'e2', sourceId: 'a', targetId: 'c', data: { w: 1 } },
        { id: 'e3', sourceId: 'c', targetId: 'b', data: { w: -2 } },
      ],
    });
    const paths = getShortestPaths(g, {
      from: 'a',
      to: 'b',
      algorithm: 'bellman-ford',
      getWeight: (e) => e.data.w,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('getShortestPath returns single path with negative weights', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 4 },
        { id: 'e2', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', weight: -3 },
      ],
    });
    const path = getShortestPath(g, {
      from: 'a',
      to: 'b',
      algorithm: 'bellman-ford',
    });
    expect(path).toBeDefined();
    expect(path!.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('getAllPairsShortestPaths with bellman-ford', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 4 },
        { id: 'e2', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', weight: -3 },
      ],
    });
    const allPaths = getAllPairsShortestPaths(g, {
      algorithm: 'bellman-ford',
    });
    // From a: paths to b (via c) and c
    // From c: path to b
    // From b: no outgoing edges
    const fromA = allPaths.filter((p) => p.source.id === 'a');
    expect(fromA).toHaveLength(2);
    const aToBPath = fromA.find(
      (p) => p.steps.at(-1)?.node.id === 'b',
    )!;
    expect(aToBPath.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('handles unreachable nodes', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', weight: -1 }],
    });
    const paths = getShortestPaths(g, {
      from: 'a',
      algorithm: 'bellman-ford',
    });
    // Only b is reachable from a
    expect(paths).toHaveLength(1);
    expect(paths[0].steps.at(-1)!.node.id).toBe('b');
  });

  it('undirected graph with negative weight detects implicit cycle', () => {
    // Undirected edge with negative weight creates an implicit negative cycle
    // (traverse back and forth indefinitely), so Bellman-Ford should throw
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: -2 },
      ],
    });
    expect(() =>
      getShortestPaths(g, { from: 'a', algorithm: 'bellman-ford' }),
    ).toThrow('negative-weight cycle');
  });
});

// getSimplePaths

describe('getSimplePaths', () => {
  it('diamond: returns 2 simple paths to D', () => {
    const g = makeDAG(); // A→B→D, A→C→D
    const paths = getSimplePaths(g, { from: 'a', to: 'd' });
    expect(paths).toHaveLength(2);
    const routes = paths.map((p) => p.steps.map((s) => s.node.id).join('→'));
    expect(routes).toContain('b→d');
    expect(routes).toContain('c→d');
  });

  it('graph with cycle: terminates, no repeated nodes', () => {
    const g = makeCyclicGraph(); // a→b→c→a
    const paths = getSimplePaths(g, { from: 'a', to: 'c' });
    expect(paths.length).toBeGreaterThanOrEqual(1);
    for (const path of paths) {
      const nodeIds = path.steps.map((s) => s.node.id);
      // No duplicates
      expect(new Set(nodeIds).size).toBe(nodeIds.length);
    }
  });

  it('without to: paths to every reachable node', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'b', targetId: 'c' },
      ],
    });
    const paths = getSimplePaths(g, { from: 'a' });
    // Paths: a→b, a→c, a→b→c
    expect(paths).toHaveLength(3);
  });

  it('step structure: each step has edge and destination node', () => {
    const g = makeDAG();
    const [path] = getSimplePaths(g, { from: 'a', to: 'b' });
    expect(path.steps).toHaveLength(1);
    expect(path.steps[0].edge.sourceId).toBe('a');
    expect(path.steps[0].node.id).toBe('b');
  });

  it('source: every path includes the source node', () => {
    const g = makeDAG();
    const paths = getSimplePaths(g, { from: 'a' });
    for (const path of paths) {
      expect(path.source.id).toBe('a');
    }
  });

  it('source: single-step path has source as the origin', () => {
    const g = makeDAG();
    const paths = getSimplePaths(g, { from: 'a', to: 'b' });
    expect(paths).toHaveLength(1);
    expect(paths[0].source.id).toBe('a');
    expect(paths[0].steps[0].node.id).toBe('b');
  });

  it('defaults from to graph.initialNodeId', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const paths = getSimplePaths(g, { to: 'b' });
    expect(paths).toHaveLength(1);
  });
});

describe('genSimplePaths', () => {
  it('fans out lazily from every node matching a source predicate', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', data: 'entry' },
        { id: 'b', data: 'entry' },
        { id: 'c', data: 'target' },
      ],
      edges: [
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    const paths = [
      ...genSimplePaths(graph, {
        from: (node) => node.data === 'entry',
        to: 'c',
      }),
    ];

    expect(paths.map((path) => path.source.id)).toEqual(['a', 'b']);
  });

  it('yields the first path lazily without enumerating all paths', () => {
    // Chain of 30 diamond gadgets → 2^30 simple paths. Eager enumeration
    // would never finish; a lazy generator yields the first path instantly.
    const nodes = [{ id: 'n0' }];
    const edges: { id: string; sourceId: string; targetId: string }[] = [];
    const DIAMONDS = 30;
    for (let i = 0; i < DIAMONDS; i++) {
      const from = `n${i}`;
      const to = `n${i + 1}`;
      nodes.push({ id: `${from}_top` }, { id: `${from}_bottom` }, { id: to });
      edges.push(
        { id: `${from}-top`, sourceId: from, targetId: `${from}_top` },
        { id: `${from}-bottom`, sourceId: from, targetId: `${from}_bottom` },
        { id: `top-${to}`, sourceId: `${from}_top`, targetId: to },
        { id: `bottom-${to}`, sourceId: `${from}_bottom`, targetId: to },
      );
    }
    const graph = createGraph({ nodes, edges });

    const iterator = genSimplePaths(graph, {
      from: 'n0',
      to: `n${DIAMONDS}`,
    });
    const first = iterator.next();

    expect(first.done).toBe(false);
    // Each diamond contributes 2 steps, so the first path has 2 * DIAMONDS steps
    expect(first.value.steps).toHaveLength(2 * DIAMONDS);
  });
});

describe('single-target shortest path early exit', () => {
  it('chooses the globally shortest predicate-matched source', () => {
    const g = createGraph({
      nodes: [
        { id: 'far', data: { entry: true } },
        { id: 'near', data: { entry: true } },
        { id: 'middle', data: { entry: false } },
        { id: 'target', data: { entry: false } },
      ],
      edges: [
        { id: 'far-middle', sourceId: 'far', targetId: 'middle', weight: 1 },
        { id: 'middle-target', sourceId: 'middle', targetId: 'target', weight: 1 },
        { id: 'near-target', sourceId: 'near', targetId: 'target', weight: 1 },
      ],
    });

    const path = getShortestPath(g, {
      from: (node) => node.data.entry,
      to: 'target',
    });

    expect(path?.source.id).toBe('near');
    expect(path?.steps.map((step) => step.edge.id)).toEqual(['near-target']);
  });

  it('breaks equal predicate-source ties by graph order', () => {
    const g = createGraph({
      nodes: [
        { id: 'first', data: true },
        { id: 'second', data: true },
        { id: 'target', data: false },
      ],
      edges: [
        { id: 'first-target', sourceId: 'first', targetId: 'target' },
        { id: 'second-target', sourceId: 'second', targetId: 'target' },
      ],
    });

    expect(
      getShortestPath(g, { from: (node) => node.data, to: 'target' })?.source
        .id,
    ).toBe('first');
  });

  it('returns the same path and distance as a full search', () => {
    const g = createGraph({
      nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })),
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 2 },
        { id: 'e3', sourceId: 'a', targetId: 'c', weight: 5 },
        { id: 'e4', sourceId: 'c', targetId: 'd', weight: 1 },
        { id: 'e5', sourceId: 'd', targetId: 'e', weight: 9 },
      ],
    });
    const single = getShortestPath(g, { from: 'a', to: 'd' });
    const viaFull = getShortestPaths(g, { from: 'a' }).find(
      (p) => p.steps.at(-1)?.node.id === 'd',
    );
    expect(single?.steps.map((s) => s.edge.id)).toEqual(
      viaFull?.steps.map((s) => s.edge.id),
    );
  });

  it('keeps all tie paths through zero-weight edges to the target', () => {
    // Two equally-shortest paths to d, one via a zero-weight edge whose
    // predecessor settles at the same distance as the target — the early
    // exit must not drop it.
    const g = createGraph({
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 2 },
        { id: 'bd', sourceId: 'b', targetId: 'd', weight: 0 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 2 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 9 },
      ],
    });
    const paths = getShortestPaths(g, { from: 'a', to: 'd' });
    const routes = paths.map((p) => p.steps.map((s) => s.edge.id).join(','));
    expect(routes).toHaveLength(2);
    expect(routes).toContain('ad');
    expect(routes).toContain('ab,bd');
  });

  it('still reports unreachable targets as no path', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'island' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 1 }],
    });
    expect(getShortestPath(g, { from: 'a', to: 'island' })).toBeUndefined();
  });
});

describe('bidirectional single-pair shortest path', () => {
  function mulberry32(seed: number) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomGraph(seed: number, mode: 'directed' | 'undirected', mixed = false) {
    const rng = mulberry32(seed);
    const n = 60;
    const edges = [];
    for (let i = 0; i < 3 * n; i++) {
      const s = Math.floor(rng() * n);
      const t = Math.floor(rng() * n);
      if (s === t) continue;
      edges.push({
        id: `e${i}`,
        sourceId: `n${s}`,
        targetId: `n${t}`,
        weight: Math.floor(rng() * 10), // includes zero weights
        ...(mixed && rng() < 0.3 ? { mode: 'undirected' as const } : {}),
      });
    }
    return createGraph({
      mode,
      nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
      edges,
    });
  }

  function pathCost(path: { steps: { edge: { weight?: number } }[] }) {
    return path.steps.reduce((sum, s) => sum + (s.edge.weight ?? 1), 0);
  }

  it.each([
    ['directed', false],
    ['undirected', false],
    ['directed', true],
  ] as const)('matches full-search distances (%s, mixed=%s)', (mode, mixed) => {
    for (let seed = 1; seed <= 8; seed++) {
      const g = randomGraph(seed, mode as 'directed' | 'undirected', mixed);
      // Full search distances as the oracle
      const full = getShortestPaths(g, { from: 'n0' });
      const fullCost = new Map(
        full.map((p) => [p.steps.at(-1)?.node.id ?? 'n0', pathCost(p)]),
      );
      for (const to of ['n1', 'n17', 'n42', 'n59']) {
        const path = getShortestPath(g, { from: 'n0', to });
        if (!fullCost.has(to)) {
          expect(path).toBeUndefined();
          continue;
        }
        expect(path).toBeDefined();
        expect(pathCost(path!)).toBe(fullCost.get(to));
        // Path must be genuinely traversable from n0 to the target
        let position = 'n0';
        for (const step of path!.steps) {
          expect([step.edge.sourceId, step.edge.targetId]).toContain(position);
          position = step.node.id;
        }
        expect(position).toBe(to);
      }
    }
  });

  it('throws on negative weights, naming the edge', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: -3 },
      ],
    });
    expect(() => getShortestPath(g, { from: 'a', to: 'c' })).toThrowError(
      /Negative edge weight -3 .* "e2".*bellman-ford/,
    );
  });

  it('bellman-ford fallback still handles negative weights', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: -3 },
        { id: 'e3', sourceId: 'a', targetId: 'c', weight: 4 },
      ],
    });
    const path = getShortestPath(g, { from: 'a', to: 'c', algorithm: 'bellman-ford' });
    expect(path?.steps.map((s) => s.edge.id)).toEqual(['e1', 'e2']);
  });

  it('handles from === to, unknown ids, and unreachable targets', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'island' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 1 }],
    });
    expect(getShortestPath(g, { from: 'a', to: 'a' })?.steps).toEqual([]);
    expect(getShortestPath(g, { from: 'a', to: 'island' })).toBeUndefined();
    expect(getShortestPath(g, { from: 'a', to: 'ghost' })).toBeUndefined();
  });
});

describe('negative weights beyond the search frontier', () => {
  // Sublinear searches (early exit, bidirectional, A*) may never scan a
  // negative edge that lies past the target — they must still throw.
  const makeGraph = () =>
    createGraph({
      nodes: ['a', 'b', 'far1', 'far2'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bf', sourceId: 'b', targetId: 'far1', weight: 100 },
        { id: 'neg', sourceId: 'far1', targetId: 'far2', weight: -50 },
      ],
    });

  it('getShortestPath throws even when the negative edge is past the target', () => {
    expect(() => getShortestPath(makeGraph(), { from: 'a', to: 'b' })).toThrowError(
      /Negative edge weight -50 .* "neg".*bellman-ford/,
    );
  });

  it('getShortestPaths({ to }) throws as well', () => {
    expect(() => getShortestPaths(makeGraph(), { from: 'a', to: 'b' })).toThrowError(
      /Negative edge weight -50/,
    );
  });

  it('respects custom getWeight in the up-front check', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
      ],
    });
    expect(() =>
      getShortestPath(g, { from: 'a', to: 'b', getWeight: (e) => (e.id === 'bc' ? -1 : 1) }),
    ).toThrowError(/Negative edge weight -1/);
  });
});
