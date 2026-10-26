import { describe, expect, it, vi } from "vitest";
import * as runtime from "xstate-v6";
import {
  getShortestPaths as getCorePaths,
  getSimplePaths as getCoreSimplePaths,
} from "xstate-v6/graph";
import { createGraphFromMachine, getSerializedSnapshot } from "../src/xstate";
import { getShortestPaths, getSimplePaths } from "../src/algorithms";

const { createMachine, setup, types, initialTransition, transition } = runtime;
describe("v6 runtime conformance", () => {
  it("gives equivalent history records the same identity regardless of visit order", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(
      getSerializedSnapshot({ value: "outside", historyValue: { A: [a], B: [b] } }),
    ).toBe(getSerializedSnapshot({ value: "outside", historyValue: { B: [b], A: [a] } }));
  });
  it("reports incomplete attribution when initial microsteps omit transitions", () => {
    const machine = createMachine({ initial: "idle", states: { idle: {} } });
    const graph = createGraphFromMachine(machine, {
      runtime: {
        ...runtime,
        getInitialMicrosteps: (...args: Parameters<typeof runtime.getInitialMicrosteps>) =>
          runtime.getInitialMicrosteps(...args).map(([snapshot, actions]) => [snapshot, actions]),
      },
    });
    expect(graph.data.exploration.transitionAttributionComplete).toBe(false);
  });
  it("rejects actor identity on v6 instead of ignoring it", () => {
    const machine = createMachine({ initial: "idle", states: { idle: {} } });
    expect(() => createGraphFromMachine(machine, {
      runtime,
      actorIdentity: { id: "source", sessionId: "session" },
    })).toThrow("actorIdentity is supported only for XState v5");
  });
  it("replaces all synthetic defaults of a supplied event type", () => {
    const machine = createMachine({
      initial: "idle",
      states: {
        idle: { after: { 7: { target: "seven" }, 8: { target: "eight" } } },
        seven: { type: "final" },
        eight: { type: "final" },
      },
    });
    expect(createGraphFromMachine(machine, { runtime }).nodes).toHaveLength(3);
    const events = [{ type: "xstate.after", delay: 7, stateId: "idle" }] as const;
    const graph = createGraphFromMachine(machine, {
      runtime,
      events,
    });
    expect(graph.nodes.map((node) => node.data.value)).toEqual(["idle", "seven"]);
  });
  it("retains state inputs and both outcomes, with paths at least as complete as core", () => {
    const machine = setup({
      schemas: { events: { SELECT: types<{ ok: boolean }>(), FINISH: types<{}>() } },
      states: {
        idle: {},
        working: { schemas: { input: types<{ ok: boolean }>() } },
        success: {},
        failure: {},
      },
    }).createMachine({
      initial: "idle",
      states: {
        idle: { on: { SELECT: ({ event }) => ({ target: "working", input: { ok: event.ok } }) } },
        working: { on: { FINISH: ({ input }) => ({ target: input.ok ? "success" : "failure" }) } },
        success: { type: "final" },
        failure: { type: "final" },
      },
    });
    const events = [
      { type: "SELECT", ok: true },
      { type: "SELECT", ok: false },
      { type: "FINISH" },
    ] as const;
    const graph = createGraphFromMachine(machine, { runtime, events, limit: 20 });
    expect(graph.nodes.filter((n) => n.data.value === "working")).toHaveLength(2);
    expect(graph.nodes.map((n) => n.data.value)).toEqual(
      expect.arrayContaining(["success", "failure"]),
    );
    expect(graph.nodes.find((n) => n.data.value === "working")?.data.stateInputs).toBeDefined();
    for (const [ours, core] of [
      [getShortestPaths(graph), getCorePaths(machine, { events })],
      [getSimplePaths(graph), getCoreSimplePaths(machine, { events })],
    ] as const) {
      const targets = new Set(ours.map((path) => path.steps.at(-1)?.node.data.value));
      for (const path of core)
        if (path.steps.length > 1) expect(targets.has(path.state.value)).toBe(true);
    }
  });
  it("distinguishes history memories and actually discovers both reentries", () => {
    const machine = createMachine({
      initial: "outside",
      states: {
        outside: { on: { ENTER: { target: "inside.hist" } } },
        inside: {
          initial: "a",
          on: { LEAVE: { target: "outside" } },
          states: {
            a: { on: { NEXT: { target: "b" } } },
            b: {},
            hist: { type: "history", target: "a" },
          },
        },
      },
    });
    const graph = createGraphFromMachine(machine, { runtime, limit: 20 });
    expect(graph.nodes.filter((node) => node.data.value === "outside")).toHaveLength(3);
    const [start] = initialTransition(machine);
    const [entered] = transition(machine, start, { type: "ENTER" });
    const [a] = transition(machine, entered, { type: "LEAVE" });
    const [b] = transition(machine, transition(machine, entered, { type: "NEXT" })[0], {
      type: "LEAVE",
    });
    expect(getSerializedSnapshot(a)).not.toBe(getSerializedSnapshot(b));
  });
  it("attributes eventless microsteps and evaluates transition bodies only once", () => {
    const decide = vi.fn(() => ({ target: "routing" as const }));
    const effect = vi.fn();
    const machine = createMachine({
      actions: { effect },
      initial: "idle",
      states: {
        idle: { on: { GO: decide } },
        routing: { always: { target: "done" } },
        done: { type: "final" },
      },
    });
    const graph = createGraphFromMachine(machine, { runtime });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(effect).not.toHaveBeenCalled();
    expect(graph.edges[0].data.transitions.map((t) => t.eventType)).toEqual(["GO", ""]);
    expect(graph.edges[0].data.transitions[0].targets).toEqual(["routing"]);
    expect(graph.data.exploration.transitionAttributionComplete).toBe(true);
  });
  it("supports typed event maps, replacements, source snapshots and contextual failures", () => {
    const machine = createMachine({
      schemas: { events: { GO: types<{ ok: boolean }>() } },
      initial: "idle",
      states: {
        idle: {
          on: {
            GO: ({ event }) => {
              if (event.ok) return { target: "done" };
            },
          },
        },
        done: { type: "final" },
      },
    });
    expect(
      createGraphFromMachine(machine, { runtime, events: { GO: [{ ok: true }] } }).nodes,
    ).toHaveLength(2);
    expect(() => createGraphFromMachine(machine, { runtime, events: { GO: [] } })).toThrow(
      "non-empty",
    );
    expect(
      createGraphFromMachine(machine, { runtime, events: [], eventMode: "replaceDefaults" }).edges,
    ).toHaveLength(0);
    expect(() => createGraphFromMachine(machine, { runtime, limit: 0 })).toThrow("Traversal limit");
    const broken = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: {
            GO: () => {
              throw new Error("original failure");
            },
          },
        },
      },
    });
    expect(() => createGraphFromMachine(broken, { runtime })).toThrow(/Transition failed.*GO/);
  });
});

it("does not restore a synthetic default when explicit cases fail its match fields", () => {
  const machine = createMachine({
    initial: "idle",
    states: { idle: { after: { 7: { target: "done" } } }, done: { type: "final" } },
  });
  expect(createGraphFromMachine(machine, { runtime }).nodes).toHaveLength(2);
  const events = [{ type: "xstate.after", delay: 999, stateId: "idle" }] as const;
  const graph = createGraphFromMachine(machine, { runtime, events });
  expect(graph.nodes.map((node) => node.data.value)).toEqual(["idle"]);
  expect(graph.edges).toHaveLength(0);
});
