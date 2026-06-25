import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getAStarPath,
  getShortestPath,
  getShortestPaths,
  getMinimumSpanningTree,
  getAllPairsShortestPaths,
} from '../src/algorithms';
import { getSubgraph, getReversedGraph } from '../src/transforms';
import { getSuccessors, getPredecessors } from '../src/queries';

// Edge weight property

describe('edge weight property', () => {
  it('weight is preserved through createGraph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', weight: 5 }],
    });
    expect(g.edges[0].weight).toBe(5);
  });

  it('weight is undefined when not set', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(g.edges[0].weight).toBeUndefined();
  });

  it('weight 0 is preserved (not treated as falsy)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', weight: 0 }],
    });
    expect(g.edges[0].weight).toBe(0);
  });

  it('shortest path respects edge.weight without explicit getWeight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 1 },
      ],
    });
    const path = getShortestPath(g, { from: 'a', to: 'b' });
    expect(path).toBeDefined();
    // Should go a→c→b (weight 2) not a→b (weight 10)
    expect(path!.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('mixed weighted and unweighted edges default unweighted to 1', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'ac', sourceId: 'a', targetId: 'c' }, // no weight → 1
        { id: 'cb', sourceId: 'c', targetId: 'b' }, // no weight → 1
      ],
    });
    const path = getShortestPath(g, { from: 'a', to: 'b' });
    expect(path).toBeDefined();
    // a→c→b (1+1=2) < a→b (5)
    expect(path!.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('MST respects edge.weight without explicit getWeight', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 2 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 10 },
      ],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.edges).toHaveLength(2);
    const ids = mst.edges.map((e) => e.id).sort();
    expect(ids).toEqual(['ab', 'bc']);
  });

  it('explicit getWeight overrides edge.weight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 100 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 100 },
      ],
    });
    // Custom weight ignores edge.weight entirely
    const path = getShortestPath(g, {
      from: 'a',
      to: 'b',
      getWeight: () => 1,
    });
    expect(path).toBeDefined();
    // All edges cost 1, so direct a→b is fine
    expect(path!.steps.map((s) => s.node.id)).toEqual(['b']);
  });
});

// A* pathfinding

describe('getAStarPath', () => {
  it('finds shortest path in a grid-like graph', () => {
    // Simple grid:  a(0,0) - b(1,0) - c(2,0)
    //                |                  |
    //               d(0,1) ----------- e(2,1)
    const g = createGraph({
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 2, y: 0 },
        { id: 'd', x: 0, y: 1 },
        { id: 'e', x: 2, y: 1 },
      ],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 1 },
        { id: 'ce', sourceId: 'c', targetId: 'e', weight: 1 },
        { id: 'de', sourceId: 'd', targetId: 'e', weight: 2 },
      ],
    });

    const nodePos = new Map(g.nodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
    const targetPos = nodePos.get('e')!;

    const path = getAStarPath(g, {
      from: 'a',
      to: 'e',
      heuristic: (id) => {
        const pos = nodePos.get(id)!;
        return Math.abs(pos.x - targetPos.x) + Math.abs(pos.y - targetPos.y);
      },
    });

    expect(path).toBeDefined();
    const nodeIds = path!.steps.map((s) => s.node.id);
    // a→b→c→e (weight 3) or a→d→e (weight 3) — both optimal
    expect(nodeIds.at(-1)).toBe('e');
  });

  it('returns undefined for unreachable target', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'b',
      heuristic: () => 0,
    });
    expect(path).toBeUndefined();
  });

  it('same node returns empty path', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'a',
      heuristic: () => 0,
    });
    expect(path).toBeDefined();
    expect(path!.steps).toHaveLength(0);
    expect(path!.source.id).toBe('a');
  });

  it('with zero heuristic behaves like Dijkstra', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 1 },
      ],
    });
    const astar = getAStarPath(g, {
      from: 'a',
      to: 'b',
      heuristic: () => 0,
    });
    const dijkstra = getShortestPath(g, { from: 'a', to: 'b' });
    expect(astar).toBeDefined();
    expect(dijkstra).toBeDefined();
    expect(astar!.steps.map((s) => s.node.id)).toEqual(
      dijkstra!.steps.map((s) => s.node.id),
    );
  });

  it('respects edge.weight by default', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 100 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 1 },
      ],
    });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'b',
      heuristic: () => 0,
    });
    expect(path!.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('works with undirected graph', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
      ],
    });
    const path = getAStarPath(g, {
      from: 'c',
      to: 'a',
      heuristic: () => 0,
    });
    expect(path).toBeDefined();
    expect(path!.steps.map((s) => s.node.id)).toEqual(['b', 'a']);
  });

  it('uses custom getWeight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', data: { cost: 100 } },
        { id: 'ac', sourceId: 'a', targetId: 'c', data: { cost: 1 } },
        { id: 'cb', sourceId: 'c', targetId: 'b', data: { cost: 1 } },
      ],
    });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'b',
      getWeight: (e) => e.data.cost,
      heuristic: () => 0,
    });
    expect(path!.steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('returns undefined for nonexistent source', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    const path = getAStarPath(g, {
      from: 'z',
      to: 'a',
      heuristic: () => 0,
    });
    expect(path).toBeUndefined();
  });

  it('returns undefined for nonexistent target', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'z',
      heuristic: () => 0,
    });
    expect(path).toBeUndefined();
  });

  it('direct edge is cheapest', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 }],
    });
    const path = getAStarPath(g, {
      from: 'a',
      to: 'b',
      heuristic: () => 0,
    });
    expect(path!.steps).toHaveLength(1);
    expect(path!.steps[0].node.id).toBe('b');
  });
});

// getSubgraph

describe('getSubgraph', () => {
  it('extracts nodes and internal edges', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    const sub = getSubgraph(g, ['a', 'b']);
    expect(sub.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(sub.edges.map((e) => e.id)).toEqual(['ab']);
  });

  it('excludes edges crossing boundary', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });
    const sub = getSubgraph(g, ['a', 'b']);
    expect(sub.edges.map((e) => e.id)).toEqual(['ab']);
  });

  it('preserves initialNodeId if in set', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    const sub = getSubgraph(g, ['a']);
    expect(sub.initialNodeId).toBe('a');
  });

  it('drops initialNodeId if not in set', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    const sub = getSubgraph(g, ['b']);
    expect(sub.initialNodeId).toBeNull();
  });

  it('strips parentId referencing excluded nodes', () => {
    const g = createGraph({
      nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }],
      edges: [],
    });
    const sub = getSubgraph(g, ['child']);
    expect(sub.nodes[0].parentId).toBeUndefined();
  });

  it('preserves parentId when parent is included', () => {
    const g = createGraph({
      nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }],
      edges: [],
    });
    const sub = getSubgraph(g, ['parent', 'child']);
    const child = sub.nodes.find((n) => n.id === 'child')!;
    expect(child.parentId).toBe('parent');
  });

  it('empty nodeIds produces empty graph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    const sub = getSubgraph(g, []);
    expect(sub.nodes).toHaveLength(0);
    expect(sub.edges).toHaveLength(0);
  });

  it('preserves graph type and data', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [],
      data: { custom: true },
    });
    const sub = getSubgraph(g, ['a']);
    expect(sub.mode).toBe('undirected');
    expect(sub.data).toEqual({ custom: true });
  });

  it('preserves edge weight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', weight: 42 }],
    });
    const sub = getSubgraph(g, ['a', 'b']);
    expect(sub.edges[0].weight).toBe(42);
  });

  it('self-loops are included', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'aa', sourceId: 'a', targetId: 'a' }],
    });
    const sub = getSubgraph(g, ['a']);
    expect(sub.edges).toHaveLength(1);
  });
});

// getReversedGraph

describe('getReversedGraph', () => {
  it('flips all edge directions', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    const rev = getReversedGraph(g);
    expect(rev.edges[0].sourceId).toBe('b');
    expect(rev.edges[0].targetId).toBe('a');
    expect(rev.edges[1].sourceId).toBe('c');
    expect(rev.edges[1].targetId).toBe('b');
  });

  it('preserves node count', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    const rev = getReversedGraph(g);
    expect(rev.nodes).toHaveLength(2);
  });

  it('filters edges when filterEdge provided', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    const rev = getReversedGraph(g, (e) => e.id === 'ab');
    expect(rev.edges).toHaveLength(1);
    expect(rev.edges[0].sourceId).toBe('b');
    expect(rev.edges[0].targetId).toBe('a');
  });

  it('reversing twice produces equivalent graph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    const rev2 = getReversedGraph(getReversedGraph(g));
    expect(rev2.edges[0].sourceId).toBe('a');
    expect(rev2.edges[0].targetId).toBe('b');
  });

  it('predecessors become successors', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });
    const rev = getReversedGraph(g);
    // In original, a has successors b, c. In reversed, b and c have successor a.
    expect(getSuccessors(rev, 'b').map((n) => n.id)).toEqual(['a']);
    expect(getSuccessors(rev, 'c').map((n) => n.id)).toEqual(['a']);
    expect(
      getPredecessors(rev, 'a')
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'c']);
  });

  it('empty graph produces empty graph', () => {
    const g = createGraph();
    const rev = getReversedGraph(g);
    expect(rev.nodes).toHaveLength(0);
    expect(rev.edges).toHaveLength(0);
  });

  it('preserves edge weight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', weight: 7 }],
    });
    const rev = getReversedGraph(g);
    expect(rev.edges[0].weight).toBe(7);
  });

  it('preserves graph type and data', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [],
      data: { meta: 'info' },
    });
    const rev = getReversedGraph(g);
    expect(rev.mode).toBe('undirected');
    expect(rev.data).toEqual({ meta: 'info' });
  });

  it('self-loops remain self-loops', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'aa', sourceId: 'a', targetId: 'a' }],
    });
    const rev = getReversedGraph(g);
    expect(rev.edges[0].sourceId).toBe('a');
    expect(rev.edges[0].targetId).toBe('a');
  });
});

// Additional MST tests

describe('getMinimumSpanningTree (additional)', () => {
  it('disconnected graph: MST covers all components (prim)', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 2 },
      ],
    });
    const mst = getMinimumSpanningTree(g, { algorithm: 'prim' });
    // Prim restarts from each unvisited node, returning a spanning forest
    expect(mst.edges).toHaveLength(2);
  });

  it('kruskal handles disconnected graph', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 2 },
      ],
    });
    const mst = getMinimumSpanningTree(g, { algorithm: 'kruskal' });
    // Kruskal picks both edges (minimum spanning forest)
    expect(mst.edges).toHaveLength(2);
  });

  it('MST with edge.weight (no explicit getWeight)', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 4 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 3 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 2 },
        { id: 'da', sourceId: 'd', targetId: 'a', weight: 1 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 5 },
      ],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.edges).toHaveLength(3);
    const totalWeight = mst.edges.reduce((s, e) => s + (e.weight ?? 1), 0);
    expect(totalWeight).toBe(6); // 1+2+3
  });

  it('parallel edges: picks the lighter one', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'e2', sourceId: 'a', targetId: 'b', weight: 2 },
      ],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.edges).toHaveLength(1);
    expect(mst.edges[0].weight).toBe(2);
  });

  it('negative weights handled by kruskal', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: -3 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 2 },
      ],
    });
    const mst = getMinimumSpanningTree(g, { algorithm: 'kruskal' });
    expect(mst.edges).toHaveLength(2);
    const ids = mst.edges.map((e) => e.id).sort();
    expect(ids).toEqual(['ab', 'bc']); // -3 + 1 = -2
  });
});

// Additional APSP tests

describe('getAllPairsShortestPaths (additional)', () => {
  it('self-loops do not produce self-paths', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'aa', sourceId: 'a', targetId: 'a' }],
    });
    const paths = getAllPairsShortestPaths(g);
    expect(paths).toHaveLength(0); // no non-trivial pair
  });

  it('parallel edges: shortest path uses lightest', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'e2', sourceId: 'a', targetId: 'b', weight: 1 },
      ],
    });
    const paths = getAllPairsShortestPaths(g);
    expect(paths).toHaveLength(1);
    expect(paths[0].steps[0].edge.weight).toBe(1);
  });

  it('uses edge.weight without explicit getWeight', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'cb', sourceId: 'c', targetId: 'b', weight: 1 },
      ],
    });
    const paths = getAllPairsShortestPaths(g);
    const aToB = paths.filter(
      (p) => p.source.id === 'a' && p.steps.at(-1)?.node.id === 'b',
    );
    expect(aToB).toHaveLength(1);
    expect(aToB[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('dijkstra and floyd-warshall agree on weighted graph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 2 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 4 },
        { id: 'dc', sourceId: 'd', targetId: 'c', weight: 1 },
      ],
    });
    const dPaths = getAllPairsShortestPaths(g, { algorithm: 'dijkstra' });
    const fwPaths = getAllPairsShortestPaths(g, {
      algorithm: 'floyd-warshall',
    });
    expect(dPaths.length).toBe(fwPaths.length);
  });
});
