import { describe, expect, it } from 'vitest';

import { createGraph } from '../../src/graph';
import { isIsomorphic } from '../../src/algorithms';
import type { Graph } from '../../src/types';
import { mulberry32 } from './generators';
import { oracleIsIsomorphic } from './isomorphism-oracle';

/**
 * `isIsomorphic` must agree with an exhaustive backtracking oracle on small
 * random multigraphs (mixed edge modes, self-loops, parallel edges), and
 * must accept every relabeled, reordered copy of a graph.
 */

function makeGraph(random: () => number, n: number, m: number): Graph {
  const node = () => `n${Math.floor(random() * n)}`;
  return createGraph({
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, data: i % 2 })),
    edges: Array.from({ length: m }, (_, i) => ({
      id: `e${i}`,
      sourceId: node(),
      targetId: node(),
      data: Math.floor(random() * 2),
      ...(random() < 0.3 ? { mode: 'undirected' as const } : {}),
    })),
  });
}

/** Same structure under shuffled node ids and node/edge array order. */
function makeShuffledCopy(random: () => number, graph: Graph): Graph {
  const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const ids = shuffle(graph.nodes.map((node) => node.id));
  const rename = new Map(graph.nodes.map((node, i) => [node.id, `x${ids[i]}`]));
  return createGraph({
    nodes: shuffle(graph.nodes).map((node) => ({ ...node, id: rename.get(node.id)! })),
    edges: shuffle(graph.edges).map((edge) => ({
      ...edge,
      sourceId: rename.get(edge.sourceId)!,
      targetId: rename.get(edge.targetId)!,
    })),
  });
}

const sameData = (a: { data: unknown }, b: { data: unknown }) => a.data === b.data;

describe('isIsomorphic agrees with the exhaustive oracle', () => {
  it('accepts shuffled copies, with and without payload predicates', () => {
    const random = mulberry32(17);
    for (let round = 0; round < 300; round++) {
      const graph = makeGraph(random, 1 + Math.floor(random() * 7), Math.floor(random() * 12));
      const copy = makeShuffledCopy(random, graph);
      expect(isIsomorphic(graph, copy)).toBe(true);
      expect(
        isIsomorphic(graph, copy, { nodeMatch: sameData, edgeMatch: sameData }),
      ).toBe(true);
    }
  });

  it('matches the oracle on random pairs of the same size', () => {
    const random = mulberry32(29);
    let agreedIsomorphic = 0;
    for (let round = 0; round < 2000; round++) {
      const n = 1 + Math.floor(random() * 5);
      const m = Math.floor(random() * 6);
      const a = makeGraph(random, n, m);
      const b = makeGraph(random, n, m);
      const options = round % 2 ? { nodeMatch: sameData, edgeMatch: sameData } : {};
      const expected = oracleIsIsomorphic(a, b, options);
      expect(isIsomorphic(a, b, options)).toBe(expected);
      if (expected) agreedIsomorphic++;
    }
    // The sample must exercise both answers
    expect(agreedIsomorphic).toBeGreaterThan(50);
  });

  it('never pairs a directed self-loop with a non-directed one', () => {
    const make = (undirectedLabel: number) =>
      createGraph({
        nodes: [{ id: 'a' }],
        edges: [
          { id: 'd', sourceId: 'a', targetId: 'a', data: 1 - undirectedLabel },
          { id: 'u', sourceId: 'a', targetId: 'a', data: undirectedLabel, mode: 'undirected' },
        ],
      });
    expect(isIsomorphic(make(0), make(1), { edgeMatch: sameData })).toBe(false);
    expect(isIsomorphic(make(0), make(0), { edgeMatch: sameData })).toBe(true);
  });

  it('pairs parallel edges exactly under edgeMatch', () => {
    // Greedy pairing would match a's first edge (label 1) with b's first
    // edge (accepts anything) and then fail; an exact pairing succeeds.
    const make = (labels: number[]) =>
      createGraph({
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: labels.map((data, i) => ({ id: `e${i}`, sourceId: 'a', targetId: 'b', data })),
      });
    const edgeMatch = (x: { data: number }, y: { data: number }) =>
      y.data === 0 || x.data === y.data;
    expect(isIsomorphic(make([1, 2]), make([0, 1]), { edgeMatch })).toBe(true);
  });
});
