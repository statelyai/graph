/** XState v5/v6 behavioral graph adapter. No external effects are executed. */
import * as XState from "xstate";
import type { EventObject, MachineContext, StateValue } from "xstate";
import { createGraph } from "../graph";
import type { EdgeConfig, Graph, NodeConfig } from "../types";

/** Structural boundary also accepts machines imported through a runtime alias. */
export interface MachineGraphLogic {
  id: string;
  root: any;
  getInitialSnapshot(...args: any[]): any;
  transition(...args: any[]): any;
}
type MachineSnapshot<T extends MachineGraphLogic> = ReturnType<T["getInitialSnapshot"]>;
type MachineEvent<T extends MachineGraphLogic> = Parameters<T["transition"]>[1] & EventObject;
type MachineInput<T extends MachineGraphLogic> = Parameters<T["getInitialSnapshot"]>[1];

/** Helpers must come from the same runtime as the machine (including aliases). */
export interface MachineGraphRuntime {
  createEmptyActor(): any;
  getInitialMicrosteps?: (...args: any[]) => any[];
  getMicrosteps?: (...args: any[]) => any[];
}

export interface MachineNodeData {
  value: StateValue;
  context: MachineContext | undefined;
  stateIds: string[];
  statePaths: string[];
  tags: string[];
  status: "active" | "done" | "error" | "stopped";
  stateInputs?: Record<string, unknown>;
  historyValue?: Record<string, string[]>;
}
export interface MachineGuardData {
  text: string;
  hypothesized: true;
}
export interface MachineTransitionData {
  source: string;
  targets: string[] | undefined;
  reenter: boolean;
  eventType: string;
  guard?: MachineGuardData;
  actions: string[];
}
export interface MachineEdgeData<TEvent extends EventObject = EventObject> {
  event: TEvent;
  eventType: string;
  sourceNodeId: string;
  guard?: MachineGuardData;
  /** Transition action labels; entry/exit effects are not included. */
  actions: string[];
  /** All selected microstep transitions, including eventless/raised events. */
  transitions: MachineTransitionData[];
}
export interface MachineGraphData {
  exploration: {
    scope: "event-cases";
    eventMode: "augmentDefaults" | "replaceDefaults";
    stoppedNodeIds: string[];
    /** Whether microstep transition attribution was available for every step. */
    transitionAttributionComplete: boolean;
    initialTransitions: MachineTransitionData[];
  };
}
type MachineEventCases<T extends MachineGraphLogic> = {
  [K in MachineEvent<T>["type"]]?:
    | readonly Omit<Extract<MachineEvent<T>, { type: K }>, "type">[]
    | ((
        snapshot: MachineSnapshot<T>,
      ) => readonly Omit<Extract<MachineEvent<T>, { type: K }>, "type">[]);
};
export interface MachineGraphOptions<T extends MachineGraphLogic> {
  /** Arrays preserve the legacy augment behavior; eventMode can replace defaults. */
  events?:
    | readonly MachineEvent<T>[]
    | ((snapshot: MachineSnapshot<T>) => readonly MachineEvent<T>[])
    | MachineEventCases<T>;
  eventMode?: "augmentDefaults" | "replaceDefaults";
  serializeState?: (snapshot: MachineSnapshot<T>) => string;
  serializeEvent?: (event: MachineEvent<T>) => string;
  includeGuards?: boolean;
  filterEvents?: (snapshot: MachineSnapshot<T>, event: MachineEvent<T>) => boolean;
  stopWhen?: (snapshot: MachineSnapshot<T>) => boolean;
  fromState?: MachineSnapshot<T>;
  limit?: number;
  input?: MachineInput<T>;
  id?: string;
  runtime?: MachineGraphRuntime;
}
export type MachineGraph<T extends MachineGraphLogic = MachineGraphLogic> = Graph<
  MachineNodeData,
  MachineEdgeData<MachineEvent<T>>,
  MachineGraphData
>;

function getParameterizedText(value: any): string {
  if (typeof value === "string") return value;
  if (typeof value === "function")
    return value.name && !["guard", "actions"].includes(value.name) ? value.name : "[inline]";
  return value.params === undefined ? value.type : `${value.type}(${JSON.stringify(value.params)})`;
}
function getTransitionData(transition: any, includeGuards: boolean): MachineTransitionData {
  const guard =
    includeGuards && transition.guard !== undefined
      ? { text: getParameterizedText(transition.guard), hypothesized: true as const }
      : undefined;
  return {
    source: transition.source.id,
    targets: transition.target?.map((target: any) => target.id),
    reenter: transition.reenter ?? false,
    eventType: transition.eventType,
    ...(guard ? { guard } : {}),
    actions: (transition.actions ?? []).map(getParameterizedText),
  };
}
function isMatchingDescriptor(descriptor: string, type: string): boolean {
  return (
    descriptor === type ||
    descriptor === "*" ||
    (descriptor.endsWith(".*") && type.startsWith(descriptor.slice(0, -1)) && type !== descriptor)
  );
}
function getHistory(snapshot: any): Record<string, string[]> | undefined {
  const history = snapshot.historyValue;
  return history && Object.keys(history).length
    ? Object.fromEntries(
        Object.entries(history).map(([id, nodes]) => [id, (nodes as any[]).map((node) => node.id)]),
      )
    : undefined;
}
function getInputs(snapshot: any): Record<string, unknown> | undefined {
  const inputs = snapshot.getInputs?.();
  return inputs && Object.keys(inputs).length ? inputs : undefined;
}
/** Default identity includes root context, state inputs and remembered history. */
export function getSerializedSnapshot(snapshot: {
  value: StateValue;
  context?: MachineContext;
  getInputs?: () => Record<string, unknown>;
  historyValue?: Record<string, readonly { id: string }[]>;
}): string {
  return JSON.stringify({
    value: snapshot.value,
    context: Object.keys(snapshot.context ?? {}).length ? snapshot.context : undefined,
    stateInputs: getInputs(snapshot),
    historyValue: getHistory(snapshot),
  });
}
function getNodeData(snapshot: any): MachineNodeData {
  const nodes: any[] = snapshot.nodes ?? snapshot._nodes ?? [];
  return {
    value: snapshot.value,
    context: Object.keys(snapshot.context ?? {}).length ? snapshot.context : undefined,
    stateIds: nodes.map((node) => node.id),
    statePaths: nodes
      .filter((node) => node.type === "atomic" || node.type === "final")
      .map((node) => node.path.join(".")),
    tags: [...snapshot.tags],
    status: snapshot.status,
    ...(getInputs(snapshot) ? { stateInputs: getInputs(snapshot) } : {}),
    ...(getHistory(snapshot) ? { historyValue: getHistory(snapshot) } : {}),
  };
}
function getDefaultEvents(snapshot: any): EventObject[] {
  return (snapshot.nodes ?? snapshot._nodes).flatMap((node: any) =>
    [...node.transitions.values()].flatMap((definitions: any) =>
      definitions.map((definition: any) => {
        const event: any = { type: definition.eventType, ...definition.matches };
        if (
          "actorId" in event &&
          [
            "xstate.done.actor",
            "xstate.error.actor",
            "xstate.snapshot.actor",
            "xstate.timeout.actor",
          ].includes(event.type)
        )
          event.sessionId = snapshot.children[event.actorId]?.sessionId;
        return event;
      }),
    ),
  );
}
/** Explore the supplied event cases using the machine's own runtime semantics. */
export function createGraphFromMachine<T extends MachineGraphLogic>(
  machine: T,
  options: MachineGraphOptions<T> = {},
): MachineGraph<T> {
  const runtime = options.runtime ?? XState;
  const v6 = "eventSchema" in machine && "sources" in machine;
  const serializeState = options.serializeState ?? getSerializedSnapshot;
  const serializeEvent = options.serializeEvent ?? JSON.stringify;
  const includeGuards = options.includeGuards ?? true;
  const eventMode = options.eventMode ?? "augmentDefaults";
  const limit = options.limit ?? Infinity;
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0))
    throw new Error("limit must be a nonnegative safe integer or Infinity");
  if (v6 && (!runtime.getInitialMicrosteps || !runtime.getMicrosteps))
    throw new Error(
      "XState v6 requires microstep helpers from the same runtime; pass options.runtime for aliased runtimes.",
    );
  const selected: any[] = [];
  // v5 inspection attributes every microstep without evaluating guards twice.
  const self = v6 ? undefined : runtime.createEmptyActor();
  const subscription = self?.system.inspect((event: any) => {
    if (event.type === "@xstate.microstep") selected.push(...event._transitions);
  });
  const scope = self && {
    self,
    system: self.system,
    id: "",
    sessionId: self.sessionId,
    logger: () => {},
    defer: () => {},
    stopChild: () => {},
    emit: () => {},
    actionExecutor: () => {},
  };
  const nodes: NodeConfig<MachineNodeData>[] = [];
  const edges: EdgeConfig<MachineEdgeData<MachineEvent<T>>>[] = [];
  const visited = new Set<string>();
  const edgeIds = new Set<string>();
  const stoppedNodeIds: string[] = [];
  let attributionComplete = true;
  const getEvents = (snapshot: MachineSnapshot<T>): MachineEvent<T>[] => {
    const defaults = eventMode === "replaceDefaults" ? [] : getDefaultEvents(snapshot);
    const configured =
      typeof options.events === "function" ? options.events(snapshot) : options.events;
    let supplied: EventObject[];
    if (configured && !Array.isArray(configured)) {
      supplied = [];
      for (const [type, cases] of Object.entries(configured)) {
        if (
          eventMode !== "replaceDefaults" &&
          !defaults.some((e) => isMatchingDescriptor(e.type, type))
        )
          continue;
        const values = typeof cases === "function" ? cases(snapshot) : cases;
        if (!Array.isArray(values) || !values.length)
          throw new Error(`Event cases for "${type}" must be a non-empty array`);
        for (const payload of values) supplied.push({ ...payload, type });
      }
    } else supplied = (configured ?? []) as EventObject[];
    const candidates = defaults.flatMap((def) => {
      const replacements = supplied.filter((event) => isMatchingDescriptor(def.type, event.type));
      const matches = replacements.filter(
        (e) =>
          isMatchingDescriptor(def.type, e.type) &&
          Object.entries(def).every(
            ([key, value]) => key === "type" || Object.is((e as any)[key], value),
          ),
      );
      return matches.length ? matches : replacements.length || def.type.includes("*") ? [] : [def];
    });
    const all = eventMode === "replaceDefaults" ? supplied : candidates;
    const seen = new Set<string>();
    return all.filter((event) => {
      const id = serializeEvent(event as MachineEvent<T>);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }) as MachineEvent<T>[];
  };
  const addNode = (snapshot: MachineSnapshot<T>) => {
    const id = serializeState(snapshot);
    visited.add(id);
    const data = getNodeData(snapshot);
    nodes.push({ id, label: data.statePaths.join(", ") || id, data });
    return id;
  };
  try {
    let initial: MachineSnapshot<T>;
    if (options.fromState) initial = options.fromState;
    else if (v6) {
      const steps = runtime.getInitialMicrosteps!(machine, options.input);
      initial = steps.at(-1)![0];
      selected.push(...steps.flatMap((step) => step[2] ?? []));
    } else initial = machine.getInitialSnapshot(scope, options.input);
    const initialTransitions = selected.map((t) => getTransitionData(t, includeGuards));
    selected.length = 0;
    const initialId = addNode(initial);
    const queue = [initial];
    let expanded = 0;
    for (let head = 0; head < queue.length; head++) {
      const snapshot = queue[head];
      if (snapshot.status !== "active") continue;
      const sourceId = serializeState(snapshot);
      if (options.stopWhen?.(snapshot)) {
        stoppedNodeIds.push(sourceId);
        continue;
      }
      if (++expanded > limit) throw new Error("Traversal limit exceeded");
      for (const event of getEvents(snapshot)) {
        if (options.filterEvents && !options.filterEvents(snapshot, event)) continue;
        selected.length = 0;
        let next: MachineSnapshot<T>;
        try {
          if (v6) {
            const steps = runtime.getMicrosteps!(machine, snapshot, event);
            next = steps.at(-1)?.[0] ?? snapshot;
            selected.push(...steps.flatMap((step) => step[2] ?? []));
            if (steps.some((step) => !Array.isArray(step[2]))) attributionComplete = false;
          } else next = machine.transition(snapshot, event, scope);
        } catch (cause) {
          throw new Error(`Transition failed from ${sourceId} on ${serializeEvent(event)}`, {
            cause,
          });
        }
        const targetId = serializeState(next);
        if (!visited.has(targetId)) {
          addNode(next);
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
      mode: "directed",
      initialNodeId: initialId,
      nodes,
      edges,
      data: {
        exploration: {
          scope: "event-cases",
          eventMode,
          stoppedNodeIds,
          transitionAttributionComplete: attributionComplete,
          initialTransitions,
        },
      },
    });
  } finally {
    subscription?.unsubscribe();
  }
}
