import { bench, describe } from 'vitest';
import {
  createGraph,
  getAllPairsShortestPaths,
  getConnectedComponents,
  getShortestPaths,
} from '../src';

function createBenchmarkGraph(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
  }));
  const edges = [];

  for (let index = 0; index < nodeCount - 1; index++) {
    edges.push({
      id: `e${index}`,
      sourceId: `n${index}`,
      targetId: `n${index + 1}`,
      weight: (index % 7) + 1,
    });
  }

  for (let index = 0; index < nodeCount - 4; index += 4) {
    edges.push({
      id: `skip${index}`,
      sourceId: `n${index}`,
      targetId: `n${index + 4}`,
      weight: 2,
    });
  }

  return createGraph({ nodes, edges });
}

const mediumGraph = createBenchmarkGraph(250);
const denseishGraph = createBenchmarkGraph(120);

describe('graph algorithms', () => {
  bench('getConnectedComponents(250 nodes)', () => {
    getConnectedComponents(mediumGraph);
  });

  bench('getShortestPaths(250 nodes)', () => {
    getShortestPaths(mediumGraph, { from: 'n0' });
  });

  bench('getAllPairsShortestPaths(120 nodes)', () => {
    getAllPairsShortestPaths(denseishGraph);
  });
});
