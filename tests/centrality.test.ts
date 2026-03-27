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
} from '../src/algorithms';

describe('centrality and link analysis', () => {
  it('getDegreeCentrality normalizes undirected degree by n - 1', () => {
    const graph = createGraph({
      type: 'undirected',
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
      type: 'undirected',
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
      type: 'undirected',
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
      type: 'undirected',
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
  });
});
