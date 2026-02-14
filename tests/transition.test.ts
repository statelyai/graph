import { describe, it, expect } from 'vitest';
import { createGraphFromTransition } from '../src/graph';
import {
  getShortestPaths,
  getSimplePaths,
  getCycles,
  hasPath,
} from '../src/algorithms';
import { getOutEdges } from '../src/queries';

describe('createGraphFromTransition', () => {
  describe('traffic light (simple cycle)', () => {
    const transition = (state: string, event: { type: string }) => {
      if (state === 'green' && event.type === 'TIMER') return 'yellow';
      if (state === 'yellow' && event.type === 'TIMER') return 'red';
      if (state === 'red' && event.type === 'TIMER') return 'green';
      return state;
    };
    const graph = createGraphFromTransition(transition, {
      initialState: 'green',
      events: [{ type: 'TIMER' }],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('discovers 3 nodes and 3 edges', () => {
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(3);
    });

    it('sets initialNodeId', () => {
      expect(graph.initialNodeId).toBe('green');
    });

    it('stores original state in node.data', () => {
      const nodeData = graph.nodes.map((n) => n.data).sort();
      expect(nodeData).toEqual(['green', 'red', 'yellow']);
    });

    it('stores original event in edge.data', () => {
      expect(graph.edges.every((e) => e.data.type === 'TIMER')).toBe(true);
    });

    it('finds shortest path green → red (2 steps)', () => {
      const paths = getShortestPaths(graph, { from: 'green', to: 'red' });
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(2);
      expect(paths[0].steps.map((s) => s.node.id)).toEqual(['yellow', 'red']);
    });

    it('detects the cycle', () => {
      const cycles = getCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('numeric transition (fromTransition pattern)', () => {
    const transition = (s: number, e: { type: string }) => {
      if (e.type === 'a') return 1;
      if (e.type === 'b' && s === 1) return 2;
      if (e.type === 'reset') return 0;
      return s;
    };
    const graph = createGraphFromTransition(transition, {
      initialState: 0,
      events: [{ type: 'a' }, { type: 'b' }, { type: 'reset' }],
    });

    it('discovers states 0, 1, 2', () => {
      expect(graph.nodes).toHaveLength(3);
      const ids = graph.nodes.map((n) => n.data).sort();
      expect(ids).toEqual([0, 1, 2]);
    });

    it('has correct edges from state 0', () => {
      const id0 = JSON.stringify(0);
      const edges = getOutEdges(graph, id0);
      // a→1, b stays 0 (self-loop), reset stays 0 (self-loop dedup'd with b)
      // Actually: a→1 (new), b→0 (self-loop), reset→0 (same self-loop, dedup'd)
      const targets = edges.map((e) => e.targetId).sort();
      expect(targets).toContain(JSON.stringify(0)); // self-loop
      expect(targets).toContain(JSON.stringify(1)); // a→1
    });

    it('state 1 can reach state 2 via b', () => {
      expect(hasPath(graph, JSON.stringify(1), JSON.stringify(2))).toBe(true);
    });

    it('state 2 can reach state 0 via reset', () => {
      expect(hasPath(graph, JSON.stringify(2), JSON.stringify(0))).toBe(true);
    });
  });

  describe('counter with stopWhen', () => {
    const transition = (
      ctx: { count: number },
      event: { type: string },
    ) => {
      if (event.type === 'INC') return { count: ctx.count + 1 };
      return ctx;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: { count: 0 },
      events: [{ type: 'INC' }],
      stopWhen: (s) => s.count === 5,
    });

    it('creates 6 nodes (count 0 through 5)', () => {
      expect(graph.nodes).toHaveLength(6);
    });

    it('creates 5 edges (0→1, 1→2, ..., 4→5)', () => {
      expect(graph.edges).toHaveLength(5);
    });

    it('node data has correct counts', () => {
      const counts = graph.nodes.map((n) => n.data.count).sort((a, b) => a - b);
      expect(counts).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe('river crossing (automated)', () => {
    type Bank = string[];
    type RiverState = { left: Bank; right: Bank };
    type RiverEvent = { type: 'cross'; cargo: string | null };

    const ENTITIES = ['farmer', 'fox', 'chicken', 'cabbage'] as const;

    function isSafe(bank: string[]): boolean {
      if (bank.includes('farmer')) return true;
      if (bank.includes('fox') && bank.includes('chicken')) return false;
      if (bank.includes('chicken') && bank.includes('cabbage')) return false;
      return true;
    }

    const transition = (
      state: RiverState,
      event: RiverEvent,
    ): RiverState => {
      const farmerOnLeft = state.left.includes('farmer');
      const fromBank = farmerOnLeft ? state.left : state.right;
      const toBank = farmerOnLeft ? state.right : state.left;
      const { cargo } = event;

      if (cargo && !fromBank.includes(cargo)) return state;

      const newFrom = fromBank.filter((e) => e !== 'farmer' && e !== cargo);
      const newTo = [...toBank, 'farmer', ...(cargo ? [cargo] : [])];

      const newLeft = farmerOnLeft ? newFrom : newTo;
      const newRight = farmerOnLeft ? newTo : newFrom;

      if (!isSafe(newLeft) || !isSafe(newRight)) return state;

      return {
        left: [...newLeft].sort(),
        right: [...newRight].sort(),
      };
    };

    const graph = createGraphFromTransition(transition, {
      initialState: {
        left: [...ENTITIES].sort() as unknown as Bank,
        right: [] as Bank,
      },
      events: (state) => {
        const farmerOnLeft = state.left.includes('farmer');
        const fromBank = farmerOnLeft ? state.left : state.right;
        const cargo: (string | null)[] = [
          null,
          ...fromBank.filter((e) => e !== 'farmer'),
        ];
        return cargo.map((c) => ({ type: 'cross' as const, cargo: c }));
      },
      serializeState: (s) => [...s.left].sort().join(',') || 'empty',
      serializeEvent: (e) => e.cargo ?? 'alone',
    });

    it('discovers 10 valid states', () => {
      expect(graph.nodes).toHaveLength(10);
    });

    it('finds shortest solution in 7 moves', () => {
      const goalId = 'empty';
      const startId = 'cabbage,chicken,farmer,fox';
      const paths = getShortestPaths(graph, { from: startId, to: goalId });
      expect(paths).toHaveLength(2); // two classic solutions
      expect(paths[0].steps).toHaveLength(7);
    });
  });

  describe('dynamic events per state', () => {
    it('supports events as a function of state', () => {
      const transition = (s: string, e: { type: string }) => {
        if (s === 'a' && e.type === 'GO') return 'b';
        if (s === 'b' && e.type === 'BACK') return 'a';
        return s;
      };
      const graph = createGraphFromTransition(transition, {
        initialState: 'a',
        events: (s) => {
          if (s === 'a') return [{ type: 'GO' }];
          if (s === 'b') return [{ type: 'BACK' }];
          return [];
        },
        serializeState: (s) => s,
      });

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('handles single state (all events loop back)', () => {
      const graph = createGraphFromTransition(
        (s: string) => s,
        {
          initialState: 'only',
          events: [{ type: 'A' }, { type: 'B' }],
          serializeState: (s) => s,
        },
      );
      expect(graph.nodes).toHaveLength(1);
      // Two self-loop edges (different events)
      expect(graph.edges).toHaveLength(2);
    });

    it('throws when limit exceeded', () => {
      const transition = (s: number, e: { type: string }) => s + 1;
      expect(() =>
        createGraphFromTransition(transition, {
          initialState: 0,
          events: [{ type: 'INC' }],
          limit: 5,
        }),
      ).toThrow('Traversal limit exceeded');
    });

    it('deduplicates edges with same source, event, and target', () => {
      // Two events that serialize the same and produce the same result
      const graph = createGraphFromTransition(
        (_s: string) => 'b',
        {
          initialState: 'a',
          events: [{ type: 'GO' }, { type: 'GO' }],
          serializeState: (s) => s,
          stopWhen: (s) => s === 'b', // don't explore from b
        },
      );
      // Only one edge a→b despite two identical events
      expect(graph.edges).toHaveLength(1);
    });

    it('allows self-loops', () => {
      const graph = createGraphFromTransition(
        (s: string) => s,
        {
          initialState: 'loop',
          events: [{ type: 'STAY' }],
          serializeState: (s) => s,
        },
      );
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('loop');
      expect(graph.edges[0].targetId).toBe('loop');
    });

    it('uses JSON.stringify as default serializer', () => {
      const graph = createGraphFromTransition(
        (s: { val: number }, e: { type: string }) => ({ val: s.val + 1 }),
        {
          initialState: { val: 0 },
          events: [{ type: 'INC' }],
          stopWhen: (s) => s.val === 2,
        },
      );
      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes[0].id).toBe(JSON.stringify({ val: 0 }));
    });
  });

  describe('integration with graph algorithms', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'a' && e.type === 'X') return 'b';
      if (s === 'b' && e.type === 'X') return 'c';
      if (s === 'c' && e.type === 'X') return 'a';
      return s;
    };
    const graph = createGraphFromTransition(transition, {
      initialState: 'a',
      events: [{ type: 'X' }],
      serializeState: (s) => s,
    });

    it('getShortestPaths works from initialNodeId', () => {
      const paths = getShortestPaths(graph);
      // Shortest paths to all reachable nodes (excludes source)
      expect(paths.length).toBe(2); // b and c
    });

    it('getSimplePaths works', () => {
      const paths = getSimplePaths(graph, { from: 'a', to: 'c' });
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].steps.at(-1)?.node.id).toBe('c');
    });

    it('getCycles detects the cycle', () => {
      const cycles = getCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('hasPath checks reachability', () => {
      expect(hasPath(graph, 'a', 'c')).toBe(true);
      expect(hasPath(graph, 'c', 'a')).toBe(true);
    });
  });
});
