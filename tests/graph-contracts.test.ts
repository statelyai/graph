import { describe, it, expect } from 'vitest';
import * as api from '../src/index';
import { addEdge, createGraph, deleteNode } from '../src/graph';
import {
  genCycles,
  genPreorders,
  genShortestPaths,
  genSimplePaths,
  genTopologicalSort,
  getCycle,
  getShortestPath,
  getSimplePath,
  getTopologicalSort,
  hasPath,
  isAcyclic,
  isArborescence,
  isTree,
} from '../src/algorithms';
import type { GraphPath } from '../src/types';

function makeChain(n: number, mode: 'directed' | 'undirected' = 'directed') {
  return createGraph({
    mode,
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges: Array.from({ length: n - 1 }, (_, i) => ({
      id: `e${i}`,
      sourceId: `n${i}`,
      targetId: `n${i + 1}`,
    })),
  });
}

describe('lazy generators observe the graph as of iteration start', () => {
  function makeGraph() {
    return createGraph({
      initialNodeId: 'a',
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
      edges: [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['a', 'c'],
        ['d', 'a'],
      ].map(([sourceId, targetId], i) => ({ id: `e${i}`, sourceId, targetId })),
    });
  }

  const toIds = (path: GraphPath) =>
    [path.source.id, ...path.steps.map((step) => step.node.id)].join('');

  it.each([
    ['genShortestPaths', (g: any) => genShortestPaths(g, { from: 'a' })],
    ['genSimplePaths', (g: any) => genSimplePaths(g, { from: 'a', to: 'd' })],
    ['genCycles', (g: any) => genCycles(g)],
  ])('%s is unaffected by deleteNode mid-iteration', (_, gen) => {
    const expected = [...gen(makeGraph())].map(toIds);
    const graph = makeGraph();
    const actual: string[] = [];
    for (const path of gen(graph)) {
      actual.push(toIds(path));
      if (actual.length === 1) deleteNode(graph, 'b');
    }
    expect(actual).toEqual(expected);
  });

  it('genPreorders is unaffected by deleteNode mid-iteration', () => {
    const expected = [...genPreorders(makeGraph())];
    const graph = makeGraph();
    const actual = [];
    for (const order of genPreorders(graph)) {
      actual.push(order);
      if (actual.length === 1) deleteNode(graph, 'b');
    }
    expect(actual).toEqual(expected);
  });
});

describe('hasPath', () => {
  const graph = createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'cb', sourceId: 'c', targetId: 'b' },
    ],
  });

  it('follows the requested direction', () => {
    expect(hasPath(graph, 'b', 'a')).toBe(false);
    expect(hasPath(graph, 'b', 'a', { direction: 'incoming' })).toBe(true);
    expect(hasPath(graph, 'a', 'c')).toBe(false);
    expect(hasPath(graph, 'a', 'c', { direction: 'undirected' })).toBe(true);
  });

  it('returns false for unknown nodes, even from a node to itself', () => {
    expect(hasPath(graph, 'a', 'a')).toBe(true);
    expect(hasPath(graph, 'zz', 'zz')).toBe(false);
    expect(hasPath(graph, 'a', 'zz')).toBe(false);
  });

  it('handles deep graphs', () => {
    expect(hasPath(makeChain(50_000), 'n0', 'n49999')).toBe(true);
  });
});

describe('unknown node ids never produce a path', () => {
  const graph = createGraph({ nodes: [{ id: 'a' }] });

  it('yields no trivial self-path for an unknown source', () => {
    expect([...genShortestPaths(graph, { from: 'zz', to: 'zz' })]).toEqual([]);
    expect(
      getShortestPath(graph, { from: 'zz', to: 'zz', algorithm: 'bellman-ford' }),
    ).toBeUndefined();
    expect(getSimplePath(graph, { from: 'zz', to: 'zz' })).toBeUndefined();
  });
});

describe('isAcyclic', () => {
  it('handles deep graphs without overflowing the call stack', () => {
    expect(isAcyclic(makeChain(50_000))).toBe(true);
    expect(isAcyclic(makeChain(50_000, 'undirected'))).toBe(true);
    expect(isTree(makeChain(50_000, 'undirected'))).toBe(true);
  });

  it('treats parallel undirected edges and self-loops as cycles', () => {
    const parallel = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
      ],
    });
    const loop = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'a' }],
    });
    expect(isAcyclic(parallel)).toBe(false);
    expect(isAcyclic(loop)).toBe(false);
  });

  it('recomputes after the graph changes', () => {
    const graph = makeChain(3);
    expect(isAcyclic(graph)).toBe(true);
    addEdge(graph, { id: 'back', sourceId: 'n2', targetId: 'n0' });
    expect(isAcyclic(graph)).toBe(false);
  });
});

describe('topological sort', () => {
  const graph = createGraph({
    nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
    edges: [
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'bd', sourceId: 'b', targetId: 'd' },
    ],
  });
  const ids = (nodes: Iterable<{ id: string }> | null) =>
    nodes && [...nodes].map((node) => node.id);

  it('emits `from` nodes first among nodes without predecessors', () => {
    expect(ids(getTopologicalSort(graph))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(getTopologicalSort(graph, { from: 'b' }))).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
    // `c` has a predecessor, `zz` is unknown: both are ignored
    expect(ids(getTopologicalSort(graph, { from: ['c', 'zz', 'b'] }))).toEqual([
      'b',
      'a',
      'd',
      'c',
    ]);
  });

  it('genTopologicalSort yields the acyclic prefix before stopping at a cycle', () => {
    const cyclic = createGraph({
      nodes: ['a', 'b', 'c'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'cb', sourceId: 'c', targetId: 'b' },
      ],
    });
    expect(ids(genTopologicalSort(cyclic))).toEqual(['a']);
    expect(getTopologicalSort(cyclic)).toBeNull();
  });

  it('treats a non-directed edge as a 2-cycle', () => {
    const mixed = createGraph({
      nodes: ['a', 'b', 'c'].map((id) => ({ id })),
      edges: [{ id: 'bc', sourceId: 'b', targetId: 'c', mode: 'undirected' }],
    });
    expect(ids(genTopologicalSort(mixed))).toEqual(['a']);
    expect(getTopologicalSort(mixed)).toBeNull();
  });
});

describe('cycles', () => {
  function makeComplete(n: number, mode: 'directed' | 'undirected') {
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    return createGraph({
      mode,
      nodes: ids.map((id) => ({ id })),
      edges: ids.flatMap((a, i) =>
        ids
          .filter((b, j) => (mode === 'directed' ? i !== j : i < j))
          .map((b) => ({ id: `${a}-${b}`, sourceId: a, targetId: b })),
      ),
    });
  }

  it.each(['directed', 'undirected'] as const)(
    'genCycles is lazy on a %s complete graph with astronomically many cycles',
    (mode) => {
      const cycles = genCycles(makeComplete(30, mode));
      for (let i = 0; i < 1000; i++) expect(cycles.next().done).toBe(false);
    },
  );

  it('genCycles enumerates a long cycle without overflowing the call stack', () => {
    const ring = makeChain(50_000);
    addEdge(ring, { id: 'back', sourceId: 'n49999', targetId: 'n0' });
    const cycles = [...genCycles(ring)];
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(50_000);
  });

  it('getCycle returns one cycle, or undefined when acyclic', () => {
    expect(getCycle(makeChain(5))).toBeUndefined();

    const graph = createGraph({
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c', mode: 'undirected' },
        { id: 'dc', sourceId: 'd', targetId: 'c' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
      ],
    });
    const cycle = getCycle(graph)!;
    expect([cycle.source.id, ...cycle.steps.map((step) => step.node.id)]).toEqual(
      ['a', 'b', 'c', 'a'],
    );
  });
});

describe('trees', () => {
  const make = (edges: Array<[string, string]>, nodes = ['a', 'b', 'c']) =>
    createGraph({
      nodes: nodes.map((id) => ({ id })),
      edges: edges.map(([sourceId, targetId]) => ({
        id: `${sourceId}${targetId}`,
        sourceId,
        targetId,
      })),
    });

  it('isTree ignores direction; isArborescence requires a rooted out-tree', () => {
    const outTree = make([
      ['a', 'b'],
      ['a', 'c'],
    ]);
    const polytree = make([
      ['a', 'c'],
      ['b', 'c'],
    ]);
    expect(isTree(outTree)).toBe(true);
    expect(isArborescence(outTree)).toBe(true);
    expect(isTree(polytree)).toBe(true);
    expect(isArborescence(polytree)).toBe(false);
  });

  it('isArborescence checks the root, reachability, and edge modes', () => {
    const chain = make([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(isArborescence(chain, { from: 'a' })).toBe(true);
    expect(isArborescence(chain, { from: 'b' })).toBe(false);
    // n − 1 edges and in-degrees fine, but `c` is unreachable from `a`
    expect(isArborescence(make([['a', 'b'], ['c', 'c']]))).toBe(false);
    expect(
      isArborescence(createGraph({ ...chain, mode: 'undirected' })),
    ).toBe(false);
    expect(isArborescence(make([], ['a']))).toBe(true);
    expect(isArborescence(make([], []))).toBe(false);
  });

  it('isTree rejects self-loops, parallel edges, and the empty graph', () => {
    expect(isTree(make([['a', 'a'], ['b', 'c']]))).toBe(false);
    expect(isTree(make([['a', 'b'], ['b', 'a']], ['a', 'b']))).toBe(false);
    expect(isTree(make([], []))).toBe(false);
    expect(isTree(make([], ['a']))).toBe(true);
  });
});

describe('review regressions', () => {
  it('lazy generators accept a GraphInstance', () => {
    const instance = api.GraphInstance.from(
      createGraph({
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [
          { id: 'ab', sourceId: 'a', targetId: 'b' },
          { id: 'ba', sourceId: 'b', targetId: 'a' },
        ],
      }),
    );
    expect([...genCycles(instance as any)]).toHaveLength(1);
  });

  it('random walks never step onto a missing source of a non-directed edge', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'za', sourceId: 'zz', targetId: 'a', mode: 'undirected' }],
    });
    expect([...api.genRandomWalk(graph, { from: 'a', seed: 1 })]).toEqual([]);
  });

  it('isIsomorphic ignores dangling edges even when their counts differ', () => {
    const a = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }] });
    const b = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ghost', sourceId: 'ghost', targetId: 'a' },
      ],
    });
    expect(api.isIsomorphic(a, b)).toBe(true);
  });

  it('getCycle stays linear when the cycle crosses many undirected components', () => {
    // A ring of k two-node undirected components linked by directed edges
    const k = 20_000;
    const nodes = Array.from({ length: 2 * k }, (_, i) => ({ id: `n${i}` }));
    const edges = [];
    for (let i = 0; i < k; i++) {
      edges.push({ id: `u${i}`, sourceId: `n${2 * i}`, targetId: `n${2 * i + 1}`, mode: 'undirected' as const });
      edges.push({ id: `d${i}`, sourceId: `n${2 * i + 1}`, targetId: `n${(2 * i + 2) % (2 * k)}` });
    }
    const cycle = getCycle(createGraph({ nodes, edges }))!;
    expect(cycle.steps).toHaveLength(2 * k);
  });
});
