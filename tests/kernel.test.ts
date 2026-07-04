import { describe, it, expect, vi } from 'vitest';
import { createGraph, createGraphNode, addNode, addEdge } from '../src';
import {
  getIndex,
  getCSR,
  invalidateIndex,
  memoizeByGraph,
} from '../src/kernel';

function makeGraph() {
  return createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
  });
}

describe('kernel re-exports', () => {
  it('exposes getIndex', () => {
    const g = makeGraph();
    const idx = getIndex(g);
    expect(idx.nodeById.get('a')).toBe(0);
    expect(idx.outEdges.get('a')).toEqual(['e1']);
  });

  it('exposes getCSR', () => {
    const g = makeGraph();
    const csr = getCSR(g);
    expect(csr.ids).toEqual(['a', 'b', 'c']);
    expect(csr.indexOf.get('a')).toBe(0);
  });

  it('exposes invalidateIndex', () => {
    expect(typeof invalidateIndex).toBe('function');
  });
});

describe('memoizeByGraph', () => {
  it('caches the second call with the same args', () => {
    const spy = vi.fn((graph, n: number) => graph.nodes.length + n);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g, 10)).toBe(13);
    expect(memo(g, 10)).toBe(13);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keys on args — different args recompute', () => {
    const spy = vi.fn((graph, n: number) => graph.nodes.length + n);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g, 1)).toBe(4);
    expect(memo(g, 2)).toBe(5);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(memo(g, 1)).toBe(4);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invalidates on addNode mutation', () => {
    const spy = vi.fn((graph) => graph.nodes.length);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g)).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);

    addNode(g, { id: 'd' });
    expect(memo(g)).toBe(4);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invalidates on addEdge mutation', () => {
    const spy = vi.fn((graph) => graph.edges.length);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g)).toBe(1);
    addEdge(g, { id: 'e2', sourceId: 'b', targetId: 'c' });
    expect(memo(g)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invalidates on array replacement (immutable-style update)', () => {
    const spy = vi.fn((graph) => graph.nodes.length);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g)).toBe(3);
    // Immutable-style: replace the nodes array wholesale.
    g.nodes = [...g.nodes, createGraphNode({ id: 'z' })];
    expect(memo(g)).toBe(4);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invalidates on invalidateIndex after in-place field mutation', () => {
    const spy = vi.fn((graph) => graph.edges[0].targetId);
    const memo = memoizeByGraph(spy);
    const g = makeGraph();

    expect(memo(g)).toBe('b');
    // In-place field mutation is not auto-detected.
    g.edges[0].targetId = 'c';
    invalidateIndex(g);
    expect(memo(g)).toBe('c');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('supports a custom key option', () => {
    const spy = vi.fn((graph, opts: { factor: number }) => opts.factor * 2);
    const memo = memoizeByGraph(spy, { key: (opts) => String(opts.factor) });
    const g = makeGraph();

    // Distinct object identities, same logical key → one computation.
    expect(memo(g, { factor: 3 })).toBe(6);
    expect(memo(g, { factor: 3 })).toBe(6);
    expect(spy).toHaveBeenCalledTimes(1);

    expect(memo(g, { factor: 5 })).toBe(10);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not share cache across different graphs', () => {
    const spy = vi.fn((graph) => graph.nodes.length);
    const memo = memoizeByGraph(spy);
    const g1 = makeGraph();
    const g2 = createGraph({ nodes: [{ id: 'x' }], edges: [] });

    expect(memo(g1)).toBe(3);
    expect(memo(g2)).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    // Each still cached independently.
    expect(memo(g1)).toBe(3);
    expect(memo(g2)).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
