import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  bfs,
  dfs,
  isAcyclic,
  getConnectedComponents,
  getTopologicalSort,
  hasPath,
  isConnected,
  isTree,
  getShortestPaths,
  getSimplePaths,
} from '../src/algorithms';

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
  it('bfs visits in breadth-first order', () => {
    const g = makeDAG();
    const visited = [...bfs(g, 'a')].map((n) => n.id);
    expect(visited[0]).toBe('a');
    // b and c should come before d
    expect(visited.indexOf('b')).toBeLessThan(visited.indexOf('d'));
    expect(visited.indexOf('c')).toBeLessThan(visited.indexOf('d'));
  });

  it('dfs visits in depth-first order', () => {
    const g = makeDAG();
    const visited = [...dfs(g, 'a')].map((n) => n.id);
    expect(visited[0]).toBe('a');
    expect(visited).toHaveLength(4);
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
      type: 'undirected',
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
      type: 'undirected',
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
      type: 'undirected',
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
      type: 'undirected',
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

// ---------------------------------------------------------------------------
// getShortestPaths
// ---------------------------------------------------------------------------

describe('getShortestPaths', () => {
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

// ---------------------------------------------------------------------------
// getSimplePaths
// ---------------------------------------------------------------------------

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
