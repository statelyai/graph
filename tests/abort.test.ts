import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { createGridGraph, createCompleteGraph } from '../src/generators';
import {
  getBetweennessCentrality,
  getPageRank,
} from '../src/algorithms/centrality';
import { getLouvainCommunities } from '../src/algorithms/louvain';
import { getMaxFlow } from '../src/algorithms/flow';
import { getAllPairsShortestPaths } from '../src/algorithms/paths';
import { isIsomorphic } from '../src/algorithms/isomorphism';

/** A graph big enough that each target function actually starts work. */
function bigGraph() {
  return createGridGraph(12, 12);
}

/**
 * A smaller connected graph for all-pairs — the O(n²) result set on the big
 * grid is slow and overflows the spread in `results.push(...)`.
 */
function smallGraph() {
  return createGridGraph(4, 4);
}

/** A directed s→…→t flow network with multiple augmenting paths. */
function flowGraph() {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }));
  const edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    weight: number;
  }> = [];
  let e = 0;
  // Two parallel chains from source n0 to sink n11.
  for (const chain of [
    [0, 1, 2, 3, 4, 11],
    [0, 5, 6, 7, 8, 11],
    [0, 9, 10, 11],
  ]) {
    for (let i = 0; i + 1 < chain.length; i++) {
      edges.push({
        id: `e${e++}`,
        sourceId: `n${chain[i]}`,
        targetId: `n${chain[i + 1]}`,
        weight: 3,
      });
    }
  }
  return createGraph({ mode: 'directed', nodes, edges });
}

/** Custom abort reason so we can assert identity, not just "throws". */
class Cancelled extends Error {}

function preAborted(): AbortSignal {
  const controller = new AbortController();
  controller.abort(new Cancelled('stop'));
  return controller.signal;
}

describe('AbortSignal cancellation', () => {
  describe('throws the abort reason when pre-aborted', () => {
    it('getBetweennessCentrality', () => {
      const graph = bigGraph();
      expect(() =>
        getBetweennessCentrality(graph, { signal: preAborted() }),
      ).toThrow(Cancelled);
    });

    it('getPageRank', () => {
      const graph = bigGraph();
      expect(() => getPageRank(graph, { signal: preAborted() })).toThrow(
        Cancelled,
      );
    });

    it('getLouvainCommunities', () => {
      const graph = bigGraph();
      expect(() =>
        getLouvainCommunities(graph, { signal: preAborted() }),
      ).toThrow(Cancelled);
    });

    it('getMaxFlow', () => {
      const graph = flowGraph();
      expect(() =>
        getMaxFlow(graph, { from: 'n0', to: 'n11', signal: preAborted() }),
      ).toThrow(Cancelled);
    });

    it('getAllPairsShortestPaths', () => {
      expect(() =>
        getAllPairsShortestPaths(smallGraph(), { signal: preAborted() }),
      ).toThrow(Cancelled);
    });

    it('isIsomorphic', () => {
      const a = createCompleteGraph(8);
      const b = createCompleteGraph(8);
      expect(() => isIsomorphic(a, b, { signal: preAborted() })).toThrow(
        Cancelled,
      );
    });
  });

  describe('a non-aborted signal produces identical results', () => {
    it('getBetweennessCentrality', () => {
      const graph = bigGraph();
      const signal = new AbortController().signal;
      expect(getBetweennessCentrality(graph, { signal })).toEqual(
        getBetweennessCentrality(graph),
      );
    });

    it('getPageRank', () => {
      const graph = bigGraph();
      const signal = new AbortController().signal;
      expect(getPageRank(graph, { signal })).toEqual(getPageRank(graph));
    });

    it('getLouvainCommunities', () => {
      const graph = bigGraph();
      const signal = new AbortController().signal;
      expect(getLouvainCommunities(graph, { signal })).toEqual(
        getLouvainCommunities(graph),
      );
    });

    it('getMaxFlow', () => {
      const graph = flowGraph();
      const signal = new AbortController().signal;
      expect(getMaxFlow(graph, { from: 'n0', to: 'n11', signal })).toEqual(
        getMaxFlow(graph, { from: 'n0', to: 'n11' }),
      );
    });

    it('getAllPairsShortestPaths', () => {
      const graph = smallGraph();
      const signal = new AbortController().signal;
      expect(getAllPairsShortestPaths(graph, { signal })).toEqual(
        getAllPairsShortestPaths(graph),
      );
    });

    it('isIsomorphic', () => {
      const a = createCompleteGraph(8);
      const b = createCompleteGraph(8);
      const signal = new AbortController().signal;
      expect(isIsomorphic(a, b, { signal })).toBe(isIsomorphic(a, b));
    });
  });
});
