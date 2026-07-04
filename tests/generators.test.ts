import { describe, expect, it } from 'vitest';
import {
  createBarabasiAlbertGraph,
  createCompleteGraph,
  createGridGraph,
  createRandomGraph,
  createWattsStrogatzGraph,
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

describe('createWattsStrogatzGraph', () => {
  it('builds an untouched ring lattice at beta=0', () => {
    const graph = createWattsStrogatzGraph(8, 4, 0, { seed: 1 });

    expect(graph.mode).toBe('undirected');
    expect(graph.nodes).toHaveLength(8);
    // n·k/2 edges; every node has degree exactly k on the ring.
    expect(graph.edges).toHaveLength((8 * 4) / 2);
    for (const node of graph.nodes) {
      expect(getDegree(graph, node.id)).toBe(4);
    }
    // Ring adjacency: n0 joins n1, n2 (right) and n7, n6 (left).
    const pairs = new Set(
      graph.edges.map((e) =>
        [e.sourceId, e.targetId].sort().join('|'),
      ),
    );
    expect(pairs.has('n0|n1')).toBe(true);
    expect(pairs.has('n0|n2')).toBe(true);
    expect(pairs.has('n0|n7')).toBe(true);
    expect(pairs.has('n0|n6')).toBe(true);
  });

  it('preserves the edge count and simplicity after rewiring', () => {
    const graph = createWattsStrogatzGraph(20, 4, 0.3, { seed: 5 });
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const pairs = new Set<string>();

    expect(graph.edges).toHaveLength((20 * 4) / 2);
    for (const edge of graph.edges) {
      expect(edge.sourceId).not.toBe(edge.targetId);
      expect(nodeIds.has(edge.sourceId)).toBe(true);
      expect(nodeIds.has(edge.targetId)).toBe(true);
      const key = [edge.sourceId, edge.targetId].sort().join('|');
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it('is deterministic per seed', () => {
    const a = createWattsStrogatzGraph(20, 4, 0.4, { seed: 9 });
    const b = createWattsStrogatzGraph(20, 4, 0.4, { seed: 9 });
    const c = createWattsStrogatzGraph(20, 4, 0.4, { seed: 10 });
    expect(a).toEqual(b);
    expect(a.edges).not.toEqual(c.edges);
  });

  it('supports id prefixing', () => {
    const graph = createWattsStrogatzGraph(4, 2, 0, { idPrefix: 'w' });
    expect(graph.nodes.map((n) => n.id)).toEqual(['w0', 'w1', 'w2', 'w3']);
  });

  it('throws on invalid arguments', () => {
    expect(() => createWattsStrogatzGraph(10, 3, 0.1)).toThrow(/even integer/);
    expect(() => createWattsStrogatzGraph(4, 4, 0.1)).toThrow(/less than node count/);
    expect(() => createWattsStrogatzGraph(10, 4, 1.5)).toThrow(/between 0 and 1/);
    expect(() => createWattsStrogatzGraph(-1, 2, 0.1)).toThrow(
      /non-negative integer/,
    );
  });
});

describe('createBarabasiAlbertGraph', () => {
  it('adds edgesPerNode edges per new node and reaches the min degree', () => {
    const m = 3;
    const n = 30;
    const graph = createBarabasiAlbertGraph(n, m, { seed: 2 });

    expect(graph.mode).toBe('undirected');
    expect(graph.nodes).toHaveLength(n);
    // Seed K_m has m·(m-1)/2 edges; each of the remaining n-m nodes adds m.
    expect(graph.edges).toHaveLength((m * (m - 1)) / 2 + (n - m) * m);
    // Every node added after the seed contributes m incident edges, and seed
    // nodes gain degree from later attachments, so all degrees are >= m.
    for (const node of graph.nodes) {
      expect(getDegree(graph, node.id)).toBeGreaterThanOrEqual(m);
    }
  });

  it('produces only valid simple undirected edges', () => {
    const graph = createBarabasiAlbertGraph(25, 2, { seed: 8 });
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const pairs = new Set<string>();
    for (const edge of graph.edges) {
      expect(edge.sourceId).not.toBe(edge.targetId);
      expect(nodeIds.has(edge.sourceId)).toBe(true);
      expect(nodeIds.has(edge.targetId)).toBe(true);
      const key = [edge.sourceId, edge.targetId].sort().join('|');
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it('is deterministic per seed', () => {
    const a = createBarabasiAlbertGraph(30, 2, { seed: 11 });
    const b = createBarabasiAlbertGraph(30, 2, { seed: 11 });
    const c = createBarabasiAlbertGraph(30, 2, { seed: 12 });
    expect(a).toEqual(b);
    expect(a.edges).not.toEqual(c.edges);
  });

  it('handles m=1 as a growing tree', () => {
    const graph = createBarabasiAlbertGraph(10, 1, { seed: 3 });
    // A tree on n nodes has n-1 edges.
    expect(graph.edges).toHaveLength(9);
  });

  it('supports id prefixing', () => {
    const graph = createBarabasiAlbertGraph(4, 2, { idPrefix: 'b' });
    expect(graph.nodes.map((n) => n.id)).toEqual(['b0', 'b1', 'b2', 'b3']);
  });

  it('throws on invalid arguments', () => {
    expect(() => createBarabasiAlbertGraph(5, 6)).toThrow(/not exceed node count/);
    expect(() => createBarabasiAlbertGraph(5, 0)).toThrow(/at least 1/);
    expect(() => createBarabasiAlbertGraph(-1, 2)).toThrow(
      /non-negative integer/,
    );
  });
});
