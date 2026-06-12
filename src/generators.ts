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
