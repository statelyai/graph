import { describe, it, expect } from 'vitest';
import {
  createGraph,
  genRandomWalk,
  genWeightedRandomWalk,
  genQuickRandomWalk,
  genPredefinedWalk,
  takeSteps,
  takeUntilNode,
  takeUntilEdge,
  takeUntilNodeCoverage,
  takeUntilEdgeCoverage,
  getCoverage,
} from '../src';

// Simple directed cycle: a -> b -> c -> a
const cycleGraph = () =>
  createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'ca', sourceId: 'c', targetId: 'a' },
    ],
    initialNodeId: 'a',
  });

// Diamond: a -> b, a -> c, b -> d, c -> d
const diamondGraph = () =>
  createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'bd', sourceId: 'b', targetId: 'd' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
    ],
    initialNodeId: 'a',
  });

// Linear: a -> b -> c (sink at c)
const linearGraph = () =>
  createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
    ],
    initialNodeId: 'a',
  });

describe('genRandomWalk', () => {
  it('walks until sink node', () => {
    const steps = [...genRandomWalk(linearGraph(), { seed: 42 })];
    expect(steps).toHaveLength(2);
    expect(steps[0].edge.id).toBe('ab');
    expect(steps[1].edge.id).toBe('bc');
  });

  it('walks indefinitely on cycle (use takeSteps)', () => {
    const steps = [...takeSteps(genRandomWalk(cycleGraph(), { seed: 1 }), 9)];
    expect(steps).toHaveLength(9);
    // Should cycle: ab, bc, ca, ab, bc, ca, ...
    expect(steps[0].edge.id).toBe('ab');
    expect(steps[1].edge.id).toBe('bc');
    expect(steps[2].edge.id).toBe('ca');
    expect(steps[3].edge.id).toBe('ab');
  });

  it('is deterministic with same seed', () => {
    const graph = diamondGraph();
    const walk1 = [...takeSteps(genRandomWalk(graph, { seed: 99 }), 5)];
    const walk2 = [...takeSteps(genRandomWalk(graph, { seed: 99 }), 5)];
    expect(walk1.map((s) => s.edge.id)).toEqual(walk2.map((s) => s.edge.id));
  });

  it('respects filter (guard)', () => {
    const graph = diamondGraph();
    // Block the 'ac' edge — must go a->b->d
    const steps = [
      ...genRandomWalk(graph, {
        seed: 42,
        filter: (edge) => edge.id !== 'ac',
      }),
    ];
    expect(steps.map((s) => s.edge.id)).toEqual(['ab', 'bd']);
  });

  it('calls onStep callback', () => {
    const log: string[] = [];
    const steps = [
      ...genRandomWalk(linearGraph(), {
        seed: 1,
        onStep: (step) => log.push(step.edge.id),
      }),
    ];
    expect(log).toEqual(['ab', 'bc']);
    expect(steps).toHaveLength(2);
  });

  it('starts from specified node', () => {
    const steps = [...genRandomWalk(linearGraph(), { from: 'b', seed: 1 })];
    expect(steps).toHaveLength(1);
    expect(steps[0].edge.id).toBe('bc');
  });
});

describe('genWeightedRandomWalk', () => {
  it('prefers higher-weight edges', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 100 },
        { id: 'ac', sourceId: 'a', targetId: 'c', weight: 1 },
      ],
      initialNodeId: 'a',
    });

    // Over many trials with seed, should overwhelmingly pick 'ab'
    let abCount = 0;
    for (let seed = 0; seed < 100; seed++) {
      const steps = [...takeSteps(genWeightedRandomWalk(graph, { seed }), 1)];
      if (steps[0].edge.id === 'ab') abCount++;
    }
    expect(abCount).toBeGreaterThan(80);
  });
});

describe('genQuickRandomWalk', () => {
  it('covers all edges in strongly connected graph', () => {
    // Diamond with back-edge d->a so all edges are reachable
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'ac', sourceId: 'a', targetId: 'c' },
        { id: 'bd', sourceId: 'b', targetId: 'd' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
        { id: 'da', sourceId: 'd', targetId: 'a' },
      ],
      initialNodeId: 'a',
    });
    const steps = [...genQuickRandomWalk(graph, { seed: 42 })];
    const coveredEdges = new Set(steps.map((s) => s.edge.id));
    expect(coveredEdges).toEqual(new Set(['ab', 'ac', 'bd', 'cd', 'da']));
  });

  it('covers all edges in cycle graph', () => {
    const graph = cycleGraph();
    const steps = [...genQuickRandomWalk(graph, { seed: 1 })];
    const coveredEdges = new Set(steps.map((s) => s.edge.id));
    expect(coveredEdges).toEqual(new Set(['ab', 'bc', 'ca']));
  });

  it('covers reachable edges in DAG (stops at sink)', () => {
    const graph = linearGraph();
    const steps = [...genQuickRandomWalk(graph, { seed: 1 })];
    const coveredEdges = new Set(steps.map((s) => s.edge.id));
    expect(coveredEdges).toEqual(new Set(['ab', 'bc']));
  });
});

describe('genPredefinedWalk', () => {
  it('walks specified edge sequence', () => {
    const steps = [...genPredefinedWalk(linearGraph(), ['ab', 'bc'])];
    expect(steps).toHaveLength(2);
    expect(steps[0].node.id).toBe('b');
    expect(steps[1].node.id).toBe('c');
  });

  it('throws on invalid edge', () => {
    expect(() => [...genPredefinedWalk(linearGraph(), ['xx'])]).toThrow(
      'Edge "xx" not found',
    );
  });

  it('throws on disconnected edge', () => {
    expect(() => [...genPredefinedWalk(linearGraph(), ['bc'])]).toThrow(
      'current position is "a"',
    );
  });
});

describe('takeSteps', () => {
  it('limits walk length', () => {
    const steps = [...takeSteps(genRandomWalk(cycleGraph(), { seed: 1 }), 3)];
    expect(steps).toHaveLength(3);
  });

  it('returns fewer if walk ends early', () => {
    const steps = [...takeSteps(genRandomWalk(linearGraph(), { seed: 1 }), 10)];
    expect(steps).toHaveLength(2);
  });
});

describe('takeUntilNode', () => {
  it('stops at target node', () => {
    const steps = [
      ...takeUntilNode(genRandomWalk(linearGraph(), { seed: 1 }), 'b'),
    ];
    expect(steps).toHaveLength(1);
    expect(steps[0].node.id).toBe('b');
  });
});

describe('takeUntilEdge', () => {
  it('stops after target edge', () => {
    const steps = [
      ...takeUntilEdge(genRandomWalk(cycleGraph(), { seed: 1 }), 'ca'),
    ];
    expect(steps).toHaveLength(3);
    expect(steps[2].edge.id).toBe('ca');
  });
});

describe('takeUntilNodeCoverage', () => {
  it('stops when all nodes visited', () => {
    const graph = cycleGraph();
    const steps = [
      ...takeUntilNodeCoverage(genRandomWalk(graph, { seed: 1 }), graph, 1.0),
    ];
    const visited = new Set(steps.map((s) => s.node.id));
    visited.add('a'); // start node
    expect(visited.size).toBe(3);
  });
});

describe('takeUntilEdgeCoverage', () => {
  it('stops when all edges visited', () => {
    const graph = cycleGraph();
    const steps = [
      ...takeUntilEdgeCoverage(genRandomWalk(graph, { seed: 1 }), graph, 1.0),
    ];
    const visited = new Set(steps.map((s) => s.edge.id));
    expect(visited.size).toBe(3);
  });
});

describe('getCoverage', () => {
  it('computes correct coverage stats', () => {
    const graph = diamondGraph();
    const steps = [...genRandomWalk(graph, { seed: 42 })];
    const stats = getCoverage(graph, steps);

    expect(stats.totalSteps).toBe(steps.length);
    expect(stats.nodeCoverage).toBeGreaterThan(0);
    expect(stats.nodeCoverage).toBeLessThanOrEqual(1);
    expect(stats.edgeCoverage).toBeGreaterThan(0);
    expect(stats.edgeCoverage).toBeLessThanOrEqual(1);
    expect(stats.visitedNodes).toContain('a'); // start node
  });

  it('reports 100% coverage on linear walk', () => {
    const graph = linearGraph();
    const steps = [...genRandomWalk(graph, { seed: 1 })];
    const stats = getCoverage(graph, steps);

    expect(stats.nodeCoverage).toBe(1);
    expect(stats.edgeCoverage).toBe(1);
    expect(stats.visitedNodes).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(stats.visitedEdges).toEqual(expect.arrayContaining(['ab', 'bc']));
  });
});

describe('quick walk multi-hop detours', () => {
  it('reconstructs multi-hop detour paths to reach far unvisited edges', () => {
    // Undirected path a—b—c—d—e plus a branch a—f. Wherever the walk ends up,
    // reaching the remaining branch requires a multi-hop BFS detour.
    const g = createGraph({
      mode: 'undirected',
      initialNodeId: 'a',
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'bc', sourceId: 'b', targetId: 'c' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
        { id: 'de', sourceId: 'd', targetId: 'e' },
        { id: 'af', sourceId: 'a', targetId: 'f' },
      ],
    });
    const steps = [...genQuickRandomWalk(g, { seed: 7 })];
    const coverage = getCoverage(g, steps, { from: 'a' });
    expect(coverage.edgeCoverage).toBe(1);
    // Every step must be traversable from the previous position
    let position = 'a';
    for (const step of steps) {
      expect([step.edge.sourceId, step.edge.targetId]).toContain(position);
      position = step.node.id;
    }
  });

  it('weighted walk ends when all traversable edges have zero weight', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 0 }],
    });
    const steps = [...genWeightedRandomWalk(g, { seed: 1 })];
    expect(steps).toHaveLength(0);
  });

  it('takeUntilEdgeCoverage yields nothing for a zero target', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    const steps = [
      ...takeUntilEdgeCoverage(genRandomWalk(g, { seed: 1 }), g, 0),
    ];
    expect(steps).toHaveLength(0);
  });
});
