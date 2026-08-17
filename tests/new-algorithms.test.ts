import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { getSources, getSinks } from '../src/queries';
import {
  getStronglyConnectedComponents,
  getCycles,
  getPreorder,
  getPostorder,
  genPreorders,
  genPostorders,
  genCycles,
  getMinimumSpanningTree,
  getAllPairsShortestPaths,
} from '../src/algorithms';

// Helpers

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

function makeLinearChain() {
  return createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
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

// getSources / getSinks

describe('getSources', () => {
  it('returns nodes with no incoming edges', () => {
    const sources = getSources(makeDAG()).map((n) => n.id);
    expect(sources).toEqual(['a']);
  });

  it('returns multiple sources', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'c' }],
    });
    expect(
      getSources(g)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('all nodes are sources in edgeless graph', () => {
    const g = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    expect(getSources(g)).toHaveLength(2);
  });

  it('no sources in cyclic graph', () => {
    expect(getSources(makeCyclicGraph())).toHaveLength(0);
  });

  it('empty graph', () => {
    expect(getSources(createGraph())).toHaveLength(0);
  });

  it('self-loop: node is not a source', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a' }],
    });
    expect(getSources(g).map((n) => n.id)).toEqual(['b']);
  });

  it('disconnected: sources from both components', () => {
    const g = makeDisconnectedGraph(); // a→b, c→d
    expect(
      getSources(g)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'c']);
  });
});

describe('getSinks', () => {
  it('returns nodes with no outgoing edges', () => {
    expect(getSinks(makeDAG()).map((n) => n.id)).toEqual(['d']);
  });

  it('returns multiple sinks', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(
      getSinks(g)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'c']);
  });

  it('no sinks in cyclic graph', () => {
    expect(getSinks(makeCyclicGraph())).toHaveLength(0);
  });

  it('empty graph', () => {
    expect(getSinks(createGraph())).toHaveLength(0);
  });

  it('self-loop: node is not a sink', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a' }],
    });
    expect(getSinks(g).map((n) => n.id)).toEqual(['b']);
  });

  it('disconnected: sinks from both components', () => {
    const g = makeDisconnectedGraph();
    expect(
      getSinks(g)
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'd']);
  });

  it('single isolated node is both source and sink', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    expect(getSources(g).map((n) => n.id)).toEqual(['x']);
    expect(getSinks(g).map((n) => n.id)).toEqual(['x']);
  });
});

// getStronglyConnectedComponents

describe('getStronglyConnectedComponents', () => {
  it('DAG: each node is its own SCC', () => {
    const sccs = getStronglyConnectedComponents(makeDAG());
    expect(sccs).toHaveLength(4);
    for (const scc of sccs) expect(scc).toHaveLength(1);
  });

  it('single cycle: one SCC with all nodes', () => {
    const sccs = getStronglyConnectedComponents(makeCyclicGraph());
    expect(sccs).toHaveLength(1);
    expect(sccs[0].map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('two separate cycles + tail node', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'd', targetId: 'c' },
        { id: 'e5', sourceId: 'a', targetId: 'e' },
      ],
    });
    const sccs = getStronglyConnectedComponents(g);
    const sizes = sccs.map((s) => s.length).sort();
    expect(sizes).toEqual([1, 2, 2]);
  });

  it('empty graph', () => {
    expect(getStronglyConnectedComponents(createGraph())).toHaveLength(0);
  });

  it('single node, no edges', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    const sccs = getStronglyConnectedComponents(g);
    expect(sccs).toHaveLength(1);
    expect(sccs[0][0].id).toBe('x');
  });

  it('single node with self-loop', () => {
    const g = createGraph({
      nodes: [{ id: 'x' }],
      edges: [{ id: 'e1', sourceId: 'x', targetId: 'x' }],
    });
    const sccs = getStronglyConnectedComponents(g);
    expect(sccs).toHaveLength(1);
    expect(sccs[0][0].id).toBe('x');
  });

  it('linear chain: each node is its own SCC', () => {
    const sccs = getStronglyConnectedComponents(makeLinearChain());
    expect(sccs).toHaveLength(3);
    for (const scc of sccs) expect(scc).toHaveLength(1);
  });

  it('cycle with tail: SCC + singleton', () => {
    // a→b→c→a, a→d (d is a tail, not in cycle)
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
        { id: 'e4', sourceId: 'a', targetId: 'd' },
      ],
    });
    const sccs = getStronglyConnectedComponents(g);
    expect(sccs).toHaveLength(2);
    const big = sccs.find((s) => s.length === 3)!;
    const small = sccs.find((s) => s.length === 1)!;
    expect(big.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(small[0].id).toBe('d');
  });

  it('disconnected graph: components are independent SCCs', () => {
    const sccs = getStronglyConnectedComponents(makeDisconnectedGraph());
    expect(sccs).toHaveLength(4); // all singletons
  });

  it('mutual pair: a↔b is one SCC', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
      ],
    });
    const sccs = getStronglyConnectedComponents(g);
    expect(sccs).toHaveLength(1);
    expect(sccs[0].map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});

// getCycles

describe('getCycles', () => {
  it('DAG has no cycles', () => {
    expect(getCycles(makeDAG())).toHaveLength(0);
  });

  it('simple directed cycle: a→b→c→a', () => {
    const cycles = getCycles(makeCyclicGraph());
    expect(cycles).toHaveLength(1);
    expect(cycles[0].source.id).toBe('a');
    expect(cycles[0].steps.at(-1)!.node.id).toBe('a');
    expect(cycles[0].steps).toHaveLength(3);
  });

  it('two overlapping directed cycles sharing an edge', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
        { id: 'e4', sourceId: 'b', targetId: 'd' },
        { id: 'e5', sourceId: 'd', targetId: 'a' },
      ],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(2);
    const lengths = cycles.map((c) => c.steps.length).sort();
    expect(lengths).toEqual([3, 3]);
  });

  it('self-loop is a cycle', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a' }],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].source.id).toBe('a');
    expect(cycles[0].steps).toHaveLength(1);
    expect(cycles[0].steps[0].node.id).toBe('a');
  });

  it('mutual pair: a↔b is one 2-cycle', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
      ],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(2);
  });

  it('two independent directed cycles', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'd', targetId: 'c' },
      ],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(2);
  });

  it('cycle edges are correct', () => {
    const g = makeCyclicGraph(); // a→b→c→a
    const [cycle] = getCycles(g);
    const edgeIds = cycle.steps.map((s) => s.edge.id);
    expect(edgeIds).toEqual(['e1', 'e2', 'e3']);
  });

  it('undirected triangle: exactly one cycle, deduplicated', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(3);
  });

  it('undirected square: one 4-cycle', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'd', targetId: 'a' },
      ],
    });
    const cycles = getCycles(g);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].steps).toHaveLength(4);
  });

  it('undirected tree has no cycles', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
      ],
    });
    expect(getCycles(g)).toHaveLength(0);
  });

  it('empty graph has no cycles', () => {
    expect(getCycles(createGraph())).toHaveLength(0);
  });

  it('single node, no edges: no cycles', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    expect(getCycles(g)).toHaveLength(0);
  });
});

describe('genCycles', () => {
  it('lazily yields cycles one at a time', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'c', targetId: 'a' },
      ],
    });
    const gen = genCycles(g);
    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value.source.id).toBe('a');
  });

  it('yields same cycles as getCycles', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
        { id: 'e3', sourceId: 'c', targetId: 'd' },
        { id: 'e4', sourceId: 'd', targetId: 'c' },
      ],
    });
    const fromGen = [...genCycles(g)];
    const fromGet = getCycles(g);
    expect(fromGen).toHaveLength(fromGet.length);
  });

  it('empty for acyclic graph', () => {
    const gen = genCycles(makeDAG());
    expect(gen.next().done).toBe(true);
  });
});

// getPreorder / getPostorder (single canonical ordering)

describe('getPreorder', () => {
  it('linear chain: canonical preorder', () => {
    const order = getPreorder(makeLinearChain(), { from: 'a' });
    expect(order.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('diamond: starts with a, visits all 4', () => {
    const order = getPreorder(makeDAG(), { from: 'a' });
    expect(order[0].id).toBe('a');
    expect(order).toHaveLength(4);
  });

  it('single node', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    const order = getPreorder(g, { from: 'x' });
    expect(order.map((n) => n.id)).toEqual(['x']);
  });

  it('defaults from to initialNodeId', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const order = getPreorder(g);
    expect(order[0].id).toBe('a');
  });

  it('cyclic graph: visits each node exactly once', () => {
    const order = getPreorder(makeCyclicGraph(), { from: 'a' });
    expect(order).toHaveLength(3);
    expect(new Set(order.map((n) => n.id)).size).toBe(3);
  });

  it('only visits reachable nodes', () => {
    const order = getPreorder(makeDisconnectedGraph(), { from: 'a' });
    expect(order.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('parent appears before DFS children', () => {
    const order = getPreorder(makeDAG(), { from: 'a' });
    const ids = order.map((n) => n.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'));
  });
});

describe('getPostorder', () => {
  it('linear chain: canonical postorder', () => {
    const order = getPostorder(makeLinearChain(), { from: 'a' });
    expect(order.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('diamond: root is last', () => {
    const order = getPostorder(makeDAG(), { from: 'a' });
    expect(order.at(-1)!.id).toBe('a');
    expect(order).toHaveLength(4);
  });

  it('single node', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    const order = getPostorder(g, { from: 'x' });
    expect(order.map((n) => n.id)).toEqual(['x']);
  });

  it('children finished before parent', () => {
    const order = getPostorder(makeDAG(), { from: 'a' });
    const ids = order.map((n) => n.id);
    expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('a'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'));
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('a'));
  });

  it('defaults from to sole root', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const order = getPostorder(g);
    expect(order.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('supports traversal search options with an inferred source', () => {
    const g = createGraph({
      initialNodeId: 'c',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'dc', sourceId: 'd', targetId: 'c' },
      ],
    });

    expect(
      getPostorder(g, {
        direction: 'incoming',
        radius: 1,
      }).map((node) => node.id),
    ).toEqual(['b', 'd', 'c']);
  });
});

// getPreorders / getPostorders (generator — all possible orderings)

describe('genPreorders', () => {
  it('linear chain: one preorder', () => {
    const orders = [...genPreorders(makeLinearChain(), { from: 'a' })];
    expect(orders).toHaveLength(1);
    expect(orders[0].map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('diamond: two preorders', () => {
    const orders = [...genPreorders(makeDAG(), { from: 'a' })];
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order[0].id).toBe('a');
      expect(order).toHaveLength(4);
    }
    const seconds = orders.map((o) => o[1].id).sort();
    expect(seconds).toEqual(['b', 'c']);
  });

  it('three-way branch: 6 preorders (3!)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' },
      ],
    });
    const orders = [...genPreorders(g, { from: 'a' })];
    expect(orders).toHaveLength(6);
    for (const order of orders) {
      expect(order[0].id).toBe('a');
      expect(order).toHaveLength(4);
    }
    const tails = orders.map((o) =>
      o
        .slice(1)
        .map((n) => n.id)
        .join(','),
    );
    expect(new Set(tails).size).toBe(6);
  });

  it('lazy: can take first N without computing all', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' },
      ],
    });
    const gen = genPreorders(g, { from: 'a' });
    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toHaveLength(4);
    expect(first.value[0].id).toBe('a');
    // Don't exhaust — just proving laziness works
  });

  it('cyclic graph: visits each node exactly once', () => {
    const orders = [...genPreorders(makeCyclicGraph(), { from: 'a' })];
    expect(orders.length).toBeGreaterThanOrEqual(1);
    for (const order of orders) {
      expect(order).toHaveLength(3);
      expect(new Set(order.map((n) => n.id)).size).toBe(3);
    }
  });
});

describe('genPostorders', () => {
  it('linear chain: one postorder', () => {
    const orders = [...genPostorders(makeLinearChain(), { from: 'a' })];
    expect(orders).toHaveLength(1);
    expect(orders[0].map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('diamond: two postorders', () => {
    const orders = [...genPostorders(makeDAG(), { from: 'a' })];
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order.at(-1)!.id).toBe('a');
      expect(order).toHaveLength(4);
    }
  });

  it('three-way branch: 6 postorders', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' },
      ],
    });
    const orders = [...genPostorders(g, { from: 'a' })];
    expect(orders).toHaveLength(6);
    for (const order of orders) {
      expect(order.at(-1)!.id).toBe('a');
      expect(order).toHaveLength(4);
    }
  });

  it('postorder: children finished before parent', () => {
    const orders = [...genPostorders(makeDAG(), { from: 'a' })];
    for (const order of orders) {
      const ids = order.map((n) => n.id);
      expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('a'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'));
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('a'));
    }
  });

  it('preorder and postorder counts match', () => {
    const g = makeDAG();
    expect([...genPreorders(g, { from: 'a' })].length).toBe(
      [...genPostorders(g, { from: 'a' })].length,
    );
  });
});

// getMinimumSpanningTree

describe('getMinimumSpanningTree', () => {
  const makeWeightedTriangle = () =>
    createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', data: 2 },
        { id: 'e3', sourceId: 'a', targetId: 'c', data: 3 },
      ],
    });

  it('prim: picks lightest edges', () => {
    const mst = getMinimumSpanningTree(makeWeightedTriangle(), {
      algorithm: 'prim',
      getWeight: (e) => e.data,
    });
    expect(mst.nodes).toHaveLength(3);
    expect(mst.edges).toHaveLength(2);
    const totalWeight = mst.edges.reduce((sum, e) => sum + e.data, 0);
    expect(totalWeight).toBe(3); // 1+2
  });

  it('kruskal: picks lightest edges', () => {
    const mst = getMinimumSpanningTree(makeWeightedTriangle(), {
      algorithm: 'kruskal',
      getWeight: (e) => e.data,
    });
    expect(mst.nodes).toHaveLength(3);
    expect(mst.edges).toHaveLength(2);
    expect(mst.edges.reduce((sum, e) => sum + e.data, 0)).toBe(3);
  });

  it('prim and kruskal agree on total weight', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 4 },
        { id: 'e2', sourceId: 'b', targetId: 'c', data: 3 },
        { id: 'e3', sourceId: 'c', targetId: 'd', data: 2 },
        { id: 'e4', sourceId: 'd', targetId: 'a', data: 1 },
        { id: 'e5', sourceId: 'a', targetId: 'c', data: 5 },
      ],
    });
    const w = (e: { data: number }) => e.data;
    const primMST = getMinimumSpanningTree(g, {
      algorithm: 'prim',
      getWeight: w,
    });
    const kruskalMST = getMinimumSpanningTree(g, {
      algorithm: 'kruskal',
      getWeight: w,
    });
    const primW = primMST.edges.reduce((s, e) => s + e.data, 0);
    const kruskalW = kruskalMST.edges.reduce((s, e) => s + e.data, 0);
    expect(primW).toBe(kruskalW);
    expect(primMST.edges).toHaveLength(3); // n-1 edges
    expect(kruskalMST.edges).toHaveLength(3);
  });

  it('default algorithm is prim', () => {
    const mst = getMinimumSpanningTree(makeWeightedTriangle(), {
      getWeight: (e) => e.data,
    });
    expect(mst.edges).toHaveLength(2);
  });

  it('default weight is 1: picks any spanning tree', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'c' },
      ],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.edges).toHaveLength(2);
  });

  it('empty graph', () => {
    const mst = getMinimumSpanningTree(createGraph());
    expect(mst.nodes).toHaveLength(0);
    expect(mst.edges).toHaveLength(0);
  });

  it('single node', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'x' }],
    });
    const mst = getMinimumSpanningTree(g);
    expect(mst.nodes).toHaveLength(1);
    expect(mst.edges).toHaveLength(0);
  });

  it('already a tree: MST = original', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 5 },
        { id: 'e2', sourceId: 'b', targetId: 'c', data: 3 },
      ],
    });
    const mst = getMinimumSpanningTree(g, { getWeight: (e) => e.data });
    expect(mst.edges).toHaveLength(2);
    expect(mst.edges.reduce((s, e) => s + e.data, 0)).toBe(8);
  });

  it('MST result is a valid Graph object', () => {
    const mst = getMinimumSpanningTree(makeWeightedTriangle(), {
      getWeight: (e) => e.data,
    });
    expect(mst.mode).toBe('undirected');
    expect(mst.id).toBe('');
    for (const n of mst.nodes) {
      expect(n.type).toBe('node');
    }
    for (const e of mst.edges) {
      expect(e.type).toBe('edge');
    }
  });

  it('kruskal: skips edges that would create a cycle', () => {
    // Force kruskal to encounter a cycle-forming edge
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', data: 1 },
        { id: 'e3', sourceId: 'a', targetId: 'c', data: 1 },
      ],
    });
    const mst = getMinimumSpanningTree(g, {
      algorithm: 'kruskal',
      getWeight: (e) => e.data,
    });
    expect(mst.edges).toHaveLength(2); // not 3
  });
});

// getAllPairsShortestPaths

describe('getAllPairsShortestPaths', () => {
  it('dijkstra: linear chain, 3 pairs', () => {
    const paths = getAllPairsShortestPaths(makeLinearChain());
    // a→b, a→c, b→c
    expect(paths).toHaveLength(3);
  });

  it('floyd-warshall: linear chain, same count', () => {
    const paths = getAllPairsShortestPaths(makeLinearChain(), {
      algorithm: 'floyd-warshall',
    });
    expect(paths).toHaveLength(3);
  });

  it('dijkstra: weighted, picks lighter path', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 10 },
        { id: 'e2', sourceId: 'a', targetId: 'c', data: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', data: 1 },
      ],
    });
    const paths = getAllPairsShortestPaths(g, { getWeight: (e) => e.data });
    const aToB = paths.filter(
      (p) => p.source.id === 'a' && p.steps.at(-1)?.node.id === 'b',
    );
    expect(aToB).toHaveLength(1);
    expect(aToB[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('floyd-warshall: weighted, same result as dijkstra', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: 10 },
        { id: 'e2', sourceId: 'a', targetId: 'c', data: 1 },
        { id: 'e3', sourceId: 'c', targetId: 'b', data: 1 },
      ],
    });
    const paths = getAllPairsShortestPaths(g, {
      algorithm: 'floyd-warshall',
      getWeight: (e) => e.data,
    });
    const aToB = paths.filter(
      (p) => p.source.id === 'a' && p.steps.at(-1)?.node.id === 'b',
    );
    expect(aToB).toHaveLength(1);
    expect(aToB[0].steps.map((s) => s.node.id)).toEqual(['c', 'b']);
  });

  it('empty graph returns no paths', () => {
    expect(getAllPairsShortestPaths(createGraph())).toHaveLength(0);
  });

  it('single node: no paths', () => {
    const g = createGraph({ nodes: [{ id: 'x' }] });
    expect(getAllPairsShortestPaths(g)).toHaveLength(0);
  });

  it('disconnected: unreachable pairs excluded', () => {
    const g = makeDisconnectedGraph(); // a→b, c→d
    const paths = getAllPairsShortestPaths(g);
    // Only a→b and c→d (no cross-component paths)
    expect(paths).toHaveLength(2);
  });

  it('cyclic graph: paths still found', () => {
    const g = makeCyclicGraph(); // a→b→c→a
    const paths = getAllPairsShortestPaths(g);
    // Every node can reach every other: 3*2 = 6 pairs
    expect(paths).toHaveLength(6);
  });

  it('diamond: equal-length paths both returned', () => {
    const g = makeDAG(); // a→b→d, a→c→d
    const paths = getAllPairsShortestPaths(g);
    const aToDPaths = paths.filter(
      (p) => p.source.id === 'a' && p.steps.at(-1)?.node.id === 'd',
    );
    expect(aToDPaths).toHaveLength(2);
    const routes = aToDPaths.map((p) =>
      p.steps.map((s) => s.node.id).join('→'),
    );
    expect(routes).toContain('b→d');
    expect(routes).toContain('c→d');
  });

  it('undirected: paths in both directions', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const paths = getAllPairsShortestPaths(g);
    // a→b and b→a
    expect(paths).toHaveLength(2);
  });

  it('every path has correct source field', () => {
    const paths = getAllPairsShortestPaths(makeDAG());
    for (const path of paths) {
      expect(path.source).toBeDefined();
      expect(path.source.type).toBe('node');
      // source should not appear as the last step's node (non-trivial path)
      if (path.steps.length > 0) {
        expect(path.steps.at(-1)!.node.id).not.toBe(path.source.id);
      }
    }
  });

  it('dijkstra and floyd-warshall return same path count', () => {
    const g = makeDAG();
    const d = getAllPairsShortestPaths(g, { algorithm: 'dijkstra' });
    const fw = getAllPairsShortestPaths(g, { algorithm: 'floyd-warshall' });
    expect(d.length).toBe(fw.length);
  });
});
