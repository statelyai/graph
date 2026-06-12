import { describe, expect, it } from 'vitest';
import {
  createCompleteGraph,
  createGridGraph,
  createRandomGraph,
} from '../src/generators';
import { getDegree } from '../src/queries';

describe('createCompleteGraph', () => {
  it('creates K4 with all n·(n-1)/2 pairs', () => {
    const graph = createCompleteGraph(4);

    expect(graph.mode).toBe('undirected');
    expect(graph.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2', 'n3']);
    expect(graph.edges).toHaveLength(6);
    const pairs = new Set(
      graph.edges.map((e) => `${e.sourceId}|${e.targetId}`),
    );
    expect(pairs.size).toBe(6);
    for (const node of graph.nodes) {
      expect(getDegree(graph, node.id)).toBe(3);
    }
  });

  it('handles trivial sizes', () => {
    expect(createCompleteGraph(0).nodes).toEqual([]);
    expect(createCompleteGraph(1).nodes).toHaveLength(1);
    expect(createCompleteGraph(1).edges).toEqual([]);
  });

  it('supports id prefixing', () => {
    const graph = createCompleteGraph(2, { idPrefix: 'v' });
    expect(graph.nodes.map((n) => n.id)).toEqual(['v0', 'v1']);
  });

  it('throws on an invalid node count', () => {
    expect(() => createCompleteGraph(-1)).toThrow(/non-negative integer/);
    expect(() => createCompleteGraph(1.5)).toThrow(/non-negative integer/);
  });
});

describe('createGridGraph', () => {
  it('creates a 2x3 grid with rows·(cols-1) + cols·(rows-1) edges', () => {
    const graph = createGridGraph(2, 3);

    expect(graph.mode).toBe('undirected');
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(7); // 2·2 horizontal + 3·1 vertical
    expect(graph.nodes.map((n) => n.id)).toContain('n1_2');
    // Corner has degree 2, edge-center degree 3.
    expect(getDegree(graph, 'n0_0')).toBe(2);
    expect(getDegree(graph, 'n0_1')).toBe(3);
  });

  it('handles degenerate dimensions', () => {
    expect(createGridGraph(1, 1).nodes).toHaveLength(1);
    expect(createGridGraph(1, 1).edges).toEqual([]);
    expect(createGridGraph(0, 5).nodes).toEqual([]);
    // A 1×n grid is a path.
    expect(createGridGraph(1, 4).edges).toHaveLength(3);
  });

  it('supports id prefixing', () => {
    const graph = createGridGraph(1, 2, { idPrefix: 'cell' });
    expect(graph.nodes.map((n) => n.id)).toEqual(['cell0_0', 'cell0_1']);
  });

  it('throws on invalid dimensions', () => {
    expect(() => createGridGraph(-1, 2)).toThrow(/non-negative integer/);
    expect(() => createGridGraph(2, 2.5)).toThrow(/non-negative integer/);
  });
});

describe('createRandomGraph', () => {
  it('is deterministic per seed', () => {
    const a = createRandomGraph(30, 0.3, { seed: 42 });
    const b = createRandomGraph(30, 0.3, { seed: 42 });
    const c = createRandomGraph(30, 0.3, { seed: 43 });

    expect(a).toEqual(b);
    expect(a.edges.map((e) => `${e.sourceId}|${e.targetId}`)).not.toEqual(
      c.edges.map((e) => `${e.sourceId}|${e.targetId}`),
    );
  });

  it('produces no edges at p=0 and the complete graph at p=1', () => {
    expect(createRandomGraph(10, 0, { seed: 1 }).edges).toEqual([]);
    expect(createRandomGraph(10, 1, { seed: 1 }).edges).toHaveLength(45);
  });

  it('produces only valid simple undirected edges', () => {
    const graph = createRandomGraph(25, 0.4, { seed: 7 });
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const pairs = new Set<string>();

    expect(graph.mode).toBe('undirected');
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.sourceId)).toBe(true);
      expect(nodeIds.has(edge.targetId)).toBe(true);
      expect(edge.sourceId).not.toBe(edge.targetId);
      const key = `${edge.sourceId}|${edge.targetId}`;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it('supports id prefixing', () => {
    const graph = createRandomGraph(2, 1, { seed: 1, idPrefix: 'x' });
    expect(graph.nodes.map((n) => n.id)).toEqual(['x0', 'x1']);
    expect(graph.edges[0].sourceId).toBe('x0');
  });

  it('throws on invalid arguments', () => {
    expect(() => createRandomGraph(-2, 0.5)).toThrow(/non-negative integer/);
    expect(() => createRandomGraph(5, 1.2)).toThrow(/between 0 and 1/);
    expect(() => createRandomGraph(5, Number.NaN)).toThrow(/between 0 and 1/);
  });
});
