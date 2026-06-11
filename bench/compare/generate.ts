/**
 * Seeded graph generators for the cross-library benchmark harness.
 * Graphs are emitted as a neutral edge list (integer endpoints, weights) so
 * every library builds from identical input. Simple graphs only (no parallel
 * edges, no self-loops) — the lowest common denominator across libraries.
 */

export interface BenchGraphData {
  /** node count; node i is named `n${i}` in every adapter */
  n: number;
  /** [source, target, weight] triples */
  edges: Array<[number, number, number]>;
  shape: string;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform random directed graph, ~3 edges per node. */
export function makeRandom(n: number, seed = 1): BenchGraphData {
  const rng = mulberry32(seed);
  const target = 3 * n;
  const seen = new Set<number>();
  const edges: Array<[number, number, number]> = [];
  // Spanning chain first so traversal workloads reach most of the graph
  for (let i = 0; i < n - 1; i++) {
    seen.add(i * n + (i + 1));
    edges.push([i, i + 1, 1 + Math.floor(rng() * 9)]);
  }
  while (edges.length < target) {
    const s = Math.floor(rng() * n);
    const t = Math.floor(rng() * n);
    if (s === t) continue;
    const key = s * n + t;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([s, t, 1 + Math.floor(rng() * 9)]);
  }
  return { n, edges, shape: 'random' };
}

/** Scale-free-ish directed graph via preferential attachment (k=3). */
export function makeScaleFree(n: number, seed = 2): BenchGraphData {
  const rng = mulberry32(seed);
  const k = 3;
  const edges: Array<[number, number, number]> = [];
  // endpoint pool: nodes appear once per incident edge → degree-proportional pick
  const pool: number[] = [0];
  for (let v = 1; v < n; v++) {
    const chosen = new Set<number>();
    for (let j = 0; j < Math.min(k, v); j++) {
      let u = pool[Math.floor(rng() * pool.length)];
      let guard = 0;
      while ((chosen.has(u) || u === v) && guard++ < 20) {
        u = Math.floor(rng() * v); // fall back to uniform on collisions
      }
      if (chosen.has(u) || u === v) continue;
      chosen.add(u);
      edges.push([v, u, 1 + Math.floor(rng() * 9)]);
      pool.push(u);
    }
    pool.push(v);
  }
  return { n, edges, shape: 'scaleFree' };
}

/** Square-ish lattice with right/down directed edges. */
export function makeGrid(n: number): BenchGraphData {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const total = rows * cols;
  const edges: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = r * cols + c;
      if (c + 1 < cols) edges.push([v, v + 1, 1]);
      if (r + 1 < rows) edges.push([v, v + cols, 2]);
    }
  }
  return { n: total, edges, shape: 'grid' };
}

/** Layered DAG with local fanout + skip edges — statechart/workflow-like. */
export function makeLayeredDag(n: number, seed = 3): BenchGraphData {
  const rng = mulberry32(seed);
  const layerSize = Math.max(4, Math.round(Math.sqrt(n)));
  const layers = Math.ceil(n / layerSize);
  const total = layers * layerSize;
  const edges: Array<[number, number, number]> = [];
  const seen = new Set<number>();
  for (let layer = 0; layer < layers - 1; layer++) {
    for (let i = 0; i < layerSize; i++) {
      const v = layer * layerSize + i;
      const fanout = 2 + Math.floor(rng() * 3);
      for (let f = 0; f < fanout; f++) {
        // mostly next layer, occasionally a skip edge two layers down
        const skip = rng() < 0.1 && layer + 2 < layers ? 2 : 1;
        const u = (layer + skip) * layerSize + Math.floor(rng() * layerSize);
        const key = v * total + u;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([v, u, 1 + Math.floor(rng() * 9)]);
      }
    }
  }
  return { n: total, edges, shape: 'layeredDag' };
}

export const SHAPES: Record<string, (n: number) => BenchGraphData> = {
  random: (n) => makeRandom(n),
  scaleFree: (n) => makeScaleFree(n),
  grid: (n) => makeGrid(n),
  layeredDag: (n) => makeLayeredDag(n),
};
