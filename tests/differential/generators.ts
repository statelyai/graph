import { createGraph } from '../../src/graph';
import type { EdgeConfig, Graph, GraphMode, NodeConfig } from '../../src/types';

// --- Seeded PRNG (mulberry32) — same pattern as src/walks.ts ---

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomGraphOptions {
  mode: 'directed' | 'undirected';
  /** Exact node count; otherwise seeded random in [minNodes, maxNodes]. */
  nodeCount?: number;
  /** Node count range when nodeCount is not given. Defaults 20–150. */
  minNodes?: number;
  maxNodes?: number;
  /** Target edge count ≈ density × nodeCount. Default 1.8. */
  density?: number;
  allowSelfLoops?: boolean;
  /** Integer weights 1–10 on every edge. */
  weighted?: boolean;
  /**
   * Simple graph: no parallel edges (deduped by source/target pair;
   * for undirected mode the pair is unordered). Default true — oracle
   * tests need this to avoid graphology multigraph semantics.
   */
  simple?: boolean;
  /** Guarantee connectivity by threading a random spanning chain first. */
  connected?: boolean;
  /** Give every node two ports (`p1`, `p2`) and ~30% of edges port refs. */
  ports?: boolean;
}

export interface RandomGraphConfig {
  nodes: NodeConfig[];
  edges: EdgeConfig[];
}

/**
 * Generates node/edge configs deterministically from a seed.
 * Returned configs are plain JSON — callers may rebuild variants
 * (e.g. same edges with per-edge mode overrides).
 */
export function makeRandomGraphConfig(
  seed: number,
  opts: RandomGraphOptions,
): RandomGraphConfig {
  const rng = mulberry32(seed);
  const minNodes = opts.minNodes ?? 20;
  const maxNodes = opts.maxNodes ?? 150;
  const n =
    opts.nodeCount ?? minNodes + Math.floor(rng() * (maxNodes - minNodes + 1));
  const simple = opts.simple ?? true;
  const density = opts.density ?? 1.8;
  const allowSelfLoops = opts.allowSelfLoops ?? false;

  const nodes: NodeConfig[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `n${i}`,
      ...(opts.ports ? { ports: [{ name: 'p1' }, { name: 'p2' }] } : {}),
    });
  }

  const edges: EdgeConfig[] = [];
  const seen = new Set<string>();
  let edgeId = 0;

  const pairKey = (s: number, t: number): string =>
    opts.mode === 'undirected'
      ? `${Math.min(s, t)}|${Math.max(s, t)}`
      : `${s}|${t}`;

  const pushEdge = (s: number, t: number): void => {
    const edge: EdgeConfig = {
      id: `e${edgeId++}`,
      sourceId: `n${s}`,
      targetId: `n${t}`,
    };
    if (opts.weighted) edge.weight = 1 + Math.floor(rng() * 10);
    if (opts.ports && rng() < 0.3) {
      edge.sourcePort = rng() < 0.5 ? 'p1' : 'p2';
      edge.targetPort = rng() < 0.5 ? 'p1' : 'p2';
    }
    edges.push(edge);
    seen.add(pairKey(s, t));
  };

  if (opts.connected && n > 1) {
    // Random spanning chain over a seeded shuffle of the nodes.
    const order = [...Array(n).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 1; i < order.length; i++) {
      pushEdge(order[i - 1], order[i]);
    }
  }

  const targetEdges = Math.round(n * density);
  let attempts = 0;
  const maxAttempts = targetEdges * 20;
  while (edges.length < targetEdges && attempts < maxAttempts) {
    attempts++;
    const s = Math.floor(rng() * n);
    const t = Math.floor(rng() * n);
    if (!allowSelfLoops && s === t) continue;
    if (simple && seen.has(pairKey(s, t))) continue;
    pushEdge(s, t);
  }

  return { nodes, edges };
}

export function makeRandomGraph(
  seed: number,
  opts: RandomGraphOptions,
): Graph {
  const { nodes, edges } = makeRandomGraphConfig(seed, opts);
  return createGraph({ id: `random-${seed}`, mode: opts.mode, nodes, edges });
}

/**
 * Richer variant for self-property tests: self-loops and parallel
 * edges allowed.
 */
export function makeRichRandomGraph(
  seed: number,
  opts: Omit<RandomGraphOptions, 'simple' | 'allowSelfLoops'> & {
    mode: GraphMode;
  },
): Graph {
  const { nodes, edges } = makeRandomGraphConfig(seed, {
    ...opts,
    mode: opts.mode === 'undirected' ? 'undirected' : 'directed',
    simple: false,
    allowSelfLoops: true,
  });
  return createGraph({ id: `rich-${seed}`, mode: opts.mode, nodes, edges });
}
