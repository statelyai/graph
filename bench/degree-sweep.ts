// Quick before/after check for the degree-sweep benchmark cell.
// Run: pnpm tsx bench/degree-sweep.ts
import { createGraph } from '../src';
import { getDegree } from '../src/queries';
import GraphologyGraph from 'graphology';
import ngraphCreate from 'ngraph.graph';

const N = 100_000;
const M = 300_000;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);
const edges = Array.from({ length: M }, (_, i) => ({
  id: `e${i}`,
  sourceId: `n${Math.floor(rng() * N)}`,
  targetId: `n${Math.floor(rng() * N)}`,
}));

const ours = createGraph({
  nodes: Array.from({ length: N }, (_, i) => ({ id: `n${i}` })),
  edges,
});

const gly = new GraphologyGraph({ multi: true, type: 'directed' });
for (let i = 0; i < N; i++) gly.addNode(`n${i}`);
for (const e of edges) gly.addEdgeWithKey(e.id, e.sourceId, e.targetId);

const ng = ngraphCreate();
for (let i = 0; i < N; i++) ng.addNode(`n${i}`);
for (const e of edges) ng.addLink(e.sourceId, e.targetId);

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(label: string, fn: () => number): void {
  const samples: number[] = [];
  let total = 0;
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    total = fn();
    samples.push(performance.now() - start);
  }
  console.log(`${label}: ${median(samples).toFixed(2)} ms (sum=${total})`);
}

bench('ours      ', () => {
  let total = 0;
  for (const node of ours.nodes) total += getDegree(ours, node.id);
  return total;
});
bench('graphology', () => {
  let total = 0;
  gly.forEachNode((node) => void (total += gly.degree(node)));
  return total;
});
bench('ngraph    ', () => {
  let total = 0;
  ng.forEachNode((node) => {
    total += ng.getLinks(node.id)?.size ?? 0;
    return false;
  });
  return total;
});
