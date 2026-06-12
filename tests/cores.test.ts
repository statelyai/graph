import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { getCoreNumbers, getKCore } from '../src/algorithms';

// Hand-verified fixture: K4 {a,b,c,d} (every node has 3 neighbors inside it
// → core 3), e hangs off a and b (degree 2, but never part of a subgraph of
// min degree 3 → core 2), f hangs off e (degree 1 → core 1), g isolated
// (core 0).
function makeLayeredCoreGraph(mode: 'directed' | 'undirected') {
  return createGraph({
    mode,
    nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id })),
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'ad', sourceId: 'a', targetId: 'd' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'bd', sourceId: 'b', targetId: 'd' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
      { id: 'ea', sourceId: 'e', targetId: 'a' },
      { id: 'eb', sourceId: 'e', targetId: 'b' },
      { id: 'fe', sourceId: 'f', targetId: 'e' },
    ],
  });
}

describe('getCoreNumbers', () => {
  it('computes the known core numbers of the layered fixture', () => {
    expect(getCoreNumbers(makeLayeredCoreGraph('undirected'))).toEqual({
      a: 3,
      b: 3,
      c: 3,
      d: 3,
      e: 2,
      f: 1,
      g: 0,
    });
  });

  it('treats directed edges as undirected (standard k-core definition)', () => {
    expect(getCoreNumbers(makeLayeredCoreGraph('directed'))).toEqual(
      getCoreNumbers(makeLayeredCoreGraph('undirected')),
    );
  });

  it('ignores self-loops', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'loop', sourceId: 'a', targetId: 'a' },
        { id: 'ab', sourceId: 'a', targetId: 'b' },
      ],
    });

    expect(getCoreNumbers(graph)).toEqual({ a: 1, b: 1 });
  });

  it('counts parallel edges toward degree', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'p1', sourceId: 'a', targetId: 'b' },
        { id: 'p2', sourceId: 'a', targetId: 'b' },
      ],
    });

    expect(getCoreNumbers(graph)).toEqual({ a: 2, b: 2 });
  });

  it('returns an empty record for an empty graph', () => {
    expect(getCoreNumbers(createGraph())).toEqual({});
  });
});

describe('getKCore', () => {
  it('returns the nodes of each k-core of the layered fixture', () => {
    const graph = makeLayeredCoreGraph('undirected');

    expect(getKCore(graph, 3)).toEqual(['a', 'b', 'c', 'd']);
    expect(getKCore(graph, 2)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(getKCore(graph, 1)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(getKCore(graph, 0)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('returns an empty array when no node reaches k', () => {
    expect(getKCore(makeLayeredCoreGraph('undirected'), 4)).toEqual([]);
  });
});
