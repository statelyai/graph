import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  createCompleteGraph,
  createGridGraph,
} from '../src/generators';
import {
  getGraphColoring,
  isValidColoring,
} from '../src/algorithms/coloring';
import type { Graph } from '../src/types';

/** A bipartite graph: K_{3,3}. */
function makeK33(): Graph {
  return createGraph({
    mode: 'undirected',
    nodes: [
      { id: 'a0' },
      { id: 'a1' },
      { id: 'a2' },
      { id: 'b0' },
      { id: 'b1' },
      { id: 'b2' },
    ],
    edges: [0, 1, 2].flatMap((a) =>
      [0, 1, 2].map((b) => ({
        id: `e${a}${b}`,
        sourceId: `a${a}`,
        targetId: `b${b}`,
      })),
    ),
  });
}

/** An odd cycle C5 — needs 3 colors. */
function makeC5(): Graph {
  return createGraph({
    mode: 'undirected',
    nodes: [0, 1, 2, 3, 4].map((i) => ({ id: `n${i}` })),
    edges: [0, 1, 2, 3, 4].map((i) => ({
      id: `e${i}`,
      sourceId: `n${i}`,
      targetId: `n${(i + 1) % 5}`,
    })),
  });
}

describe('getGraphColoring', () => {
  it('colors an empty graph with zero colors', () => {
    const graph = createGraph({ mode: 'undirected', nodes: [], edges: [] });
    const { colors, colorCount } = getGraphColoring(graph);
    expect(colors).toEqual({});
    expect(colorCount).toBe(0);
  });

  it('colors an edgeless graph with a single color', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [],
    });
    const { colorCount } = getGraphColoring(graph);
    expect(colorCount).toBe(1);
  });

  it('2-colors a bipartite graph (K3,3)', () => {
    const graph = makeK33();
    for (const strategy of ['largest-first', 'dsatur'] as const) {
      const result = getGraphColoring(graph, { strategy });
      expect(result.colorCount).toBe(2);
      expect(isValidColoring(graph, result.colors)).toBe(true);
    }
  });

  it('uses n colors for the complete graph K4', () => {
    const graph = createCompleteGraph(4);
    for (const strategy of ['largest-first', 'dsatur'] as const) {
      const result = getGraphColoring(graph, { strategy });
      expect(result.colorCount).toBe(4);
      expect(isValidColoring(graph, result.colors)).toBe(true);
    }
  });

  it('uses 3 colors for an odd cycle C5', () => {
    const graph = makeC5();
    for (const strategy of ['largest-first', 'dsatur'] as const) {
      const result = getGraphColoring(graph, { strategy });
      expect(result.colorCount).toBe(3);
      expect(isValidColoring(graph, result.colors)).toBe(true);
    }
  });

  it('produces valid colorings on assorted graphs', () => {
    const graphs = [
      makeK33(),
      makeC5(),
      createCompleteGraph(6),
      createGridGraph(4, 5),
    ];
    for (const graph of graphs) {
      for (const strategy of ['largest-first', 'dsatur'] as const) {
        const { colors } = getGraphColoring(graph, { strategy });
        expect(isValidColoring(graph, colors)).toBe(true);
      }
    }
  });

  it('dsatur uses no more colors than largest-first', () => {
    const graphs = [
      makeK33(),
      makeC5(),
      createCompleteGraph(5),
      createGridGraph(4, 5),
    ];
    for (const graph of graphs) {
      const lf = getGraphColoring(graph, { strategy: 'largest-first' });
      const ds = getGraphColoring(graph, { strategy: 'dsatur' });
      expect(ds.colorCount).toBeLessThanOrEqual(lf.colorCount);
    }
  });

  it('is deterministic for a given graph and strategy', () => {
    const graph = createGridGraph(5, 5);
    expect(getGraphColoring(graph)).toEqual(getGraphColoring(graph));
    expect(getGraphColoring(graph, { strategy: 'dsatur' })).toEqual(
      getGraphColoring(graph, { strategy: 'dsatur' }),
    );
  });

  it('ignores self-loops when coloring and treats edge direction as undirected', () => {
    const graph = createGraph({
      mode: 'directed',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'loop', sourceId: 'a', targetId: 'a' },
        { id: 'ab', sourceId: 'a', targetId: 'b' },
      ],
    });
    const { colors, colorCount } = getGraphColoring(graph);
    expect(colorCount).toBe(2);
    expect(colors.a).not.toBe(colors.b);
  });
});

describe('isValidColoring', () => {
  it('rejects colorings where adjacent nodes share a color', () => {
    const graph = makeC5();
    const bad = Object.fromEntries(graph.nodes.map((n) => [n.id, 0]));
    expect(isValidColoring(graph, bad)).toBe(false);
  });

  it('rejects a coloring missing a node', () => {
    const graph = makeC5();
    const { colors } = getGraphColoring(graph);
    delete colors.n0;
    expect(isValidColoring(graph, colors)).toBe(false);
  });

  it('rejects any coloring of a graph with a self-loop', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    expect(isValidColoring(graph, { a: 0 })).toBe(false);
  });

  it('accepts the coloring produced by getGraphColoring', () => {
    const graph = createCompleteGraph(5);
    const { colors } = getGraphColoring(graph);
    expect(isValidColoring(graph, colors)).toBe(true);
  });
});
