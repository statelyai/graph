import { describe, expect, it } from 'vitest';
import { createGridGraph } from '../src/generators';
import { createGraph } from '../src/graph';
import {
  genAllPairsShortestPaths,
  getAllPairsShortestPaths,
} from '../src/algorithms/paths';

describe('all-pairs shortest paths on larger graphs', () => {
  it('genAllPairsShortestPaths supports early exit on tie-heavy graphs', () => {
    // A 12x12 grid has combinatorially many tied shortest paths per pair —
    // materializing all of them is infeasible, but lazy consumption is not.
    const graph = createGridGraph(12, 12);
    const paths = [];
    for (const path of genAllPairsShortestPaths(graph)) {
      paths.push(path);
      if (paths.length >= 1000) break;
    }
    expect(paths).toHaveLength(1000);
  });

  it('getAllPairsShortestPaths handles hundreds of nodes without stack overflow', () => {
    // Path graph: exactly one shortest path per ordered reachable pair.
    const n = 300;
    const graph = createGraph({
      nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
      edges: Array.from({ length: n - 1 }, (_, i) => ({
        id: `e${i}`,
        sourceId: `n${i}`,
        targetId: `n${i + 1}`,
      })),
      mode: 'directed',
    });
    const paths = getAllPairsShortestPaths(graph);
    expect(paths).toHaveLength((n * (n - 1)) / 2);
  });
});
