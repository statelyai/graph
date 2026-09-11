# From an XState machine

`@statelyai/graph/xstate` turns an XState machine into a plain `Graph`: every reachable snapshot becomes a node, every `(snapshot, event)` step becomes an edge. Use it to compute test paths, coverage targets, or visualizations from a machine.

## Install

`xstate` is an optional peer dependency (v5):

```bash
npm install @statelyai/graph xstate
```

## Create the graph

```ts
import { createMachine } from 'xstate';
import { createGraphFromMachine } from '@statelyai/graph/xstate';

const machine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: { on: { TOGGLE: 'active' } },
    active: { on: { TOGGLE: 'inactive' } },
  },
});

const graph = createGraphFromMachine(machine);

graph.nodes.length; // 2
graph.edges.map((edge) => edge.data.eventType); // ['TOGGLE', 'TOGGLE']
```

Events are enumerated from the machine's own event descriptors at each state, so you never list them yourself. Transitions are taken by `xstate` itself — the graph contains only real behavior. The resulting graph is `directed`, with `initialNodeId` set to the initial snapshot's id.

## What nodes and edges carry

Node `data` is a `MachineNodeData`:

| Field | Type | Meaning |
|---|---|---|
| `value` | `StateValue` | Snapshot state value (`'a'`, `{ a: 'b' }`, …) |
| `context` | `MachineContext \| undefined` | Snapshot context; `undefined` when empty |
| `stateIds` | `string[]` | Resolved ids of every active state node, document order |
| `statePaths` | `string[]` | Dotted paths of active atomic/final states, e.g. `['a.b', 'c']` |
| `tags` | `string[]` | Snapshot tags |
| `status` | `'active' \| 'done' \| 'error' \| 'stopped'` | Snapshot status |

Edge `data` is a `MachineEdgeData`:

| Field | Type | Meaning |
|---|---|---|
| `event` | `TEvent` | The event object sent to the machine |
| `eventType` | `string` | `event.type` |
| `sourceNodeId` | `string` | Graph node id of the source state (duplicate of `edge.sourceId`, for path consumers) |
| `guard` | `MachineGuardData \| undefined` | Guard text of the first selected transition, when `includeGuards` is on |
| `actions` | `string[]` | Action labels from every selected transition, in order |
| `transitions` | `MachineTransitionData[]` | The transition definitions XState selected for this `(state, event)` pair; empty for unhandled events |

Each `MachineTransitionData` carries `source`, `targets`, `reenter`, `guard`, and `actions`. Node `label` is the joined `statePaths`; edge `label` is the event type.

## Ids and stability

- Node id: JSON of `{ value, context }` (`context` omitted when empty) — exported as `getSerializedSnapshot`.
- Edge id: `` `${sourceId}|${serializedEvent}|${targetId}` ``, where the event is serialized with `JSON.stringify` by default.

These are the same defaults `xstate/graph` uses, so ids match between the two and stay stable across runs. Coverage and path reports keyed by these ids are diffable between commits.

## Find paths

The graph is an ordinary `Graph`, so every algorithm from `@statelyai/graph` applies:

```ts
import { getShortestPaths, getSimplePaths } from '@statelyai/graph';

const shortest = getShortestPaths(graph);
shortest.map((path) => path.steps.map((step) => step.edge.data.eventType));
// [['TOGGLE']] — one path, to the `active` state

const routes = getSimplePaths(graph, {
  from: graph.initialNodeId!,
  to: someNodeId,
});
```

Note the difference from `xstate/graph`: these path functions omit the zero-step path to the initial node. Every returned path has at least one step. Add the initial state explicitly if your runner needs it.

## Coverage targets

`getCoverageTargets` maps directly onto model-based testing criteria:

```ts
import { getCoverageTargets } from '@statelyai/graph';

getCoverageTargets(graph, { kind: 'nodes' }); // state coverage
getCoverageTargets(graph, { kind: 'edges' }); // transition coverage
getCoverageTargets(graph, { kind: 'edge-pairs' }); // transition-pair coverage
```

| Kind | Target | MBT criterion |
|---|---|---|
| `'nodes'` | each node id | state coverage |
| `'edges'` | each edge id | transition coverage |
| `'edge-pairs'` | each adjacent edge pair | transition-pair coverage |

Because node and edge ids are stable, a run report listing covered targets can be diffed across runs to show what a change added or dropped.

## Options

`createGraphFromMachine(machine, options)`:

| Option | Default | Effect |
|---|---|---|
| `events` | `[]` | Event objects with payloads (array, or a function of the snapshot). An entry replaces the bare `{ type }` for its type. |
| `serializeState` | JSON of `{ value, context }` | Node id for a snapshot |
| `serializeEvent` | `JSON.stringify(event)` | Edge id component for an event |
| `includeGuards` | `true` | Attach guard text to edges |
| `filterEvents` | — | `(snapshot, event) => boolean`; skip an event at a state |
| `stopWhen` | — | `(snapshot) => boolean`; keep the node, do not explore its outgoing events |
| `limit` | `Infinity` | Max states to expand before throwing |
| `input` | — | Machine input for the initial snapshot |
| `id` | `machine.id` | Graph id |

```ts
const graph = createGraphFromMachine(machine, {
  events: [{ type: 'SET', value: 42 }],
  stopWhen: (snapshot) => snapshot.status === 'done',
  limit: 10_000,
});
```

## Guards

Guards are evaluated by `xstate` for real. Only the branch the real guard selected appears in the graph — unlike tools that stub guards out to explore every branch.

The `guard` on an edge is therefore a **label**, not a proof: `{ text, hypothesized: true }`. Use it to annotate reports; do not treat it as a verified predicate. To explore a branch the current context does not reach, change the context — supply `input`, or send events that move the machine there.

## Relationship to `xstate/graph`

`xstate/graph` is a subset of this adapter, kept for in-process use where pulling in a second package is not worth it. It shares the default serialization, so ids match. For path generation, coverage, and anything downstream of a graph, prefer `@statelyai/graph/xstate`: you get the full algorithm surface, layout adapters, and format exports on the same object.
