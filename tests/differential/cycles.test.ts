import { describe, expect, it } from 'vitest';

import { createGraph } from '../../src/graph';
import { genCycles, getCycle, isAcyclic } from '../../src/algorithms';
import { getEffectiveModeKind } from '../../src/algorithms/shared';
import { getEdgeMode } from '../../src/mode';
import type { Graph, GraphPath } from '../../src/types';
import {
  oracleCyclesDirected,
  oracleCyclesMixed,
  oracleCyclesUndirected,
} from './cycle-oracle';
import { mulberry32 } from './generators';

/**
 * `genCycles`, `getCycle`, and `isAcyclic` must agree with each other and
 * with an exhaustive backtracking oracle on small random multigraphs mixing
 * directed and non-directed edges, self-loops, and parallel edges.
 */

type EdgeKind = 'directed' | 'undirected' | 'mixed';

function makeGraph(seed: number, kind: EdgeKind): Graph {
  const random = mulberry32(seed);
  const n = 1 + Math.floor(random() * 6);
  const m = Math.floor(random() * 10);
  const node = () => `n${Math.floor(random() * n)}`;
  return createGraph({
    mode: kind === 'undirected' ? 'undirected' : 'directed',
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges: Array.from({ length: m }, (_, i) => ({
      id: `e${i}`,
      sourceId: node(),
      targetId: node(),
      ...(kind === 'mixed' && random() < 0.5 ? { mode: 'undirected' as const } : {}),
    })),
  });
}

function oracleCycles(graph: Graph): GraphPath[] {
  const kind = getEffectiveModeKind(graph);
  return [
    ...(kind === 'mixed'
      ? oracleCyclesMixed(graph)
      : kind === 'non-directed'
        ? oracleCyclesUndirected(graph)
        : oracleCyclesDirected(graph)),
  ];
}

const keyOf = (path: GraphPath) =>
  path.steps
    .map((step) => step.edge.id)
    .sort()
    .join(',');

/** Throws unless `path` is a closed walk with distinct nodes and edges. */
function assertSimpleCycle(graph: Graph, path: GraphPath): void {
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();
  let at = path.source.id;
  for (const { edge, node } of path.steps) {
    const forward = edge.sourceId === at && edge.targetId === node.id;
    const backward =
      getEdgeMode(graph, edge) !== 'directed' &&
      edge.targetId === at &&
      edge.sourceId === node.id;
    expect(forward || backward).toBe(true);
    expect(seenEdges.has(edge.id)).toBe(false);
    expect(seenNodes.has(node.id)).toBe(false);
    seenEdges.add(edge.id);
    seenNodes.add(node.id);
    at = node.id;
  }
  expect(at).toBe(path.source.id);
}

describe('cycles: genCycles / getCycle / isAcyclic agree', () => {
  for (const kind of ['directed', 'undirected', 'mixed'] as const) {
    it(`${kind}: matches the exhaustive oracle on 300 random graphs`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const graph = makeGraph(seed * 7919, kind);
        const cycles = [...genCycles(graph)];
        const expected = oracleCycles(graph);

        for (const cycle of cycles) {
          assertSimpleCycle(graph, cycle);
          // Each cycle starts at its smallest node id
          const ids = cycle.steps.map((step) => step.node.id);
          expect(cycle.source.id).toBe([...ids].sort()[0]);
        }
        const keys = cycles.map(keyOf);
        expect(new Set(keys).size).toBe(keys.length);
        expect([...keys].sort()).toEqual(expected.map(keyOf).sort());

        const witness = getCycle(graph);
        if (witness) assertSimpleCycle(graph, witness);
        expect(witness === undefined).toBe(cycles.length === 0);
        expect(isAcyclic(graph)).toBe(cycles.length === 0);
      }
    });
  }
});
