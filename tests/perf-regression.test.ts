import { describe, it, expect } from 'vitest';
import { createGraph, getNode, getSuccessors } from '../src';
import { getBetweennessCentrality } from '../src/algorithms';

/**
 * Guards the O(1)-per-read index contract (see src/indexing.ts).
 *
 * Before the contract change, every read re-verified an O(nodes+edges)
 * signature: a warm `getNode` cost ~1,700 µs and this sweep took ~17 s on a
 * dev machine. Thresholds are ~100× above current cost (sweep ~14 ms,
 * getNode ~0.3 µs) so slow CI never flakes, while a return to per-read
 * linear scans (≥1,000× slower) always fails.
 */
describe('index read-path performance', () => {
  const N = 10_000;
  const makeGraph = () =>
    createGraph({
      nodes: Array.from({ length: N }, (_, i) => ({ id: `n${i}` })),
      edges: Array.from({ length: 2 * N }, (_, i) => ({
        id: `e${i}`,
        sourceId: `n${i % N}`,
        targetId: `n${(i * 7 + 1) % N}`,
      })),
    });

  it('getSuccessors sweep over 10k nodes stays sub-quadratic', () => {
    const g = makeGraph();
    getSuccessors(g, 'n0'); // warm the index

    const start = performance.now();
    for (const node of g.nodes) getSuccessors(g, node.id);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2_000);
  });

  it('betweenness centrality runs on the CSR snapshot, not Map-based adjacency', () => {
    // Pre-CSR cost on this shape was ~4,600 ms; CSR cost is ~170 ms.
    // 2,000 ms keeps slow CI safe while failing on a return to Map loops.
    const g = createGraph({
      nodes: Array.from({ length: 2_000 }, (_, i) => ({ id: `n${i}` })),
      edges: Array.from({ length: 6_000 }, (_, i) => ({
        id: `e${i}`,
        sourceId: `n${(i * 13) % 2_000}`,
        targetId: `n${(i * 7 + 1) % 2_000}`,
      })),
    });
    getBetweennessCentrality(g); // warm

    const start = performance.now();
    getBetweennessCentrality(g);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2_000);
  });

  it('warm getNode lookups are O(1)', () => {
    const g = makeGraph();
    getNode(g, 'n0'); // warm the index

    const LOOKUPS = 2_000;
    const start = performance.now();
    for (let i = 0; i < LOOKUPS; i++) getNode(g, `n${i % N}`);
    const elapsed = performance.now() - start;

    // 2,000 lookups in 500 ms = 250 µs/lookup budget; the old linear scan
    // cost ~1,700 µs/lookup and fails this by ~7×.
    expect(elapsed).toBeLessThan(500);
  });
});
