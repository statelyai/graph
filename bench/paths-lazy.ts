/**
 * Standalone before/after bench for the paths.ts perf backlog:
 *   1. lazy path materialization (all-targets gen/getShortestPaths)
 *   2. typed-array heap for the Dijkstra hot loop
 *
 * Run: pnpm tsx bench/paths-lazy.ts
 *
 * Reports medians over TRIALS runs on a seeded 10k-node random graph.
 */
import { makeRandomGraph } from '../tests/differential/generators';
import {
  genShortestPaths,
  getShortestPath,
  getShortestPaths,
} from '../src/algorithms/paths';
import { getCSR } from '../src/algorithms/csr';

const TRIALS = 15;
const N = 10_000;

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(label: string, fn: () => void): void {
  // warm-up (also warms index/CSR caches)
  for (let i = 0; i < 3; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  console.log(`${label.padEnd(58)} median ${median(samples).toFixed(2)} ms`);
}

const weighted = makeRandomGraph(42, {
  mode: 'directed',
  nodeCount: N,
  density: 3,
  connected: true,
  weighted: true,
});
const unweighted = makeRandomGraph(43, {
  mode: 'directed',
  nodeCount: N,
  density: 3,
  connected: true,
});

// Warm CSR for both graphs so builds don't pollute first samples
getCSR(weighted);
getCSR(unweighted);

let sink = 0;

console.log(`graph: ${N} nodes, ~${weighted.edges.length} edges, seeded\n`);

bench('weighted   genShortestPaths first path only (abandoned)', () => {
  for (const path of genShortestPaths(weighted, { from: 'n0' })) {
    sink += path.steps.length;
    break;
  }
});

bench('weighted   genShortestPaths first 10 paths (abandoned)', () => {
  let count = 0;
  for (const path of genShortestPaths(weighted, { from: 'n0' })) {
    sink += path.steps.length;
    if (++count >= 10) break;
  }
});

bench('weighted   getShortestPaths all targets (full)', () => {
  sink += getShortestPaths(weighted, { from: 'n0' }).length;
});

bench('unweighted genShortestPaths first path only (abandoned)', () => {
  for (const path of genShortestPaths(unweighted, { from: 'n0' })) {
    sink += path.steps.length;
    break;
  }
});

bench('unweighted getShortestPaths all targets (full)', () => {
  sink += getShortestPaths(unweighted, { from: 'n0' }).length;
});

bench('weighted   getShortestPath single pair x20 (bidi heap)', () => {
  for (let i = 0; i < 20; i++) {
    const path = getShortestPath(weighted, {
      from: `n${i}`,
      to: `n${N - 1 - i}`,
    });
    sink += path ? path.steps.length : 0;
  }
});

bench('weighted   getShortestPaths to single target (early exit)', () => {
  sink += getShortestPaths(weighted, { from: 'n0', to: `n${N - 1}` }).length;
});

console.log(`\n(sink=${sink})`);
