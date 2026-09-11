/**
 * XState adapter — one machine → graph path shared by mbt, viz, and PBT.
 *
 * Requires the optional `xstate` peer dependency (v5).
 *
 * @module @statelyai/graph/xstate
 */
import {
  createEmptyActor,
  __unsafe_getAllOwnEventDescriptors,
  type AnyMachineSnapshot,
  type AnyStateMachine,
  type AnyTransitionDefinition,
  type EventFromLogic,
  type EventObject,
  type InputFrom,
  type MachineContext,
  type SnapshotFrom,
  type StateValue,
  type UnknownAction,
} from 'xstate';
import { createGraph } from '../graph';
import type { EdgeConfig, Graph, NodeConfig } from '../types';

/** Serializable projection of a machine snapshot, stored as node `data`. */
export interface MachineNodeData {
  /** Snapshot state value (`'a'`, `{ a: 'b' }`, ...). */
  value: StateValue;
  /** Snapshot context, or `undefined` when empty. */
  context: MachineContext | undefined;
  /** Resolved ids of every active state node, in document order. */
  stateIds: string[];
  /** Dotted paths of the active atomic/final state nodes, e.g. `['a.b', 'c']`. */
  statePaths: string[];
  /** Snapshot tags. */
  tags: string[];
  /** Snapshot status. */
  status: 'active' | 'done' | 'error' | 'stopped';
}

/** A guard rendered as text. `hypothesized` marks that the text is a label, not a verified predicate. */
export interface MachineGuardData {
  text: string;
  hypothesized: true;
}

/** One XState transition definition selected for an edge. */
export interface MachineTransitionData {
  /** Resolved id of the state node that owns the transition. */
  source: string;
  /** Resolved ids of the transition targets (`undefined` for targetless). */
  targets: string[] | undefined;
  /** Whether the transition re-enters its source. */
  reenter: boolean;
  guard?: MachineGuardData;
  actions: string[];
}

/** Serializable description of a machine step, stored as edge `data`. */
export interface MachineEdgeData<TEvent extends EventObject = EventObject> {
  /** The event object sent to the machine. */
  event: TEvent;
  /** `event.type`. */
  eventType: string;
  /** Graph node id of the source state (same as `edge.sourceId`; duplicated for path consumers). */
  sourceNodeId: string;
  /** Guard of the first guarded selected transition, when `includeGuards` is on. */
  guard?: MachineGuardData;
  /**
   * Action labels from every selected transition, in order. Entry/exit actions
   * and actions of `always` transitions taken after the event are not listed.
   */
  actions: string[];
  /**
   * Transition definitions XState selected for the event itself. Eventless
   * (`always`) transitions taken afterwards are folded into `targetId` but not
   * listed here. Empty for unhandled events.
   */
  transitions: MachineTransitionData[];
}

export interface MachineGraphOptions<TMachine extends AnyStateMachine> {
  /**
   * Event objects (with payloads) to try. Event types are enumerated from the
   * machine's own descriptors at each state and sent as bare `{ type }`; an
   * entry here whose type matches a descriptor (exact, `*`, or `prefix.*`)
   * replaces that bare event. Wildcard descriptors need a supplied event to be
   * explored with a concrete type.
   */
  events?:
    | readonly EventFromLogic<TMachine>[]
    | ((snapshot: SnapshotFrom<TMachine>) => readonly EventFromLogic<TMachine>[]);
  /** Node id for a snapshot. Default: JSON of `{ value, context }` (matches `xstate/graph`). */
  serializeState?: (snapshot: SnapshotFrom<TMachine>) => string;
  /** Edge id component for an event. Default: `JSON.stringify(event)` (matches `xstate/graph`). */
  serializeEvent?: (event: EventFromLogic<TMachine>) => string;
  /** Attach guard text to edges. Default: `true`. */
  includeGuards?: boolean;
  /** Skip an event at a state. */
  filterEvents?: (
    snapshot: SnapshotFrom<TMachine>,
    event: EventFromLogic<TMachine>,
  ) => boolean;
  /** Keep the node but do not explore its outgoing events. */
  stopWhen?: (snapshot: SnapshotFrom<TMachine>) => boolean;
  /** Max states to expand before throwing. Default: `Infinity`. */
  limit?: number;
  /** Machine input for the initial snapshot. */
  input?: InputFrom<TMachine>;
  /** Graph id. Default: `machine.id`. */
  id?: string;
}

export type MachineGraph<TMachine extends AnyStateMachine = AnyStateMachine> =
  Graph<MachineNodeData, MachineEdgeData<EventFromLogic<TMachine>>>;

function getParameterizedText(
  value: string | { type: string; params?: unknown } | ((...args: any[]) => unknown),
): string {
  if (typeof value === 'string') return value;
  // Inline `guard: () => ...` / `actions: () => ...` get the property name; treat as anonymous.
  if (typeof value === 'function') {
    return value.name && !['guard', 'actions'].includes(value.name)
      ? value.name
      : '[inline]';
  }
  if (value.params === undefined) return value.type;
  return `${value.type}(${JSON.stringify(value.params)})`;
}

function getGuardData(guard: AnyTransitionDefinition['guard']): MachineGuardData | undefined {
  if (guard === undefined) return undefined;
  return { text: getParameterizedText(guard as any), hypothesized: true };
}

function getActionTexts(actions: readonly UnknownAction[]): string[] {
  return actions.map((action) => getParameterizedText(action as any));
}

function getTransitionData(
  transition: AnyTransitionDefinition,
  includeGuards: boolean,
): MachineTransitionData {
  const guard = includeGuards ? getGuardData(transition.guard) : undefined;
  return {
    source: transition.source.id,
    targets: transition.target?.map((target) => target.id),
    reenter: transition.reenter,
    ...(guard ? { guard } : {}),
    actions: getActionTexts(transition.actions),
  };
}

function isMatchingDescriptor(descriptor: string, eventType: string): boolean {
  if (descriptor === eventType || descriptor === '*') return true;
  if (!descriptor.endsWith('.*')) return false;
  const prefix = descriptor.slice(0, -1);
  return eventType.startsWith(prefix) && eventType !== descriptor;
}

/**
 * One inert actor scope for the whole traversal, so `self`, `sessionId`, and
 * the system stay stable across steps (as they would in a running actor).
 */
function createInertActorScope() {
  const self = createEmptyActor();
  return {
    self,
    logger: () => {},
    id: '',
    sessionId: self.sessionId,
    defer: () => {},
    system: self.system,
    stopChild: () => {},
    emit: () => {},
    actionExecutor: () => {},
  };
}

/** Default node id — identical to `serializeSnapshot` from `xstate/graph`. */
export function getSerializedSnapshot(snapshot: {
  value: StateValue;
  context?: MachineContext;
}): string {
  const { value, context } = snapshot;
  return JSON.stringify({
    value,
    context: Object.keys(context ?? {}).length ? context : undefined,
  });
}

function getNodeData(snapshot: AnyMachineSnapshot): MachineNodeData {
  const nodes: Array<{ id: string; path: string[]; type: string }> =
    (snapshot as any)._nodes ?? [];
  const context = snapshot.context as MachineContext | undefined;
  return {
    value: snapshot.value,
    context: Object.keys(context ?? {}).length ? context : undefined,
    stateIds: nodes.map((node) => node.id),
    statePaths: nodes
      .filter((node) => node.type === 'atomic' || node.type === 'final')
      .map((node) => node.path.join('.')),
    tags: [...snapshot.tags],
    status: snapshot.status,
  };
}

/**
 * Create a graph by exhaustively exploring an XState machine: every reachable
 * snapshot becomes a node; every `(snapshot, event)` step becomes an edge.
 *
 * - Events come from the machine's own event descriptors at each state, so
 *   callers do not enumerate them. Use `events` to supply payloads.
 * - Node ids default to the JSON of `{ value, context }` and edge ids to
 *   `sourceId|serializedEvent|targetId`, so ids are stable across runs and
 *   `getCoverageTargets` yields diffable state / transition / transition-pair
 *   targets.
 * - Guards are evaluated for real by `xstate`; the guard text on an edge is a
 *   label (`hypothesized: true`), not a proof that the predicate held.
 *
 * @example
 * ```ts
 * import { createMachine } from 'xstate';
 * import { createGraphFromMachine } from '@statelyai/graph/xstate';
 * import { getShortestPaths } from '@statelyai/graph';
 *
 * const graph = createGraphFromMachine(
 *   createMachine({ initial: 'a', states: { a: { on: { NEXT: 'b' } }, b: {} } }),
 * );
 * getShortestPaths(graph).map((p) => p.steps.map((s) => s.edge.data.eventType));
 * // [['NEXT']]
 * ```
 */
export function createGraphFromMachine<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options: MachineGraphOptions<TMachine> = {},
): MachineGraph<TMachine> {
  type TSnapshot = SnapshotFrom<TMachine>;
  type TEvent = EventFromLogic<TMachine>;

  const serializeState =
    options.serializeState ?? (getSerializedSnapshot as (s: TSnapshot) => string);
  const serializeEvent = options.serializeEvent ?? ((e: TEvent) => JSON.stringify(e));
  const includeGuards = options.includeGuards ?? true;
  const limit = options.limit ?? Infinity;
  const extraEvents = options.events;

  const getEvents = (snapshot: TSnapshot): TEvent[] => {
    const supplied =
      typeof extraEvents === 'function'
        ? extraEvents(snapshot)
        : (extraEvents ?? []);
    const seen = new Set<string>();
    return __unsafe_getAllOwnEventDescriptors(snapshot)
      .flatMap((descriptor) => {
        const matching = supplied.filter((event) =>
          isMatchingDescriptor(descriptor, event.type),
        );
        return matching.length ? matching : [{ type: descriptor } as TEvent];
      })
      .filter((event) => {
        const key = serializeEvent(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const actorScope = createInertActorScope();
  const initial = machine.getInitialSnapshot(
    actorScope as any,
    options.input as any,
  ) as TSnapshot;
  const initialId = serializeState(initial);

  const nodes: NodeConfig<MachineNodeData>[] = [];
  const edges: EdgeConfig<MachineEdgeData<TEvent>>[] = [];
  const visited = new Set<string>();
  const edgeIds = new Set<string>();
  const queue: TSnapshot[] = [initial];

  const addNode = (id: string, snapshot: TSnapshot) => {
    visited.add(id);
    const data = getNodeData(snapshot as AnyMachineSnapshot);
    nodes.push({ id, label: data.statePaths.join(', ') || String(id), data });
  };
  addNode(initialId, initial);

  let iterations = 0;
  while (queue.length > 0) {
    const snapshot = queue.shift()!;
    const sourceId = serializeState(snapshot);
    // A stopped/done actor accepts no events; keep the node, do not expand.
    if ((snapshot as AnyMachineSnapshot).status !== 'active') continue;
    if (options.stopWhen?.(snapshot)) continue;
    if (++iterations > limit) throw new Error('Traversal limit exceeded');

    for (const event of getEvents(snapshot)) {
      if (options.filterEvents && !options.filterEvents(snapshot, event)) continue;

      const selected: AnyTransitionDefinition[] = machine.getTransitionData(
        snapshot as any,
        event,
      );
      const next = machine.transition(
        snapshot as any,
        event,
        actorScope as any,
      ) as TSnapshot;
      const targetId = serializeState(next);
      if (!visited.has(targetId)) {
        addNode(targetId, next);
        queue.push(next);
      }

      const edgeId = `${sourceId}|${serializeEvent(event)}|${targetId}`;
      if (edgeIds.has(edgeId)) continue;
      edgeIds.add(edgeId);

      const transitions = selected.map((t) => getTransitionData(t, includeGuards));
      const guard = transitions.find((t) => t.guard)?.guard;
      edges.push({
        id: edgeId,
        sourceId,
        targetId,
        label: event.type,
        data: {
          event,
          eventType: event.type,
          sourceNodeId: sourceId,
          ...(guard ? { guard } : {}),
          actions: transitions.flatMap((t) => t.actions),
          transitions,
        },
      });
    }
  }

  return createGraph({
    id: options.id ?? machine.id,
    mode: 'directed',
    initialNodeId: initialId,
    nodes,
    edges,
  });
}
