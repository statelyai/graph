import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getLabelPropagationCommunities,
  getLouvainCommunities,
  getModularity,
} from '../src/algorithms';
import type { Graph } from '../src/types';

function toNodeCommunities(graph: Graph, communities: string[][]) {
  return communities.map((ids) =>
    ids.map((id) => graph.nodes.find((node) => node.id === id)!),
  );
}

// Two 4-cliques {a,b,c,d} and {e,f,g,h} joined by the single bridge d-e.
// Known answer: Louvain recovers the two cliques exactly.
// Hand-computed modularity of that partition: m = 13 edges, m2 = 26.
// Per clique: sum_in(ordered pairs) = 12, sum of degrees = 3+3+3+4 = 13,
// contribution = 12 - 13^2/26 = 5.5; Q = (5.5 + 5.5)/26 = 11/26 ≈ 0.4231.
function makeTwoCliquesWithBridge() {
  return createGraph({
    mode: 'undirected',
    nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id })),
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'ad', sourceId: 'a', targetId: 'd' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'bd', sourceId: 'b', targetId: 'd' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
      { id: 'ef', sourceId: 'e', targetId: 'f' },
      { id: 'eg', sourceId: 'e', targetId: 'g' },
      { id: 'eh', sourceId: 'e', targetId: 'h' },
      { id: 'fg', sourceId: 'f', targetId: 'g' },
      { id: 'fh', sourceId: 'f', targetId: 'h' },
      { id: 'gh', sourceId: 'g', targetId: 'h' },
      { id: 'de', sourceId: 'd', targetId: 'e' },
    ],
  });
}

describe('getLouvainCommunities', () => {
  it('recovers two 4-cliques joined by one bridge edge', () => {
    const graph = makeTwoCliquesWithBridge();
    const communities = getLouvainCommunities(graph);

    expect(communities).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
  });

  it('achieves the hand-computed modularity 11/26 on the two-clique graph', () => {
    const graph = makeTwoCliquesWithBridge();
    const communities = getLouvainCommunities(graph);
    const score = getModularity(graph, toNodeCommunities(graph, communities));

    expect(score).toBeCloseTo(11 / 26, 10);
  });

  it('matches or beats the label propagation partition modularity', () => {
    const graph = makeTwoCliquesWithBridge();

    const louvain = getModularity(
      graph,
      toNodeCommunities(graph, getLouvainCommunities(graph)),
    );
    const labelProp = getModularity(
      graph,
      getLabelPropagationCommunities(graph),
    );

    expect(louvain).toBeGreaterThanOrEqual(labelProp - 1e-12);
  });

  it('respects edge weights (heavy intra-weights, light bridge)', () => {
    // Two triangles with weight-10 internal edges joined by a weight-1
    // bridge. Known answer: the triangles are the communities.
    const graph = createGraph({
      mode: 'undirected',
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 10 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 10 },
        { id: 'de', sourceId: 'd', targetId: 'e', weight: 10 },
        { id: 'df', sourceId: 'd', targetId: 'f', weight: 10 },
        { id: 'ef', sourceId: 'e', targetId: 'f', weight: 10 },
        { id: 'cd', sourceId: 'c', targetId: 'd', weight: 1 },
      ],
    });

    expect(getLouvainCommunities(graph)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('supports a custom getWeight accessor', () => {
    const graph = createGraph<any, { w: number }>({
      mode: 'undirected',
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', data: { w: 10 } },
        { id: 'ac', sourceId: 'a', targetId: 'c', data: { w: 10 } },
        { id: 'bc', sourceId: 'b', targetId: 'c', data: { w: 10 } },
        { id: 'de', sourceId: 'd', targetId: 'e', data: { w: 10 } },
        { id: 'df', sourceId: 'd', targetId: 'f', data: { w: 10 } },
        { id: 'ef', sourceId: 'e', targetId: 'f', data: { w: 10 } },
        { id: 'cd', sourceId: 'c', targetId: 'd', data: { w: 1 } },
      ],
    });

    expect(
      getLouvainCommunities(graph, { getWeight: (edge) => edge.data.w }),
    ).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles self-loops without crashing or distorting communities', () => {
    const graph = makeTwoCliquesWithBridge();
    graph.edges.push({
      type: 'edge',
      id: 'aa',
      sourceId: 'a',
      targetId: 'a',
      data: null,
    });

    expect(getLouvainCommunities(graph)).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
  });

  it('returns [] for an empty graph', () => {
    expect(getLouvainCommunities(createGraph())).toEqual([]);
  });

  it('returns a single singleton community for a single node', () => {
    const graph = createGraph({ nodes: [{ id: 'only' }] });
    expect(getLouvainCommunities(graph)).toEqual([['only']]);
  });

  it('is deterministic across repeated runs', () => {
    const graph = makeTwoCliquesWithBridge();
    const first = getLouvainCommunities(graph);
    for (let i = 0; i < 5; i++) {
      expect(getLouvainCommunities(graph)).toEqual(first);
    }
  });
});
