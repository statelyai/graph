import { createGraph } from './graph';
import type { EdgeConfig, Graph, NodeConfig } from './types';
import { mulberry32 } from './algorithms/shared';

function assertNonNegativeInteger(
  caller: string,
  name: string,
  value: number,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${caller}: ${name} ${value} is invalid — pass a non-negative integer`,
    );
  }
}

/**
 * Create the complete graph K_n: every pair of distinct nodes connected by
 * one undirected edge. Nodes are `n0..n{n-1}` (`options.idPrefix` overrides
 * the `n` prefix); edges are `e0..`.
 */
export function createCompleteGraph(
  n: number,
  options?: { idPrefix?: string },
): Graph {
  assertNonNegativeInteger('createCompleteGraph', 'node count', n);
  const prefix = options?.idPrefix ?? 'n';

  const nodes: NodeConfig[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `${prefix}${i}` });

  const edges: EdgeConfig[] = [];
  let edgeId = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({
        id: `e${edgeId++}`,
        sourceId: `${prefix}${i}`,
        targetId: `${prefix}${j}`,
      });
    }
  }

  return createGraph({ mode: 'undirected', nodes, edges });
}

/**
 * Create a `rows × cols` grid graph: node `(r, c)` is connected to its right
 * and down neighbors by undirected edges. Nodes are `n{r}_{c}`
 * (`options.idPrefix` overrides the `n` prefix); edges are `e0..`.
 */
export function createGridGraph(
  rows: number,
  cols: number,
  options?: { idPrefix?: string },
): Graph {
  assertNonNegativeInteger('createGridGraph', 'row count', rows);
  assertNonNegativeInteger('createGridGraph', 'column count', cols);
  const prefix = options?.idPrefix ?? 'n';
  const nodeId = (r: number, c: number): string => `${prefix}${r}_${c}`;

  const nodes: NodeConfig[] = [];
  const edges: EdgeConfig[] = [];
  let edgeId = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: nodeId(r, c) });
      if (c + 1 < cols) {
        edges.push({
          id: `e${edgeId++}`,
          sourceId: nodeId(r, c),
          targetId: nodeId(r, c + 1),
        });
      }
      if (r + 1 < rows) {
        edges.push({
          id: `e${edgeId++}`,
          sourceId: nodeId(r, c),
          targetId: nodeId(r + 1, c),
        });
      }
    }
  }

  return createGraph({ mode: 'undirected', nodes, edges });
}

/**
 * Create an Erdős–Rényi G(n, p) random graph: each of the n·(n-1)/2 node
 * pairs gets an undirected edge with probability `probability`. With
 * `options.seed` the result is deterministic per seed (mulberry32);
 * otherwise `Math.random` is used. Nodes are `n0..n{n-1}`
 * (`options.idPrefix` overrides the `n` prefix); edges are `e0..`.
 */
export function createRandomGraph(
  n: number,
  probability: number,
  options?: { seed?: number; idPrefix?: string },
): Graph {
  assertNonNegativeInteger('createRandomGraph', 'node count', n);
  if (!(probability >= 0 && probability <= 1)) {
    throw new Error(
      `createRandomGraph: probability ${probability} is invalid — pass a number between 0 and 1`,
    );
  }
  const prefix = options?.idPrefix ?? 'n';
  const rng =
    options?.seed !== undefined ? mulberry32(options.seed) : Math.random;

  const nodes: NodeConfig[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `${prefix}${i}` });

  const edges: EdgeConfig[] = [];
  let edgeId = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rng() < probability) {
        edges.push({
          id: `e${edgeId++}`,
          sourceId: `${prefix}${i}`,
          targetId: `${prefix}${j}`,
        });
      }
    }
  }

  return createGraph({ mode: 'undirected', nodes, edges });
}

/**
 * Create a Watts–Strogatz small-world graph. Start from a ring lattice of `n`
 * nodes where each node is joined to its `k` nearest neighbors (`k` must be
 * even), then rewire each ring edge with probability `beta`, keeping the graph
 * simple (no self-loops or duplicate edges). With `options.seed` the result is
 * deterministic per seed (mulberry32); otherwise `Math.random` is used. At
 * `beta = 0` the untouched ring lattice is returned. Nodes are `n0..n{n-1}`
 * (`options.idPrefix` overrides the `n` prefix); edges are `e0..`.
 */
export function createWattsStrogatzGraph(
  n: number,
  k: number,
  beta: number,
  options?: { seed?: number; idPrefix?: string },
): Graph {
  assertNonNegativeInteger('createWattsStrogatzGraph', 'node count', n);
  assertNonNegativeInteger('createWattsStrogatzGraph', 'neighbor count', k);
  if (k % 2 !== 0) {
    throw new Error(
      `createWattsStrogatzGraph: neighbor count ${k} is invalid — pass an even integer`,
    );
  }
  if (k >= n && n > 0) {
    throw new Error(
      `createWattsStrogatzGraph: neighbor count ${k} must be less than node count ${n}`,
    );
  }
  if (!(beta >= 0 && beta <= 1)) {
    throw new Error(
      `createWattsStrogatzGraph: beta ${beta} is invalid — pass a number between 0 and 1`,
    );
  }
  const prefix = options?.idPrefix ?? 'n';
  const rng =
    options?.seed !== undefined ? mulberry32(options.seed) : Math.random;

  const nodes: NodeConfig[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `${prefix}${i}` });

  // Undirected edges as an unordered pair set keyed by `min|max` position.
  const pairKey = (a: number, b: number): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`;
  const pairs = new Set<string>();
  // Ring edges in canonical order: node i to each of its j-th right neighbors.
  const ringEdges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k / 2; j++) {
      const target = (i + j) % n;
      const key = pairKey(i, target);
      if (!pairs.has(key)) {
        pairs.add(key);
        ringEdges.push([i, target]);
      }
    }
  }

  // Rewire the source endpoint of each ring edge with probability beta.
  for (const edge of ringEdges) {
    if (rng() >= beta) continue;
    const [i] = edge;
    // Pick a new distinct target not already adjacent to i.
    for (let attempt = 0; attempt < n; attempt++) {
      const candidate = Math.floor(rng() * n);
      if (candidate === i) continue;
      const key = pairKey(i, candidate);
      if (pairs.has(key)) continue;
      pairs.delete(pairKey(edge[0], edge[1]));
      pairs.add(key);
      edge[1] = candidate;
      break;
    }
  }

  const edges: EdgeConfig[] = [];
  let edgeId = 0;
  for (const [source, target] of ringEdges) {
    edges.push({
      id: `e${edgeId++}`,
      sourceId: `${prefix}${source}`,
      targetId: `${prefix}${target}`,
    });
  }

  return createGraph({ mode: 'undirected', nodes, edges });
}

/**
 * Create a Barabási–Albert scale-free graph by preferential attachment. Start
 * from a complete seed of `edgesPerNode` nodes, then add each remaining node
 * with `edgesPerNode` undirected edges to existing nodes chosen with
 * probability proportional to their current degree. With `options.seed` the
 * result is deterministic per seed (mulberry32); otherwise `Math.random` is
 * used. Every node ends with degree at least `edgesPerNode`. Nodes are
 * `n0..n{n-1}` (`options.idPrefix` overrides the `n` prefix); edges are `e0..`.
 */
export function createBarabasiAlbertGraph(
  n: number,
  edgesPerNode: number,
  options?: { seed?: number; idPrefix?: string },
): Graph {
  assertNonNegativeInteger('createBarabasiAlbertGraph', 'node count', n);
  assertNonNegativeInteger(
    'createBarabasiAlbertGraph',
    'edges per node',
    edgesPerNode,
  );
  if (edgesPerNode < 1 && n > 0) {
    throw new Error(
      `createBarabasiAlbertGraph: edges per node ${edgesPerNode} must be at least 1`,
    );
  }
  if (edgesPerNode > n) {
    throw new Error(
      `createBarabasiAlbertGraph: edges per node ${edgesPerNode} must not exceed node count ${n}`,
    );
  }
  const prefix = options?.idPrefix ?? 'n';
  const rng =
    options?.seed !== undefined ? mulberry32(options.seed) : Math.random;

  const nodes: NodeConfig[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `${prefix}${i}` });

  const edges: EdgeConfig[] = [];
  let edgeId = 0;
  // Repeated-node target list realizes preferential attachment: each endpoint
  // appears once per incident edge, so uniform picks are degree-weighted.
  const targets: number[] = [];

  // Seed: complete graph on the first `edgesPerNode` nodes.
  const m = edgesPerNode;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      edges.push({
        id: `e${edgeId++}`,
        sourceId: `${prefix}${i}`,
        targetId: `${prefix}${j}`,
      });
      targets.push(i, j);
    }
  }
  // A lone seed node (m === 1) has no edges yet; seed the target pool with it
  // so the first attachment has something to connect to.
  if (m === 1 && n > 0) targets.push(0);

  for (let v = m; v < n; v++) {
    const chosen = new Set<number>();
    while (chosen.size < m) {
      const pick =
        targets.length > 0
          ? targets[Math.floor(rng() * targets.length)]
          : Math.floor(rng() * v);
      if (pick === v || chosen.has(pick)) continue;
      chosen.add(pick);
    }
    for (const target of chosen) {
      edges.push({
        id: `e${edgeId++}`,
        sourceId: `${prefix}${v}`,
        targetId: `${prefix}${target}`,
      });
      targets.push(v, target);
    }
  }

  return createGraph({ mode: 'undirected', nodes, edges });
}
