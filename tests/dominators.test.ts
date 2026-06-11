import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { getDominatorTree } from '../src/algorithms';

describe('getDominatorTree', () => {
  it('computes the diamond: idom(d) = a', () => {
    // a→b, a→c, b→d, c→d. Two paths to d merge at a, so idom(d) = a.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bd', sourceId: 'b', targetId: 'd' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
      ],
    });

    expect(getDominatorTree(graph, { from: 'a' })).toEqual({
      a: null,
      b: 'a',
      c: 'a',
      d: 'a',
    });
  });

  it('computes a chain: each node dominated by its predecessor', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(getDominatorTree(graph, { from: 'a' })).toEqual({
      a: null,
      b: 'a',
      c: 'b',
    });
  });

  it('handles loop back-edges', () => {
    // a→b→c→d with back-edge d→b. The cycle does not change dominance:
    // every path to b still passes through a, to c through b, to d through c.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
        { id: 'db', sourceId: 'd', targetId: 'b' },
      ],
    });

    expect(getDominatorTree(graph, { from: 'a' })).toEqual({
      a: null,
      b: 'a',
      c: 'b',
      d: 'c',
    });
  });

  it('omits unreachable nodes', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'z' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });

    const tree = getDominatorTree(graph, { from: 'a' });
    expect(tree).toEqual({ a: null, b: 'a' });
    expect('z' in tree).toBe(false);
  });

  it('matches the Cooper-Harvey-Kennedy paper example (Figure 2)', () => {
    // "A Simple, Fast Dominance Algorithm" (Cooper, Harvey & Kennedy),
    // Figure 2: root 6; 6→5, 6→4, 5→1, 4→2, 4→3, 1→2, 2→1, 2→3, 3→2.
    // Known answer: every node's immediate dominator is the root 6.
    const graph = createGraph({
      nodes: ['6', '5', '4', '3', '2', '1'].map((id) => ({ id })),
      edges: [
        { id: 'e65', sourceId: '6', targetId: '5' },
        { id: 'e64', sourceId: '6', targetId: '4' },
        { id: 'e51', sourceId: '5', targetId: '1' },
        { id: 'e42', sourceId: '4', targetId: '2' },
        { id: 'e43', sourceId: '4', targetId: '3' },
        { id: 'e12', sourceId: '1', targetId: '2' },
        { id: 'e21', sourceId: '2', targetId: '1' },
        { id: 'e23', sourceId: '2', targetId: '3' },
        { id: 'e32', sourceId: '3', targetId: '2' },
      ],
    });

    expect(getDominatorTree(graph, { from: '6' })).toEqual({
      '6': null,
      '5': '6',
      '4': '6',
      '3': '6',
      '2': '6',
      '1': '6',
    });
  });

  it('computes non-root immediate dominators in a nested diamond', () => {
    // a→b, b→c, b→d, c→e, d→e, e→f.
    // Known answer: idom(e) = b (paths merge there), idom(f) = e.
    const graph = createGraph({
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'bd', sourceId: 'b', targetId: 'd' },
        { id: 'ce', sourceId: 'c', targetId: 'e' },
        { id: 'de', sourceId: 'd', targetId: 'e' },
        { id: 'ef', sourceId: 'e', targetId: 'f' },
      ],
    });

    expect(getDominatorTree(graph, { from: 'a' })).toEqual({
      a: null,
      b: 'a',
      c: 'b',
      d: 'b',
      e: 'b',
      f: 'e',
    });
  });

  it('resolves the root from graph.initialNodeId when from is omitted', () => {
    const graph = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });

    expect(getDominatorTree(graph)).toEqual({ a: null, b: 'a' });
  });

  it('is mode-aware: undirected edges are traversable both ways', () => {
    // a→b directed, b—c undirected: c is reachable and dominated by b.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'cb', sourceId: 'c', targetId: 'b', mode: 'undirected' },
      ],
    });

    expect(getDominatorTree(graph, { from: 'a' })).toEqual({
      a: null,
      b: 'a',
      c: 'b',
    });
  });

  it('throws when the root node does not exist', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }] });
    expect(() => getDominatorTree(graph, { from: 'nope' })).toThrow(
      /root node "nope" not found/,
    );
  });
});
