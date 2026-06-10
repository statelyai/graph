import { bench, describe } from 'vitest';
import {
  createVisualGraph,
  createGraph,
  getNode,
  getSuccessors,
  getBetweennessCentrality,
  getAllPairsShortestPaths,
  getConnectedComponents,
  getEdgesByPort,
  getLCA,
  getPageRank,
  getShortestPaths,
  getTopologicalSort,
  isIsomorphic,
} from '../src';

function createSparseDag(nodeCount: number) {
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

function createDenseDirectedGraph(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
  }));
  const edges = [];

  for (let source = 0; source < nodeCount; source++) {
    for (let offset = 1; offset <= 8; offset++) {
      const target = source + offset;
      if (target >= nodeCount) continue;
      edges.push({
        id: `e${source}_${target}`,
        sourceId: `n${source}`,
        targetId: `n${target}`,
        weight: offset,
      });
    }
  }

  return createGraph({ nodes, edges });
}

function createCompoundGraph(parentCount: number, childrenPerParent: number) {
  const nodes = [];
  const edges = [];

  for (let parent = 0; parent < parentCount; parent++) {
    const parentId = `p${parent}`;
    nodes.push({ id: parentId, initialNodeId: `${parentId}_c0` });

    for (let child = 0; child < childrenPerParent; child++) {
      const childId = `${parentId}_c${child}`;
      nodes.push({ id: childId, parentId });
      if (child > 0) {
        edges.push({
          id: `${parentId}_e${child}`,
          sourceId: `${parentId}_c${child - 1}`,
          targetId: childId,
        });
      }
    }

    if (parent > 0) {
      edges.push({
        id: `between${parent}`,
        sourceId: `p${parent - 1}`,
        targetId: parentId,
      });
    }
  }

  return createGraph({ nodes, edges });
}

function createMultiEdgeGraph(nodeCount: number, edgesPerPair: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
  }));
  const edges = [];

  for (let index = 0; index < nodeCount - 1; index++) {
    for (let edge = 0; edge < edgesPerPair; edge++) {
      edges.push({
        id: `e${index}_${edge}`,
        sourceId: `n${index}`,
        targetId: `n${index + 1}`,
        weight: edge + 1,
      });
    }
  }

  return createGraph({ nodes, edges });
}

function createPortHeavyGraph(nodeCount: number, portsPerNode: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    x: index * 12,
    y: index * 8,
    width: 100,
    height: 50,
    ports: Array.from({ length: portsPerNode }, (_, port) => ({
      name: `p${port}`,
      direction: port % 2 === 0 ? 'out' as const : 'in' as const,
      x: port * 4,
      y: port * 2,
      width: 8,
      height: 8,
    })),
  }));
  const edges = [];

  for (let index = 0; index < nodeCount - 1; index++) {
    const port = index % portsPerNode;
    edges.push({
      id: `e${index}`,
      sourceId: `n${index}`,
      targetId: `n${index + 1}`,
      sourcePort: `p${port}`,
      targetPort: `p${(port + 1) % portsPerNode}`,
    });
  }

  return createVisualGraph({ nodes, edges });
}

const sparseDag = createSparseDag(180);
const denseDirected = createDenseDirectedGraph(60);
const allPairsDag = createSparseDag(60);
const compoundGraph = createCompoundGraph(24, 6);
const multiEdgeGraph = createMultiEdgeGraph(20, 3);
const portHeavyGraph = createPortHeavyGraph(90, 6);
const largeGraph = createGraph({
  nodes: Array.from({ length: 10_000 }, (_, i) => ({ id: `n${i}` })),
  edges: Array.from({ length: 20_000 }, (_, i) => ({
    id: `e${i}`,
    sourceId: `n${i % 10_000}`,
    targetId: `n${(i * 7 + 1) % 10_000}`,
  })),
});
const BENCH_OPTIONS = {
  time: 100,
  warmupTime: 20,
};

// Guards the O(1)-per-read index contract: a return to per-read content
// scans makes these ~1,000× slower (see tests/perf-regression.test.ts).
describe('index read path', () => {
  bench('getNode(warm 10k-node graph)', () => {
    getNode(largeGraph, 'n5000');
  }, BENCH_OPTIONS);

  bench('getSuccessors sweep(10k nodes, 20k edges)', () => {
    for (const node of largeGraph.nodes) getSuccessors(largeGraph, node.id);
  }, BENCH_OPTIONS);
});

describe('graph algorithms', () => {
  bench('getConnectedComponents(sparse DAG, 180 nodes)', () => {
    getConnectedComponents(sparseDag);
  }, BENCH_OPTIONS);

  bench('getTopologicalSort(sparse DAG, 180 nodes)', () => {
    getTopologicalSort(sparseDag);
  }, BENCH_OPTIONS);

  bench('getShortestPaths(sparse DAG, 180 nodes)', () => {
    getShortestPaths(sparseDag, { from: 'n0' });
  }, BENCH_OPTIONS);

  bench('getAllPairsShortestPaths(sparse DAG, 60 nodes)', () => {
    getAllPairsShortestPaths(allPairsDag);
  }, BENCH_OPTIONS);

  bench('getPageRank(dense directed, 60 nodes)', () => {
    getPageRank(denseDirected);
  }, BENCH_OPTIONS);

  bench('getBetweennessCentrality(multi-edge, 20 nodes)', () => {
    getBetweennessCentrality(multiEdgeGraph);
  }, BENCH_OPTIONS);

  bench('isIsomorphic(multi-edge, 20 nodes)', () => {
    isIsomorphic(multiEdgeGraph, multiEdgeGraph);
  }, BENCH_OPTIONS);

  bench('getLCA(compound graph, 168 nodes)', () => {
    getLCA(compoundGraph, 'p12_c3', 'p12_c7');
  }, BENCH_OPTIONS);

  bench('getEdgesByPort(port-heavy visual graph, 90 nodes)', () => {
    getEdgesByPort(portHeavyGraph, 'n80', 'p2');
  }, BENCH_OPTIONS);
});
