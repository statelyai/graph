import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { isIsomorphic } from '../src/algorithms';

describe('isIsomorphic', () => {
  it('returns true for graphs with the same structure and different ids', () => {
    const graphA = createGraph({
      type: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    const graphB = createGraph({
      type: 'undirected',
      nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      edges: [
        { id: 'xy', sourceId: 'x', targetId: 'y' },
        { id: 'yz', sourceId: 'y', targetId: 'z' },
      ],
    });

    expect(isIsomorphic(graphA, graphB)).toBe(true);
  });

  it('returns false for graphs with different structures', () => {
    const path = createGraph({
      type: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });
    const triangle = createGraph({
      type: 'undirected',
      nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      edges: [
        { id: 'xy', sourceId: 'x', targetId: 'y' },
        { id: 'yz', sourceId: 'y', targetId: 'z' },
        { id: 'zx', sourceId: 'z', targetId: 'x' },
      ],
    });

    expect(isIsomorphic(path, triangle)).toBe(false);
  });

  it('supports nodeMatch predicates', () => {
    const graphA = createGraph({
      type: 'undirected',
      nodes: [
        { id: 'a', data: { color: 'red' } },
        { id: 'b', data: { color: 'blue' } },
      ],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    const graphB = createGraph({
      type: 'undirected',
      nodes: [
        { id: 'x', data: { color: 'red' } },
        { id: 'y', data: { color: 'green' } },
      ],
      edges: [{ id: 'xy', sourceId: 'x', targetId: 'y' }],
    });

    expect(
      isIsomorphic(graphA, graphB, {
        nodeMatch: (a, b) => a.data.color === b.data.color,
      }),
    ).toBe(false);
  });

  it('supports edgeMatch predicates', () => {
    const graphA = createGraph({
      type: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 }],
    });
    const graphB = createGraph({
      type: 'undirected',
      nodes: [{ id: 'x' }, { id: 'y' }],
      edges: [{ id: 'xy', sourceId: 'x', targetId: 'y', weight: 2 }],
    });

    expect(
      isIsomorphic(graphA, graphB, {
        edgeMatch: (a, b) => a.weight === b.weight,
      }),
    ).toBe(false);
  });
});
