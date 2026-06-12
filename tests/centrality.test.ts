import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getDegreeCentrality,
  getInDegreeCentrality,
  getOutDegreeCentrality,
  getClosenessCentrality,
  getBetweennessCentrality,
  getPageRank,
  getHITS,
  getEigenvectorCentrality,
  getKatzCentrality,
} from '../src/algorithms';

describe('centrality and link analysis', () => {
  it('getDegreeCentrality normalizes undirected degree by n - 1', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(getDegreeCentrality(graph)).toEqual({
      a: 0.5,
      b: 1,
      c: 0.5,
    });
  });

  it('getInDegreeCentrality and getOutDegreeCentrality normalize directed degrees', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(getOutDegreeCentrality(graph)).toEqual({
      a: 1,
      b: 0.5,
      c: 0,
    });

    expect(getInDegreeCentrality(graph)).toEqual({
      a: 0,
      b: 0.5,
      c: 1,
    });
  });

  it('getClosenessCentrality favors central nodes on an undirected path', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(getClosenessCentrality(graph)).toEqual({
      a: 2 / 3,
      b: 1,
      c: 2 / 3,
    });
  });

  it('getBetweennessCentrality assigns all path betweenness to the middle node', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(getBetweennessCentrality(graph)).toEqual({
      a: 0,
      b: 1,
      c: 0,
    });
  });

  it('getPageRank ranks the center of a mutual star highest', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
        { id: 'ca', sourceId: 'c', targetId: 'a' },
      ],
    });

    const ranks = getPageRank(graph);

    expect(ranks.a).toBeGreaterThan(ranks.b);
    expect(ranks.a).toBeGreaterThan(ranks.c);
    expect(ranks.b).toBeCloseTo(ranks.c, 6);
    expect(ranks.a + ranks.b + ranks.c).toBeCloseTo(1, 6);
  });

  it('getHITS returns hub and authority maps', () => {
    const graph = createGraph({
      nodes: [{ id: 'h1' }, { id: 'h2' }, { id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'h1', targetId: 'a' },
        { id: 'e2', sourceId: 'h1', targetId: 'b' },
        { id: 'e3', sourceId: 'h2', targetId: 'b' },
      ],
    });

    const hits = getHITS(graph);

    expect(hits.hubs.h1).toBeGreaterThan(hits.hubs.h2);
    expect(hits.authorities.b).toBeGreaterThan(hits.authorities.a);
    expect(hits.authorities.h1).toBeCloseTo(0, 6);
    expect(hits.hubs.a).toBeCloseTo(0, 6);
  });

  it('getEigenvectorCentrality ranks the center of an undirected star highest', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'ad', sourceId: 'a', targetId: 'd' },
      ],
    });

    const scores = getEigenvectorCentrality(graph);

    expect(scores.a).toBeGreaterThan(scores.b);
    expect(scores.a).toBeGreaterThan(scores.c);
    expect(scores.a).toBeGreaterThan(scores.d);
    expect(scores.b).toBeCloseTo(scores.c, 6);
    expect(scores.c).toBeCloseTo(scores.d, 6);
  });

  it('getEigenvectorCentrality matches the known star eigenvector (L2 normalized)', () => {
    // Hand-verified: K1,3 has dominant eigenvalue √3 with eigenvector
    // (√3, 1, 1, 1); normalized: center √3/√6 ≈ 0.7071, leaves 1/√6 ≈ 0.4082.
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'ad', sourceId: 'a', targetId: 'd' },
      ],
    });

    const scores = getEigenvectorCentrality(graph);

    expect(scores.a).toBeCloseTo(Math.sqrt(3 / 6), 4);
    expect(scores.b).toBeCloseTo(Math.sqrt(1 / 6), 4);
  });

  it('getEigenvectorCentrality supports a getWeight accessor', () => {
    // Heavier edge pulls its leaf above the others.
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 5 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
        { id: 'ad', sourceId: 'a', targetId: 'd', weight: 1 },
      ],
    });

    const scores = getEigenvectorCentrality(graph, {
      getWeight: (edge) => edge.weight ?? 1,
    });

    expect(scores.b).toBeGreaterThan(scores.c);
    expect(scores.c).toBeCloseTo(scores.d, 6);
  });

  it('getEigenvectorCentrality throws a descriptive error on non-convergence', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    expect(() =>
      getEigenvectorCentrality(graph, { maxIterations: 1, tolerance: 0 }),
    ).toThrow(/failed to converge within 1 iterations.*maxIterations/);
  });

  it('getKatzCentrality matches the known fixed point of a directed path', () => {
    // Hand-verified for a->b->c with alpha 0.1, beta 1: the fixed point of
    // x = 0.1·Aᵀx + 1 is (1, 1.1, 1.11); L2 normalization preserves ratios.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
      ],
    });

    const scores = getKatzCentrality(graph);

    expect(scores.b / scores.a).toBeCloseTo(1.1, 5);
    expect(scores.c / scores.a).toBeCloseTo(1.11, 5);
    const norm = Math.sqrt(
      scores.a ** 2 + scores.b ** 2 + scores.c ** 2,
    );
    expect(norm).toBeCloseTo(1, 6);
  });

  it('getKatzCentrality respects alpha, beta, and getWeight', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 2 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
      ],
    });

    // Fixed point with alpha 0.2, beta 3: a = 3, b = 3 + 0.2·2·3 = 4.2,
    // c = 3 + 0.2·1·3 = 3.6 — hand-verified, ratios survive normalization.
    const scores = getKatzCentrality(graph, {
      alpha: 0.2,
      beta: 3,
      getWeight: (edge) => edge.weight ?? 1,
    });

    expect(scores.b / scores.a).toBeCloseTo(1.4, 6);
    expect(scores.c / scores.a).toBeCloseTo(1.2, 6);
  });

  it('getKatzCentrality throws when alpha exceeds the spectral radius bound', () => {
    // 2-cycle has λ_max = 1; alpha 1 diverges.
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ba', sourceId: 'b', targetId: 'a' },
      ],
    });

    expect(() => getKatzCentrality(graph, { alpha: 1 })).toThrow(
      /failed to converge.*alpha 1/,
    );
  });

  it('returns empty maps for an empty graph', () => {
    const graph = createGraph();

    expect(getDegreeCentrality(graph)).toEqual({});
    expect(getInDegreeCentrality(graph)).toEqual({});
    expect(getOutDegreeCentrality(graph)).toEqual({});
    expect(getClosenessCentrality(graph)).toEqual({});
    expect(getBetweennessCentrality(graph)).toEqual({});
    expect(getPageRank(graph)).toEqual({});
    expect(getHITS(graph)).toEqual({ hubs: {}, authorities: {} });
    expect(getEigenvectorCentrality(graph)).toEqual({});
    expect(getKatzCentrality(graph)).toEqual({});
  });
});
