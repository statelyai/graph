import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getLabelPropagationCommunities,
  genGirvanNewmanCommunities,
  getGirvanNewmanCommunities,
  getGreedyModularityCommunities,
  getModularity,
} from '../src/algorithms';

function toIdGroups(
  communities: Array<Array<{ id: string }>>,
): string[][] {
  return communities
    .map((community) => community.map((node) => node.id).sort())
    .sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

function makeDisconnectedTriangles() {
  return createGraph({
    mode: 'undirected',
    nodes: [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
      { id: 'f' },
    ],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'de', sourceId: 'd', targetId: 'e' },
      { id: 'df', sourceId: 'd', targetId: 'f' },
      { id: 'ef', sourceId: 'e', targetId: 'f' },
    ],
  });
}

function makeTrianglesWithBridge() {
  return createGraph({
    mode: 'undirected',
    nodes: [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
      { id: 'f' },
    ],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
      { id: 'de', sourceId: 'd', targetId: 'e' },
      { id: 'df', sourceId: 'd', targetId: 'f' },
      { id: 'ef', sourceId: 'e', targetId: 'f' },
    ],
  });
}

describe('community detection', () => {
  it('getLabelPropagationCommunities groups disconnected cliques into separate communities', () => {
    const communities = getLabelPropagationCommunities(makeDisconnectedTriangles());

    expect(toIdGroups(communities)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('genGirvanNewmanCommunities yields the first split lazily', () => {
    const partitions = [
      ...genGirvanNewmanCommunities(makeTrianglesWithBridge(), { maxLevels: 1 }),
    ];

    expect(partitions).toHaveLength(1);
    expect(toIdGroups(partitions[0])).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('getGirvanNewmanCommunities returns the requested split level eagerly', () => {
    const communities = getGirvanNewmanCommunities(makeTrianglesWithBridge(), {
      level: 1,
    });

    expect(toIdGroups(communities)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('getModularity scores the bridge split higher than the single-community partition', () => {
    const graph = makeTrianglesWithBridge();
    const splitCommunities = getGirvanNewmanCommunities(graph, { level: 1 });
    const singleCommunity = [graph.nodes];

    expect(getModularity(graph, splitCommunities)).toBeGreaterThan(
      getModularity(graph, singleCommunity),
    );
  });

  it('getGreedyModularityCommunities finds the two dense clusters around a bridge', () => {
    const communities = getGreedyModularityCommunities(makeTrianglesWithBridge());

    expect(toIdGroups(communities)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('getLabelPropagationCommunities with a seed is deterministic per seed', () => {
    const graph = makeDisconnectedTriangles();

    const first = getLabelPropagationCommunities(graph, { seed: 42 });
    const second = getLabelPropagationCommunities(graph, { seed: 42 });

    expect(toIdGroups(first)).toEqual(toIdGroups(second));
  });

  it('seeded label propagation separates disconnected cliques', () => {
    const graph = makeDisconnectedTriangles();

    for (const seed of [1, 2, 3, 99]) {
      const communities = getLabelPropagationCommunities(graph, { seed });
      expect(toIdGroups(communities)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    }
  });

  it('seeded label propagation returns a partition covering every node once', () => {
    const graph = makeTrianglesWithBridge();
    const communities = getLabelPropagationCommunities(graph, { seed: 7 });

    const allIds = communities.flatMap((community) =>
      community.map((node) => node.id),
    );
    expect([...allIds].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns empty community collections for an empty graph', () => {
    const graph = createGraph();

    expect(getLabelPropagationCommunities(graph)).toEqual([]);
    expect([...genGirvanNewmanCommunities(graph)]).toEqual([]);
    expect(getGirvanNewmanCommunities(graph)).toEqual([]);
    expect(getGreedyModularityCommunities(graph)).toEqual([]);
    expect(getModularity(graph, [])).toBe(0);
  });
});
