import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { getTransitiveReduction } from '../src/algorithms';

describe('getTransitiveReduction', () => {
  it('removes the shortcut edge in a triangle DAG', () => {
    // a→b→c plus a→c. Known answer: a→c is redundant (a→b→c covers it).
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });

    const reduced = getTransitiveReduction(graph);
    expect(reduced.edges.map((edge) => edge.id).sort()).toEqual(['ab', 'bc']);
    expect(reduced.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a chain unchanged', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    const reduced = getTransitiveReduction(graph);
    expect(reduced.edges.map((edge) => edge.id)).toEqual(['ab', 'bc']);
  });

  it('removes the diagonal of a diamond plus shortcut', () => {
    // a→b, a→c, b→d, c→d, a→d. Only a→d is redundant.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bd', sourceId: 'b', targetId: 'd' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
        { id: 'ad', sourceId: 'a', targetId: 'd' },
      ],
    });

    const reduced = getTransitiveReduction(graph);
    expect(reduced.edges.map((edge) => edge.id).sort()).toEqual([
      'ab',
      'ac',
      'bd',
      'cd',
    ]);
  });

  it('collapses exact-duplicate parallel edges to the first one', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b' },
      ],
    });

    const reduced = getTransitiveReduction(graph);
    expect(reduced.edges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it('drops all parallel edges when a longer path exists', () => {
    // a→b twice plus a→x→b: both direct edges are redundant.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'x' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b' },
        { id: 'ax', sourceId: 'a', targetId: 'x' },
        { id: 'xb', sourceId: 'x', targetId: 'b' },
      ],
    });

    const reduced = getTransitiveReduction(graph);
    expect(reduced.edges.map((edge) => edge.id).sort()).toEqual(['ax', 'xb']);
  });

  it('throws on a cyclic graph', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
      ],
    });

    expect(() => getTransitiveReduction(graph)).toThrow(
      /contains a cycle.*directed acyclic graphs/,
    );
  });

  it('throws on a non-directed edge, naming the edge', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', mode: 'undirected' },
      ],
    });

    expect(() => getTransitiveReduction(graph)).toThrow(
      /edge "ab" has effective mode "undirected"/,
    );
  });

  it('throws when graph.mode makes every edge non-directed', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });

    expect(() => getTransitiveReduction(graph)).toThrow(/effective mode/);
  });

  it('preserves all fields on nodes and surviving edges', () => {
    const graph = createGraph<{ kind: string }, { note: string }>({
      id: 'g1',
      initialNodeId: 'a',
      nodes: [
        {
          id: 'a',
          label: 'Node A',
          data: { kind: 'root' },
          x: 1,
          y: 2,
          width: 30,
          height: 40,
          shape: 'circle',
          color: 'red',
        },
        { id: 'b', data: { kind: 'mid' } },
        { id: 'c', data: { kind: 'leaf' } },
      ],
      edges: [
        {
          id: 'ab',
          sourceId: 'a',
          targetId: 'b',
          label: 'A to B',
          weight: 7,
          data: { note: 'keep me' },
          color: 'blue',
          style: { dashed: true },
        },
        { id: 'bc', sourceId: 'b', targetId: 'c', data: { note: 'chain' } },
        { id: 'ac', sourceId: 'a', targetId: 'c', data: { note: 'gone' } },
      ],
    });

    const reduced = getTransitiveReduction(graph);

    expect(reduced.id).toBe('g1');
    expect(reduced.initialNodeId).toBe('a');
    expect(reduced.nodes[0]).toEqual(graph.nodes[0]);
    expect(reduced.nodes[1]).toEqual(graph.nodes[1]);

    const survivor = reduced.edges.find((edge) => edge.id === 'ab')!;
    expect(survivor.label).toBe('A to B');
    expect(survivor.weight).toBe(7);
    expect(survivor.data).toEqual({ note: 'keep me' });
    expect(survivor.color).toBe('blue');
    expect(survivor.style).toEqual({ dashed: true });
  });

  it('does not mutate the input graph', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
      ],
    });
    const before = JSON.parse(JSON.stringify(graph));

    getTransitiveReduction(graph);
    expect(graph).toEqual(before);
  });

  it('handles an empty graph', () => {
    const reduced = getTransitiveReduction(createGraph());
    expect(reduced.nodes).toEqual([]);
    expect(reduced.edges).toEqual([]);
  });
});
