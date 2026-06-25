import { describe, it, expect } from 'vitest';
import {
  createMachine,
  createActor,
  fromTransition,
  __unsafe_getAllOwnEventDescriptors,
  assign,
  type AnyMachineSnapshot,
  type EventObject,
} from 'xstate';
import { createGraphFromTransition } from '../src/graph';
import {
  getShortestPaths,
  getSimplePaths,
  getCycles,
  hasPath,
  getJoinedPath,
} from '../src/algorithms';
import { getOutEdges } from '../src/queries';

// Helper: serialize xstate snapshot to string
function serializeSnapshot(snapshot: AnyMachineSnapshot): string {
  const { value, context } = snapshot;
  return JSON.stringify({
    value,
    context:
      context && Object.keys(context).length ? context : undefined,
  });
}

// Helper: create a mock actor scope for xstate machines
function createMockActorScope() {
  // Minimal scope that satisfies machine.transition()
  const actor = createActor(createMachine({}));
  return {
    self: actor,
    logger: console.log,
    id: '',
    sessionId: 'test',
    defer: () => {},
    system: actor.system,
    stopChild: () => {},
    emit: () => {},
    actionExecutor: () => {},
  };
}

describe('xstate integration', () => {
  describe('Mario adjacency (from xstate adjacency.test.ts)', () => {
    const machine = createMachine({
      initial: 'standing',
      states: {
        standing: {
          on: {
            left: 'walking',
            right: 'walking',
            down: 'crouching',
            up: 'jumping',
          },
        },
        walking: {
          on: {
            up: 'jumping',
            stop: 'standing',
          },
        },
        jumping: {
          on: {
            land: 'standing',
          },
        },
        crouching: {
          on: {
            release_down: 'standing',
          },
        },
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) => {
        return machine.transition(snapshot, event, actorScope as any);
      },
      {
        initialState: initialSnapshot,
        events: (snapshot) => {
          return __unsafe_getAllOwnEventDescriptors(snapshot).map(
            (type) => ({ type }) as EventObject,
          );
        },
        serializeState: serializeSnapshot,
        serializeEvent: (e) => e.type,
      },
    );

    it('discovers 4 states', () => {
      expect(graph.nodes).toHaveLength(4);
    });

    it('has the right state values', () => {
      const values = graph.nodes
        .map((n) => (n.data as AnyMachineSnapshot).value)
        .sort();
      expect(values).toEqual([
        'crouching',
        'jumping',
        'standing',
        'walking',
      ]);
    });

    it('has correct number of edges', () => {
      // standing: left→walking, right→walking (dedup same target+event? no, different events), down→crouching, up→jumping = 4
      // walking: up→jumping, stop→standing = 2
      // jumping: land→standing = 1
      // crouching: release_down→standing = 1
      // But left and right both go to walking (different events, same target) = not deduped
      // Total: 4 + 2 + 1 + 1 = 8
      expect(graph.edges).toHaveLength(8);
    });

    it('standing transitions match expected', () => {
      const standingId = serializeSnapshot(initialSnapshot);
      const standingEdges = graph.edges
        .filter((e) => e.sourceId === standingId)
        .map((e) => e.label)
        .sort();
      expect(standingEdges).toEqual(['down', 'left', 'right', 'up']);
    });

    it('can find path from standing to crouching', () => {
      const standingId = serializeSnapshot(initialSnapshot);
      const crouchingSnapshot = machine.transition(
        initialSnapshot,
        { type: 'down' },
        actorScope as any,
      );
      const crouchingId = serializeSnapshot(crouchingSnapshot);
      const paths = getShortestPaths(graph, {
        from: standingId,
        to: crouchingId,
      });
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(1);
    });
  });

  describe('traffic light cycle (from xstate adjacency.test.ts)', () => {
    const machine = createMachine({
      initial: 'green',
      states: {
        green: { on: { TIMER: 'yellow' } },
        yellow: { on: { TIMER: 'red' } },
        red: { on: { TIMER: 'green' } },
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) => {
        return machine.transition(snapshot, event, actorScope as any);
      },
      {
        initialState: initialSnapshot,
        events: (snapshot) =>
          __unsafe_getAllOwnEventDescriptors(snapshot).map(
            (type) => ({ type }) as EventObject,
          ),
        serializeState: serializeSnapshot,
        serializeEvent: (e) => e.type,
      },
    );

    it('discovers 3 states and 3 edges', () => {
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(3);
    });

    it('forms a cycle', () => {
      const cycles = getCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('adjacency matches xstate output', () => {
      const triples = graph.edges.map((e) => ({
        state: (graph.nodes.find((n) => n.id === e.sourceId)!.data as AnyMachineSnapshot).value,
        event: e.label,
        nextState: (graph.nodes.find((n) => n.id === e.targetId)!.data as AnyMachineSnapshot).value,
      }));

      expect(triples).toEqual([
        { state: 'green', event: 'TIMER', nextState: 'yellow' },
        { state: 'yellow', event: 'TIMER', nextState: 'red' },
        { state: 'red', event: 'TIMER', nextState: 'green' },
      ]);
    });
  });

  describe('numeric fromTransition (from xstate graph.test.ts)', () => {
    const logic = fromTransition((s, e) => {
      if (e.type === 'a') return 1;
      if (e.type === 'b' && s === 1) return 2;
      if (e.type === 'reset') return 0;
      return s;
    }, 0);

    const actorScope = createMockActorScope();
    const initialSnapshot = logic.getInitialSnapshot(actorScope as any, undefined);

    const graph = createGraphFromTransition(
      (snapshot, event: EventObject) => {
        return logic.transition(snapshot, event, actorScope as any);
      },
      {
        initialState: initialSnapshot,
        events: [{ type: 'a' }, { type: 'b' }, { type: 'reset' }],
        serializeState: (s) => JSON.stringify((s as any).context),
        serializeEvent: (e) => e.type,
      },
    );

    it('discovers 3 states (0, 1, 2)', () => {
      expect(graph.nodes).toHaveLength(3);
    });

    it('shortest paths cover all states', () => {
      const paths = getShortestPaths(graph);
      // Excludes source; states 1 and 2 reachable from 0
      expect(paths.length).toBe(2);
    });

    it('simple paths include multiple routes', () => {
      const id0 = JSON.stringify(0);
      const id2 = JSON.stringify(2);
      const paths = getSimplePaths(graph, { from: id0, to: id2 });
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe('counter with context + stopWhen (from xstate graph.test.ts)', () => {
    const machine = createMachine({
      types: {} as { context: { count: number } },
      initial: 'counting',
      context: { count: 0 },
      states: {
        counting: {
          on: {
            INC: {
              actions: assign({
                count: ({ context }) => context.count + 1,
              }),
            },
          },
        },
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) => {
        return machine.transition(snapshot, event, actorScope as any);
      },
      {
        initialState: initialSnapshot,
        events: [{ type: 'INC' }],
        serializeState: serializeSnapshot,
        serializeEvent: (e) => e.type,
        stopWhen: (s) => (s as any).context.count === 5,
      },
    );

    it('creates 6 states (count 0 through 5)', () => {
      expect(graph.nodes).toHaveLength(6);
    });

    it('state contexts have expected counts', () => {
      const counts = graph.nodes
        .map((n) => (n.data as any).context.count)
        .sort((a: number, b: number) => a - b);
      expect(counts).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('creates 5 edges', () => {
      expect(graph.edges).toHaveLength(5);
    });
  });

  describe('hierarchical machine (light with pedestrian states)', () => {
    const machine = createMachine({
      id: 'light',
      initial: 'green',
      states: {
        green: {
          on: {
            TIMER: 'yellow',
            POWER_OUTAGE: 'red.flashing',
          },
        },
        yellow: {
          on: {
            TIMER: 'red',
            POWER_OUTAGE: 'red.flashing',
          },
        },
        red: {
          initial: 'walk',
          on: {
            TIMER: 'green',
            POWER_OUTAGE: 'red.flashing',
          },
          states: {
            walk: {
              on: {
                PED_COUNTDOWN: 'wait',
              },
            },
            wait: {
              on: {
                PED_COUNTDOWN: 'stop',
              },
            },
            stop: {},
            flashing: {},
          },
        },
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) => {
        return machine.transition(snapshot, event, actorScope as any);
      },
      {
        initialState: initialSnapshot,
        events: (snapshot) =>
          __unsafe_getAllOwnEventDescriptors(snapshot).map(
            (type) => ({ type }) as EventObject,
          ),
        serializeState: serializeSnapshot,
        serializeEvent: (e) => e.type,
      },
    );

    it('discovers all reachable states', () => {
      // green, yellow, red.walk, red.wait, red.stop, red.flashing
      expect(graph.nodes.length).toBeGreaterThanOrEqual(6);
    });

    it('green can reach red.flashing via POWER_OUTAGE', () => {
      const greenId = serializeSnapshot(initialSnapshot);
      const flashingSnapshot = machine.transition(
        initialSnapshot,
        { type: 'POWER_OUTAGE' },
        actorScope as any,
      );
      const flashingId = serializeSnapshot(flashingSnapshot);
      expect(hasPath(graph, greenId, flashingId)).toBe(true);
    });
  });

  describe('Die Hard water jug puzzle (from dieHard.test.ts)', () => {
    describe('plain transition', () => {
      type JugState = { three: number; five: number };

      const transition = (state: JugState, event: { type: string }): JugState => {
        switch (event.type) {
          case 'FILL_3': return { ...state, three: 3 };
          case 'FILL_5': return { ...state, five: 5 };
          case 'EMPTY_3': return { ...state, three: 0 };
          case 'EMPTY_5': return { ...state, five: 0 };
          case 'POUR_3_TO_5': {
            const poured = Math.min(5 - state.five, state.three);
            return { three: state.three - poured, five: state.five + poured };
          }
          case 'POUR_5_TO_3': {
            const poured = Math.min(3 - state.three, state.five);
            return { three: state.three + poured, five: state.five - poured };
          }
          default: return state;
        }
      };

      const graph = createGraphFromTransition(transition, {
        initialState: { three: 0, five: 0 } as JugState,
        events: [
          { type: 'FILL_3' }, { type: 'FILL_5' },
          { type: 'EMPTY_3' }, { type: 'EMPTY_5' },
          { type: 'POUR_3_TO_5' }, { type: 'POUR_5_TO_3' },
        ],
        stopWhen: (s) => s.five === 4,
      });

      const startId = JSON.stringify({ three: 0, five: 0 });
      const goalNodes = () => graph.nodes.filter((n) => n.data.five === 4);

      it('finds 2 shortest paths to five===4', () => {
        const paths = goalNodes().flatMap((goal) =>
          getShortestPaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(2);
      });

      it('finds 14 simple paths to five===4', () => {
        const paths = goalNodes().flatMap((goal) =>
          getSimplePaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(14);
      });

      it('finds 6 simple paths to five===4 && three===0', () => {
        const goals = graph.nodes.filter(
          (n) => n.data.five === 4 && n.data.three === 0,
        );
        const paths = goals.flatMap((goal) =>
          getSimplePaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(6);
      });
    });

    describe('xstate createMachine', () => {
      const machine = createMachine(
        {
          types: {} as { context: { three: number; five: number } },
          id: 'dieHard',
          initial: 'pending',
          context: { three: 0, five: 0 },
          states: {
            pending: {
              always: { target: 'success', guard: 'weHave4Gallons' },
              on: {
                POUR_3_TO_5: {
                  actions: assign(({ context }) => {
                    const poured = Math.min(5 - context.five, context.three);
                    return { three: context.three - poured, five: context.five + poured };
                  }),
                },
                POUR_5_TO_3: {
                  actions: assign(({ context }) => {
                    const poured = Math.min(3 - context.three, context.five);
                    return { three: context.three + poured, five: context.five - poured };
                  }),
                },
                FILL_3: { actions: assign({ three: 3 }) },
                FILL_5: { actions: assign({ five: 5 }) },
                EMPTY_3: { actions: assign({ three: 0 }) },
                EMPTY_5: { actions: assign({ five: 0 }) },
              },
            },
            success: { type: 'final' },
          },
        },
        { guards: { weHave4Gallons: ({ context }) => context.five === 4 } },
      );

      const actorScope = createMockActorScope();
      const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

      const graph = createGraphFromTransition(
        (snapshot: AnyMachineSnapshot, event: EventObject) =>
          machine.transition(snapshot, event, actorScope as any),
        {
          initialState: initialSnapshot,
          events: (snapshot) =>
            __unsafe_getAllOwnEventDescriptors(snapshot).map(
              (type) => ({ type }) as EventObject,
            ),
          serializeState: serializeSnapshot,
          serializeEvent: (e) => e.type,
        },
      );

      const startId = serializeSnapshot(initialSnapshot);
      const successNodes = () =>
        graph.nodes.filter((n) => (n.data as AnyMachineSnapshot).value === 'success');

      it('finds 2 shortest paths to success', () => {
        const paths = successNodes().flatMap((goal) =>
          getShortestPaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(2);
      });

      it('finds 14 simple paths to success', () => {
        const paths = successNodes().flatMap((goal) =>
          getSimplePaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(14);
      });

      it('finds 6 simple paths to success with three===0', () => {
        const goals = graph.nodes.filter(
          (n) =>
            (n.data as AnyMachineSnapshot).value === 'success' &&
            (n.data as any).context.three === 0,
        );
        const paths = goals.flatMap((goal) =>
          getSimplePaths(graph, { from: startId, to: goal.id }),
        );
        expect(paths).toHaveLength(6);
      });
    });
  });

  describe('stopWhen prevents infinite expansion (from shortestPaths.test.ts)', () => {
    // a→b→c→d where d self-loops with incrementing count
    type State = { value: string; count: number };

    const transition = (s: State, e: { type: string }): State => {
      if (s.value === 'a' && e.type === 'NEXT') return { value: 'b', count: s.count };
      if (s.value === 'b' && e.type === 'NEXT') return { value: 'c', count: s.count };
      if (s.value === 'c' && e.type === 'NEXT') return { value: 'd', count: s.count };
      if (s.value === 'd' && e.type === 'NEXT') return { value: 'd', count: s.count + 1 };
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: { value: 'a', count: 0 } as State,
      events: [{ type: 'NEXT' }],
      stopWhen: (s) => s.value === 'c',
    });

    it('stops at c without entering d infinite loop', () => {
      // c is included but not explored → d never discovered
      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes.map((n) => n.data.value).sort()).toEqual(['a', 'b', 'c']);
    });

    it('finds shortest path to c', () => {
      const cNode = graph.nodes.find((n) => n.data.value === 'c')!;
      const paths = getShortestPaths(graph, { from: graph.initialNodeId!, to: cNode.id });
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(2);
    });
  });

  describe('chained from→to paths with getJoinedPath (from shortestPaths.test.ts)', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'a' && e.type === 'TO_Y') return 'y';
      if (s === 'a' && e.type === 'TO_B') return 'b';
      if (s === 'b' && e.type === 'NEXT_B_TO_X') return 'x';
      if (s === 'x' && e.type === 'NEXT_X_TO_Y') return 'y';
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: 'a',
      events: [
        { type: 'TO_Y' }, { type: 'TO_B' },
        { type: 'NEXT_B_TO_X' }, { type: 'NEXT_X_TO_Y' },
      ],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('chains paths a→b then b→y', () => {
      const pathsToB = getShortestPaths(graph, { from: 'a', to: 'b' });
      expect(pathsToB).toHaveLength(1);

      const paths = pathsToB.flatMap((pathToB) => {
        const lastId = pathToB.steps.at(-1)?.node.id ?? pathToB.source.id;
        const pathsToY = getShortestPaths(graph, { from: lastId, to: 'y' });
        return pathsToY.map((pathToY) => getJoinedPath(pathToB, pathToY));
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].steps.map((s) => s.edge.label)).toEqual([
        'TO_B', 'NEXT_B_TO_X', 'NEXT_X_TO_Y',
      ]);
    });
  });

  describe('event payloads accumulate in context (from shortestPaths.test.ts)', () => {
    type TodoState = { todos: string[] };
    const transition = (s: TodoState, e: { type: string; todo: string }): TodoState => {
      if (e.type === 'todo.add') return { todos: [...s.todos, e.todo] };
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: { todos: [] as string[] } as TodoState,
      events: [
        { type: 'todo.add', todo: 'one' },
        { type: 'todo.add', todo: 'two' },
      ],
      stopWhen: (s) => s.todos.length >= 3,
      serializeEvent: (e) => `${e.type}:${e.todo}`,
    });

    it('discovers states with accumulated todos', () => {
      const withBoth = graph.nodes.filter(
        (n) => n.data.todos.includes('one') && n.data.todos.includes('two'),
      );
      expect(withBoth.length).toBeGreaterThan(0);
    });
  });

  describe('delayed transitions (from shortestPaths.test.ts)', () => {
    const machine = createMachine({
      initial: 'a',
      states: {
        a: { after: { 1000: 'b' } },
        b: {},
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) =>
        machine.transition(snapshot, event, actorScope as any),
      {
        initialState: initialSnapshot,
        events: (snapshot) =>
          __unsafe_getAllOwnEventDescriptors(snapshot).map(
            (type) => ({ type }) as EventObject,
          ),
        serializeState: serializeSnapshot,
        serializeEvent: (e) => e.type,
      },
    );

    it('discovers both states via delayed transition', () => {
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      const values = graph.nodes
        .map((n) => (n.data as AnyMachineSnapshot).value)
        .sort();
      expect(values).toEqual(['a', 'b']);
    });
  });

  describe('multi-path machine (from paths.test.ts)', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'a' && e.type === 'EVENT') return 'b';
      if (s === 'b' && e.type === 'EVENT') return 'c';
      if (s === 'c' && e.type === 'EVENT') return 'd';
      if (s === 'c' && e.type === 'EVENT_2') return 'e';
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: 'a',
      events: [{ type: 'EVENT' }, { type: 'EVENT_2' }],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('single-path machine yields 1 shortest path to leaf', () => {
      // a→b→c→d and a→b→c→e: 2 leaf states
      const pathsToD = getShortestPaths(graph, { from: 'a', to: 'd' });
      expect(pathsToD).toHaveLength(1);
    });

    it('has 2 simple paths to leaf states d and e', () => {
      const pathsToD = getSimplePaths(graph, { from: 'a', to: 'd' });
      const pathsToE = getSimplePaths(graph, { from: 'a', to: 'e' });
      expect(pathsToD).toHaveLength(1);
      expect(pathsToE).toHaveLength(1);
    });
  });

  describe('transition coverage as edges (from paths.test.ts)', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'a' && (e.type === 'NEXT' || e.type === 'END')) return 'b';
      if (s === 'b' && (e.type === 'PREV' || e.type === 'RESTART')) return 'a';
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: 'a',
      events: [
        { type: 'NEXT' }, { type: 'END' },
        { type: 'PREV' }, { type: 'RESTART' },
      ],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('all 4 transitions are separate edges', () => {
      const aToB = getOutEdges(graph, 'a').filter((e) => e.targetId === 'b');
      const bToA = getOutEdges(graph, 'b').filter((e) => e.targetId === 'a');
      expect(aToB).toHaveLength(2); // NEXT and END
      expect(bToA).toHaveLength(2); // PREV and RESTART
      expect(aToB.map((e) => e.label).sort()).toEqual(['END', 'NEXT']);
      expect(bToA.map((e) => e.label).sort()).toEqual(['PREV', 'RESTART']);
    });
  });

  describe('chained getShortestPathsFrom (from paths.test.ts)', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'a' && e.type === 'NEXT') return 'b';
      if (s === 'a' && e.type === 'OTHER') return 'b';
      if (s === 'a' && e.type === 'TO_C') return 'c';
      if (s === 'a' && e.type === 'TO_D') return 'd';
      if (s === 'a' && e.type === 'TO_E') return 'e';
      if (s === 'b' && e.type === 'TO_C') return 'c';
      if (s === 'b' && e.type === 'TO_D') return 'd';
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: 'a',
      events: [
        { type: 'NEXT' }, { type: 'OTHER' },
        { type: 'TO_C' }, { type: 'TO_D' }, { type: 'TO_E' },
      ],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('2 shortest paths to b (NEXT and OTHER)', () => {
      const pathsToB = getShortestPaths(graph, { from: 'a', to: 'b' });
      expect(pathsToB).toHaveLength(2);
    });

    it('chaining from b produces 4 paths (2 routes × 2 targets)', () => {
      const pathsToB = getShortestPaths(graph, { from: 'a', to: 'b' });
      const chained = pathsToB.flatMap((pathToB) => {
        const bId = pathToB.steps.at(-1)!.node.id;
        return getShortestPaths(graph, { from: bId })
          .map((ext) => getJoinedPath(pathToB, ext));
      });
      expect(chained).toHaveLength(4);
      expect(chained.every((p) => p.steps.length === 2)).toBe(true);
    });

    it('chaining simple paths from b also produces 4 paths', () => {
      const pathsToB = getSimplePaths(graph, { from: 'a', to: 'b' });
      const chained = pathsToB.flatMap((pathToB) => {
        const bId = pathToB.steps.at(-1)!.node.id;
        return getSimplePaths(graph, { from: bId })
          .filter((ext) => ext.steps.length > 0)
          .map((ext) => getJoinedPath(pathToB, ext));
      });
      expect(chained).toHaveLength(4);
    });
  });

  describe('open/closed shortest paths (from paths.test.ts)', () => {
    const transition = (s: string, e: { type: string }) => {
      if (s === 'open' && e.type === 'CLOSE') return 'closed';
      if (s === 'closed' && e.type === 'OPEN') return 'open';
      return s;
    };

    const graph = createGraphFromTransition(transition, {
      initialState: 'open',
      events: [{ type: 'CLOSE' }, { type: 'OPEN' }],
      serializeState: (s) => s,
      serializeEvent: (e) => e.type,
    });

    it('finds path to non-initial state', () => {
      const paths = getShortestPaths(graph, { from: 'open', to: 'closed' });
      expect(paths).toHaveLength(1);
    });

    it('finds path back to initial state', () => {
      const paths = getShortestPaths(graph, { from: 'closed', to: 'open' });
      expect(paths).toHaveLength(1);
    });
  });

  describe('Collatz conjecture (from testModel.test.ts)', () => {
    describe('plain transition', () => {
      const transition = (v: number, e: { type: string }): number => {
        if (e.type === 'even') return v / 2;
        return v * 3 + 1;
      };

      const graph = createGraphFromTransition(transition, {
        initialState: 15,
        events: (v) => (v % 2 === 0 ? [{ type: 'even' }] : [{ type: 'odd' }]),
        stopWhen: (v) => v === 1,
      });

      it('finds a path from 15 to 1', () => {
        const startId = JSON.stringify(15);
        const goalNode = graph.nodes.find((n) => n.data === 1)!;
        expect(goalNode).toBeDefined();
        const paths = getShortestPaths(graph, { from: startId, to: goalNode.id });
        expect(paths.length).toBeGreaterThan(0);
      });
    });

    describe('xstate fromTransition', () => {
      const logic = fromTransition((value, event) => {
        if (event.type === 'even') return value / 2;
        return value * 3 + 1;
      }, 15);

      const actorScope = createMockActorScope();
      const initialSnapshot = logic.getInitialSnapshot(actorScope as any, undefined);

      const graph = createGraphFromTransition(
        (snapshot, event: EventObject) =>
          logic.transition(snapshot, event, actorScope as any),
        {
          initialState: initialSnapshot,
          events: (snapshot) => {
            const value = (snapshot as any).context;
            return value % 2 === 0
              ? [{ type: 'even' } as EventObject]
              : [{ type: 'odd' } as EventObject];
          },
          serializeState: (s) => JSON.stringify((s as any).context),
          serializeEvent: (e) => e.type,
          stopWhen: (s) => (s as any).context === 1,
        },
      );

      it('finds path from 15 to 1', () => {
        const startId = JSON.stringify(15);
        const goalNode = graph.nodes.find(
          (n) => (n.data as any).context === 1,
        )!;
        expect(goalNode).toBeDefined();
        const paths = getShortestPaths(graph, { from: startId, to: goalNode.id });
        expect(paths.length).toBeGreaterThan(0);
      });
    });
  });

  describe('feedback machine with guards (from index.test.ts)', () => {
    type FeedbackEvent =
      | { type: 'CLICK_BAD' }
      | { type: 'CLICK_GOOD' }
      | { type: 'CLOSE' }
      | { type: 'ESC' }
      | { type: 'SUBMIT'; value: string };

    const machine = createMachine({
      id: 'feedback',
      types: { events: {} as FeedbackEvent },
      initial: 'question',
      states: {
        question: {
          on: {
            CLICK_GOOD: 'thanks',
            CLICK_BAD: 'form',
            CLOSE: 'closed',
            ESC: 'closed',
          },
        },
        form: {
          on: {
            SUBMIT: [
              { target: 'thanks', guard: ({ event }) => !!event.value.length },
              { target: '.invalid' },
            ],
            CLOSE: 'closed',
            ESC: 'closed',
          },
          initial: 'valid',
          states: { valid: {}, invalid: {} },
        },
        thanks: {
          on: { CLOSE: 'closed', ESC: 'closed' },
        },
        closed: { type: 'final' },
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) =>
        machine.transition(snapshot, event as any, actorScope as any),
      {
        initialState: initialSnapshot,
        events: [
          { type: 'CLICK_GOOD' },
          { type: 'CLICK_BAD' },
          { type: 'CLOSE' },
          { type: 'ESC' },
          { type: 'SUBMIT', value: 'something' },
          { type: 'SUBMIT', value: '' },
        ] as EventObject[],
        serializeState: serializeSnapshot,
        serializeEvent: (e) => JSON.stringify(e),
      },
    );

    it('discovers all reachable states', () => {
      // question, form.valid, form.invalid, thanks, closed
      expect(graph.nodes.length).toBeGreaterThanOrEqual(5);
    });

    it('question can reach closed', () => {
      const questionId = serializeSnapshot(initialSnapshot);
      const closedNode = graph.nodes.find(
        (n) => (n.data as AnyMachineSnapshot).value === 'closed',
      )!;
      expect(hasPath(graph, questionId, closedNode.id)).toBe(true);
    });
  });

  describe('dynamic events from context (from index.test.ts)', () => {
    const machine = createMachine({
      types: {} as {
        context: { values: number[] };
        events: { type: 'EVENT'; value: number };
      },
      initial: 'a',
      context: { values: [1, 2, 3] },
      states: {
        a: {
          on: {
            EVENT: [
              { guard: ({ event }) => event.value === 1, target: 'b' },
              { guard: ({ event }) => event.value === 2, target: 'c' },
              { guard: ({ event }) => event.value === 3, target: 'd' },
            ],
          },
        },
        b: {},
        c: {},
        d: {},
      },
    });

    const actorScope = createMockActorScope();
    const initialSnapshot = machine.getInitialSnapshot(actorScope as any);

    const graph = createGraphFromTransition(
      (snapshot: AnyMachineSnapshot, event: EventObject) =>
        machine.transition(snapshot, event as any, actorScope as any),
      {
        initialState: initialSnapshot,
        events: (snapshot) => {
          const ctx = (snapshot as any).context;
          if (ctx.values) {
            return ctx.values.map((v: number) => ({
              type: 'EVENT',
              value: v,
            })) as EventObject[];
          }
          return [];
        },
        serializeState: serializeSnapshot,
        serializeEvent: (e) => JSON.stringify(e),
      },
    );

    it('discovers 4 states (a, b, c, d)', () => {
      expect(graph.nodes).toHaveLength(4);
    });

    it('has 3 shortest paths from a to leaf states', () => {
      const startId = serializeSnapshot(initialSnapshot);
      const paths = getShortestPaths(graph, { from: startId });
      // b, c, d reachable; self-loops on b,c,d are longer
      const directPaths = paths.filter((p) => p.steps.length === 1);
      expect(directPaths).toHaveLength(3);
    });
  });
});
