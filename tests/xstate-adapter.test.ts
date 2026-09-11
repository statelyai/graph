import { describe, it, expect } from 'vitest';
import { assign, createMachine, setup } from 'xstate';
import {
  getShortestPaths as getCoreShortestPaths,
  getSimplePaths as getCoreSimplePaths,
} from 'xstate/graph';
import { createGraphFromMachine } from '../src/xstate';
import { getShortestPaths, getSimplePaths } from '../src/algorithms';
import { getOutEdges } from '../src/queries';
import { getCoverageTargets } from '../src/coverage';

const trafficLight = createMachine({
  id: 'light',
  initial: 'green',
  states: {
    green: { on: { TIMER: 'yellow' } },
    yellow: { on: { TIMER: 'red' } },
    red: { on: { TIMER: 'green' } },
  },
});

describe('createGraphFromMachine', () => {
  describe('simple machine', () => {
    const graph = createGraphFromMachine(trafficLight);

    it('has one node per state and one edge per transition', () => {
      expect(graph.nodes.length).toBe(3);
      expect(graph.edges.length).toBe(3);
    });

    it('uses the serialized initial snapshot as initialNodeId', () => {
      expect(graph.initialNodeId).toBe(
        JSON.stringify({ value: 'green', context: undefined }),
      );
    });

    it('uses JSON of { value, context } as node ids', () => {
      expect(graph.nodes.map((node) => node.id).sort()).toEqual(
        ['green', 'red', 'yellow']
          .map((value) => JSON.stringify({ value, context: undefined }))
          .sort(),
      );
    });

    it('records stateIds, statePaths and status on node data', () => {
      const green = graph.nodes.find(
        (node) => node.id === graph.initialNodeId,
      )!;
      expect(green.data.stateIds).toEqual(['light', 'light.green']);
      expect(green.data.statePaths).toEqual(['green']);
      expect(green.data.status).toBe('active');
      expect(green.data.value).toBe('green');
      expect(green.data.context).toBeUndefined();
      expect(green.data.tags).toEqual([]);
      expect(green.label).toBe('green');
    });

    it('labels edges with the event type and mirrors the source id', () => {
      for (const edge of graph.edges) {
        expect(edge.label).toBe('TIMER');
        expect(edge.data.eventType).toBe('TIMER');
        expect(edge.data.event).toEqual({ type: 'TIMER' });
        expect(edge.data.sourceNodeId).toBe(edge.sourceId);
      }
    });

    it('uses sourceId|event|targetId as the edge id', () => {
      for (const edge of graph.edges) {
        expect(edge.id).toBe(
          `${edge.sourceId}|${JSON.stringify(edge.data.event)}|${edge.targetId}`,
        );
      }
    });
  });

  describe('hierarchical + parallel machine', () => {
    const machine = createMachine({
      id: 'par',
      type: 'parallel',
      states: {
        a: { initial: 'b', states: { b: { on: { NEXT_A: 'b2' } }, b2: {} } },
        c: { initial: 'd', states: { d: { on: { NEXT_C: 'd2' } }, d2: {} } },
      },
    });
    const graph = createGraphFromMachine(machine);

    it('renders dotted state paths for every active atomic region', () => {
      const initial = graph.nodes.find(
        (node) => node.id === graph.initialNodeId,
      )!;
      expect(initial.data.statePaths).toEqual(['a.b', 'c.d']);
    });

    it('joins state paths with ", " for the node label', () => {
      const initial = graph.nodes.find(
        (node) => node.id === graph.initialNodeId,
      )!;
      expect(initial.label).toBe('a.b, c.d');
    });

    it('explores the full product of both regions', () => {
      expect(graph.nodes.length).toBe(4);
    });
  });

  describe('guards and actions', () => {
    const machine = setup({
      types: {} as { events: { type: 'GO' } | { type: 'PARAM' } },
      guards: {
        isReady: () => true,
        gt: () => true,
      },
      actions: {
        notify: () => {},
      },
    }).createMachine({
      id: 'guarded',
      initial: 'idle',
      states: {
        idle: {
          on: {
            GO: {
              target: 'active',
              guard: 'isReady',
              actions: 'notify',
            },
            PARAM: {
              target: 'active',
              guard: { type: 'gt', params: { n: 1 } },
            },
          },
        },
        active: {},
      },
    });

    it('attaches hypothesized guard text and actions to the edge', () => {
      const graph = createGraphFromMachine(machine);
      const go = graph.edges.find((edge) => edge.data.eventType === 'GO')!;
      expect(go.data.guard).toEqual({ text: 'isReady', hypothesized: true });
      expect(go.data.actions).toEqual(['notify']);
    });

    it('records the selected transition definitions', () => {
      const graph = createGraphFromMachine(machine);
      const go = graph.edges.find((edge) => edge.data.eventType === 'GO')!;
      expect(go.data.transitions).toHaveLength(1);
      expect(go.data.transitions[0]).toMatchObject({
        source: 'guarded.idle',
        targets: ['guarded.active'],
        reenter: false,
        guard: { text: 'isReady', hypothesized: true },
        actions: ['notify'],
      });
    });

    it('renders parameterized guards as type(params)', () => {
      const graph = createGraphFromMachine(machine);
      const param = graph.edges.find(
        (edge) => edge.data.eventType === 'PARAM',
      )!;
      expect(param.data.guard).toEqual({
        text: 'gt({"n":1})',
        hypothesized: true,
      });
    });

    it('omits guards entirely when includeGuards is false', () => {
      const graph = createGraphFromMachine(machine, { includeGuards: false });
      for (const edge of graph.edges) {
        expect('guard' in edge.data).toBe(false);
        for (const transition of edge.data.transitions) {
          expect('guard' in transition).toBe(false);
        }
      }
    });
  });

  describe('context and payload events', () => {
    const counter = createMachine({
      id: 'counter',
      types: {} as {
        context: { count: number };
        events: { type: 'ADD'; value: number };
      },
      context: { count: 0 },
      initial: 'idle',
      states: {
        idle: {
          on: {
            ADD: {
              guard: ({ context }) => context.count < 4,
              actions: assign({
                count: ({ context, event }) => context.count + (event.value ?? 1),
              }),
            },
          },
        },
      },
    });

    it('replaces the bare event with the supplied payload event', () => {
      const graph = createGraphFromMachine(counter, {
        events: [{ type: 'ADD', value: 2 }],
      });
      for (const edge of graph.edges) {
        expect(edge.data.event).toEqual({ type: 'ADD', value: 2 });
      }
      // 0 -> 2 -> 4 -> (guard false, self loop)
      expect(graph.nodes.map((node) => node.data.context)).toEqual([
        { count: 0 },
        { count: 2 },
        { count: 4 },
      ]);
    });

    it('accepts a function form of events', () => {
      const graph = createGraphFromMachine(counter, {
        events: (snapshot) => [
          { type: 'ADD' as const, value: snapshot.context.count === 0 ? 3 : 1 },
        ],
      });
      const first = graph.edges.find(
        (edge) => edge.sourceId === graph.initialNodeId,
      )!;
      expect(first.data.event).toEqual({ type: 'ADD', value: 3 });
    });

    it('honors a custom serializeEvent for edge ids', () => {
      const graph = createGraphFromMachine(counter, {
        events: [{ type: 'ADD', value: 2 }],
        serializeEvent: (event) => event.type,
      });
      for (const edge of graph.edges) {
        expect(edge.id).toBe(`${edge.sourceId}|ADD|${edge.targetId}`);
      }
    });

    it('skips events rejected by filterEvents', () => {
      const graph = createGraphFromMachine(counter, {
        events: [{ type: 'ADD', value: 2 }],
        filterEvents: (_snapshot, event) => event.value !== 2,
      });
      expect(graph.edges).toHaveLength(0);
      expect(graph.nodes).toHaveLength(1);
    });

    it('keeps but does not expand nodes matched by stopWhen', () => {
      const graph = createGraphFromMachine(counter, {
        events: [{ type: 'ADD', value: 2 }],
        stopWhen: (snapshot) => snapshot.context.count >= 2,
      });
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      const stopped = graph.nodes.find(
        (node) => node.id !== graph.initialNodeId,
      )!;
      expect(stopped.data.context).toEqual({ count: 2 });
      expect(getOutEdges(graph, stopped.id)).toEqual([]);
    });

    it('throws when the traversal limit is exceeded', () => {
      expect(() =>
        createGraphFromMachine(counter, {
          events: [{ type: 'ADD', value: 1 }],
          limit: 2,
        }),
      ).toThrow('Traversal limit exceeded');
    });
  });

  describe('final states', () => {
    const machine = createMachine({
      id: 'final',
      initial: 'running',
      states: {
        running: { on: { FINISH: 'done' } },
        done: { type: 'final' },
      },
    });
    const graph = createGraphFromMachine(machine);

    it('marks the final snapshot as done', () => {
      const final = graph.nodes.find(
        (node) => node.id !== graph.initialNodeId,
      )!;
      expect(final.data.status).toBe('done');
    });

    it('has no outgoing edges from the final state', () => {
      const final = graph.nodes.find(
        (node) => node.id !== graph.initialNodeId,
      )!;
      expect(getOutEdges(graph, final.id)).toEqual([]);
    });
  });

  describe('stability and coverage targets', () => {
    it('produces deep-equal graphs across calls', () => {
      const a = createGraphFromMachine(trafficLight);
      const b = createGraphFromMachine(trafficLight);
      expect(JSON.parse(JSON.stringify(b))).toEqual(
        JSON.parse(JSON.stringify(a)),
      );
    });

    it('yields deterministic node and edge coverage targets', () => {
      const graph = createGraphFromMachine(trafficLight);
      const nodes = getCoverageTargets(graph, { kind: 'nodes' });
      const edges = getCoverageTargets(graph, { kind: 'edges' });
      expect(nodes).toHaveLength(3);
      expect(edges).toHaveLength(3);
      expect(getCoverageTargets(graph, { kind: 'nodes' })).toEqual(nodes);
      expect(getCoverageTargets(graph, { kind: 'edges' })).toEqual(edges);
      expect(edges.map((target: any) => target.edgeId).sort()).toEqual(
        graph.edges.map((edge) => edge.id).sort(),
      );
    });

    it('yields edge-pair targets whose ids are graph edge ids', () => {
      const graph = createGraphFromMachine(trafficLight);
      const pairs = getCoverageTargets(graph, { kind: 'edge-pairs' });
      expect(pairs.length).toBeGreaterThan(0);
      expect(getCoverageTargets(graph, { kind: 'edge-pairs' })).toEqual(pairs);
      const edgeIds = new Set(graph.edges.map((edge) => edge.id));
      for (const target of pairs as any[]) {
        expect(target.type).toBe('subpath');
        expect(target.edgeIds).toHaveLength(2);
        for (const id of target.edgeIds) expect(edgeIds.has(id)).toBe(true);
      }
    });
  });

  describe('parity with xstate/graph', () => {
    const bookshelf = createMachine({
      id: 'bookshelf',
      types: {} as {
        context: { books: string[] };
        events:
          | { type: 'BROWSE' }
          | { type: 'ADD' }
          | { type: 'CHECKOUT' }
          | { type: 'RESET' };
      },
      context: { books: [] },
      initial: 'idle',
      states: {
        idle: { on: { BROWSE: 'browsing' } },
        browsing: {
          on: {
            ADD: {
              guard: ({ context }) => context.books.length < 2,
              actions: assign({
                books: ({ context }) => [...context.books, 'Dune'],
              }),
            },
            CHECKOUT: {
              guard: ({ context }) => context.books.length > 0,
              target: 'checkout',
            },
            RESET: {
              target: 'idle',
              actions: assign({ books: () => [] }),
            },
          },
        },
        checkout: { on: { RESET: { target: 'done' } } },
        done: { type: 'final' },
      },
    });

    // `xstate/graph` models the initial snapshot as a synthetic
    // `xstate.init` step, and emits a path consisting of only that step.
    // Our graph starts at the initial node instead, so strip the synthetic
    // step and drop the resulting empty sequences from both sides.
    const normalize = (sequences: string[][]): string[] =>
      sequences
        .map((sequence) =>
          sequence[0] === 'xstate.init' ? sequence.slice(1) : sequence,
        )
        .filter((sequence) => sequence.length > 0)
        .map((sequence) => JSON.stringify(sequence))
        .sort();

    const graph = createGraphFromMachine(bookshelf);

    it('matches xstate/graph shortest path event sequences', () => {
      const core = normalize(
        getCoreShortestPaths(bookshelf).map((path) =>
          path.steps.map((step) => step.event.type),
        ),
      );
      const ours = normalize(
        getShortestPaths(graph).map((path) =>
          path.steps.map((step) => step.edge.data.eventType),
        ),
      );
      expect(ours).toEqual(core);
    });

    it('matches xstate/graph simple path event sequences', () => {
      const core = normalize(
        getCoreSimplePaths(bookshelf).map((path) =>
          path.steps.map((step) => step.event.type),
        ),
      );
      const ours = normalize(
        getSimplePaths(graph).map((path) =>
          path.steps.map((step) => step.edge.data.eventType),
        ),
      );
      expect(ours).toEqual(core);
    });
  });

  describe('review regressions', () => {
    it('keeps one actor identity across the traversal', () => {
      const machine = createMachine({
        id: 'ident',
        context: { actorId: '' },
        initial: 'a',
        states: {
          a: {
            on: {
              PING: {
                actions: assign({ actorId: ({ self }) => self.sessionId }),
              },
            },
          },
        },
      });
      const graph = createGraphFromMachine(machine);
      // initial (actorId '') → one PING sets a stable id → further PINGs self-loop
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(2);
    });

    it('does not expand completed snapshots even if ancestors handle events', () => {
      const machine = createMachine({
        id: 'done',
        initial: 'a',
        on: { RESET: '.a' },
        states: {
          a: { on: { FINISH: 'end' } },
          end: { type: 'final' },
        },
      });
      const graph = createGraphFromMachine(machine);
      const done = graph.nodes.find((n) => n.data.status === 'done')!;
      expect(done).toBeDefined();
      expect(getOutEdges(graph, done.id)).toEqual([]);
    });

    it('matches supplied events against wildcard descriptors', () => {
      const machine = createMachine({
        id: 'wild',
        types: {} as { events: { type: 'user.login'; user: string } | { type: 'user.logout' } },
        initial: 'out',
        states: {
          out: {
            on: {
              'user.*': [
                { guard: ({ event }) => event.type === 'user.login' && event.user === 'alice', target: 'in' },
              ],
            },
          },
          in: { on: { 'user.logout': 'out' } },
        },
      });
      const graph = createGraphFromMachine(machine, {
        events: [{ type: 'user.login', user: 'alice' }],
      });
      expect(graph.nodes.map((n) => n.data.value).sort()).toEqual(['in', 'out']);
      const login = graph.edges.find((e) => e.data.eventType === 'user.login')!;
      expect(login.data.event).toEqual({ type: 'user.login', user: 'alice' });
    });

    it('does not count stopped snapshots against limit', () => {
      const graph = createGraphFromMachine(trafficLight, {
        limit: 1,
        stopWhen: (s) => s.value !== 'green',
      });
      expect(graph.nodes).toHaveLength(2);
    });
  });
});
