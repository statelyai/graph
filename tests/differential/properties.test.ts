import { describe, expect, it } from 'vitest';

import { addEdge, addNode, createGraph, deleteEdge, updateEdge, updateNode } from '../../src/graph';
import {
  getConnectedComponents,
  getCycles,
  getMinimumSpanningTree,
  getPageRank,
  getShortestPath,
  hasPath,
  isAcyclic,
} from '../../src/algorithms';
import { getDegree } from '../../src/queries';
import { applyPatches, getDiff, getPatches, isEmptyDiff } from '../../src/diff';
import { reverseGraph } from '../../src/transforms';
import type { Graph, GraphMode } from '../../src/types';
import {
  makeRandomGraph,
  makeRandomGraphConfig,
  makeRichRandomGraph,
  mulberry32,
} from './generators';

/**
 * Randomized self-property tests: invariants that must hold for any graph,
 * checked over seeded random graphs (richer than the oracle graphs —
 * self-loops and parallel edges allowed).
 */

const SEEDS = [3, 7, 13, 21, 34, 42, 55, 68, 89, 101];

function canonicalComponents(graph: Graph): string[][] {
  return getConnectedComponents(graph)
    .map((component) => component.map((n) => n.id).sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 1. Mode override-equivalence
// ---------------------------------------------------------------------------

describe('property: undirected graph ≡ directed graph with all-undirected edges', () => {
  for (const seed of SEEDS) {
    it(`equivalent results (seed ${seed})`, () => {
      // Small graphs: getCycles enumerates all simple cycles, which grows
      // fast on dense undirected graphs.
      const { nodes, edges } = makeRandomGraphConfig(seed, {
        mode: 'undirected',
        nodeCount: 8 + (seed % 5),
        density: 1.3,
        weighted: true,
        simple: false,
        allowSelfLoops: true,
      });

      const gUndirected = createGraph({ mode: 'undirected', nodes, edges });
      const gOverride = createGraph({
        mode: 'directed',
        nodes,
        edges: edges.map((e) => ({ ...e, mode: 'undirected' as GraphMode })),
      });

      expect(isAcyclic(gOverride)).toBe(isAcyclic(gUndirected));
      expect(getCycles(gOverride).length).toBe(getCycles(gUndirected).length);
      expect(canonicalComponents(gOverride)).toEqual(
        canonicalComponents(gUndirected),
      );

      for (const node of gUndirected.nodes) {
        expect(getDegree(gOverride, node.id), `degree(${node.id})`).toBe(
          getDegree(gUndirected, node.id),
        );
      }

      const prUndirected = getPageRank(gUndirected);
      const prOverride = getPageRank(gOverride);
      for (const node of gUndirected.nodes) {
        expect(prOverride[node.id], `pagerank(${node.id})`).toBeCloseTo(
          prUndirected[node.id],
          10,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. reverseGraph involution
// ---------------------------------------------------------------------------

describe('property: reverseGraph(reverseGraph(g)) ≡ g', () => {
  for (const seed of SEEDS) {
    it(`round-trips (seed ${seed})`, () => {
      const rng = mulberry32(seed * 31 + 5);
      const graph = makeRichRandomGraph(seed, {
        mode: 'directed',
        maxNodes: 60,
        weighted: true,
        ports: true,
      });
      // Mix in per-edge mode overrides
      for (const edge of graph.edges) {
        const r = rng();
        if (r < 0.2) edge.mode = 'undirected';
        else if (r < 0.3) edge.mode = 'bidirectional';
      }

      const roundTripped = reverseGraph(reverseGraph(graph));

      expect(roundTripped.nodes.map((n) => n.id).sort()).toEqual(
        graph.nodes.map((n) => n.id).sort(),
      );
      expect(roundTripped.edges.length).toBe(graph.edges.length);

      const edgeById = new Map(roundTripped.edges.map((e) => [e.id, e]));
      for (const edge of graph.edges) {
        const rt = edgeById.get(edge.id);
        expect(rt, `edge ${edge.id} survives`).toBeDefined();
        expect(rt!.sourceId, `${edge.id}.sourceId`).toBe(edge.sourceId);
        expect(rt!.targetId, `${edge.id}.targetId`).toBe(edge.targetId);
        expect(rt!.sourcePort, `${edge.id}.sourcePort`).toBe(edge.sourcePort);
        expect(rt!.targetPort, `${edge.id}.targetPort`).toBe(edge.targetPort);
        expect(rt!.mode, `${edge.id}.mode`).toBe(edge.mode);
        expect(rt!.weight, `${edge.id}.weight`).toBe(edge.weight);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Diff convergence
// ---------------------------------------------------------------------------

/** Mutate a copy of `graph` with random public-API operations. */
function mutateRandomly(graph: Graph, seed: number, opCount: number): void {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const modes: (GraphMode | undefined)[] = [
    'directed',
    'undirected',
    'bidirectional',
    undefined,
  ];

  for (let i = 0; i < opCount; i++) {
    const op = Math.floor(rng() * 5);
    switch (op) {
      case 0: {
        addNode(graph, {
          id: `added${i}`,
          data: { label: `added ${i}` },
          ports: [{ name: 'p1' }],
        });
        break;
      }
      case 1: {
        const source = pick(graph.nodes);
        const target = pick(graph.nodes);
        const mode = pick(modes);
        addEdge(graph, {
          id: `addedEdge${i}`,
          sourceId: source.id,
          targetId: target.id,
          weight: 1 + Math.floor(rng() * 10),
          ...(mode !== undefined ? { mode } : {}),
        });
        break;
      }
      case 2: {
        if (graph.edges.length === 0) break;
        deleteEdge(graph, pick(graph.edges).id);
        break;
      }
      case 3: {
        updateNode(graph, pick(graph.nodes).id, {
          data: { label: `updated ${i}` },
        });
        break;
      }
      case 4: {
        if (graph.edges.length === 0) break;
        const edge = pick(graph.edges);
        const r = rng();
        if (r < 0.4) {
          updateEdge(graph, edge.id, { weight: 1 + Math.floor(rng() * 10) });
        } else if (r < 0.7) {
          updateEdge(graph, edge.id, { mode: pick(['directed', 'undirected']) });
        } else {
          // Clear port references (always valid)
          updateEdge(graph, edge.id, { sourcePort: null, targetPort: null });
        }
        break;
      }
    }
  }
}

describe('property: applyPatches(a, getPatches(a, b)) converges to b', () => {
  for (const seed of SEEDS) {
    it(`converges (seed ${seed})`, () => {
      const a = makeRichRandomGraph(seed, {
        mode: 'directed',
        minNodes: 15,
        maxNodes: 30,
        weighted: true,
        ports: true,
      });
      const b = structuredClone(a);
      mutateRandomly(b, seed * 7 + 1, 15);

      // Sanity: the mutation actually changed something
      expect(isEmptyDiff(getDiff(a, b))).toBe(false);

      const fresh = structuredClone(a);
      applyPatches(fresh, getPatches(a, b));
      expect(isEmptyDiff(getDiff(fresh, b))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. hasPath ⇔ getShortestPath consistency
// ---------------------------------------------------------------------------

describe('property: hasPath(x, y) ⇔ getShortestPath({from: x, to: y}) defined', () => {
  for (const seed of SEEDS) {
    it(`consistent on random pairs (seed ${seed})`, () => {
      const graph = makeRichRandomGraph(seed, {
        mode: seed % 2 === 0 ? 'directed' : 'undirected',
        maxNodes: 80,
        weighted: true,
        density: 1.4,
      });
      const rng = mulberry32(seed * 13 + 3);
      const n = graph.nodes.length;

      for (let i = 0; i < 20; i++) {
        const x = graph.nodes[Math.floor(rng() * n)].id;
        const y = graph.nodes[Math.floor(rng() * n)].id;
        if (x === y) continue;

        const reachable = hasPath(graph, x, y);
        const path = getShortestPath(graph, { from: x, to: y });
        expect(path !== undefined, `hasPath(${x}, ${y}) = ${reachable}`).toBe(
          reachable,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. MST: prim ≡ kruskal
// ---------------------------------------------------------------------------

function totalWeight(graph: Graph): number {
  return graph.edges.reduce((sum, e) => sum + (e.weight ?? 1), 0);
}

describe('property: prim and kruskal agree on connected undirected graphs', () => {
  for (const seed of SEEDS) {
    it(`equal total weight and n-1 edges (seed ${seed})`, () => {
      const graph = makeRandomGraph(seed, {
        mode: 'undirected',
        weighted: true,
        connected: true,
        density: 2.2,
        maxNodes: 80,
      });
      const n = graph.nodes.length;

      const prim = getMinimumSpanningTree(graph, { algorithm: 'prim' });
      const kruskal = getMinimumSpanningTree(graph, { algorithm: 'kruskal' });

      expect(prim.edges.length).toBe(n - 1);
      expect(kruskal.edges.length).toBe(n - 1);
      expect(totalWeight(prim)).toBe(totalWeight(kruskal));
    });
  }
});
