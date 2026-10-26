# From an XState machine

`@statelyai/graph/xstate` turns an XState machine into a plain `Graph`: every reachable snapshot becomes a node, every `(snapshot, event)` step becomes an edge. Use it to compute test paths, coverage targets, or visualizations from a machine.

## Install

`xstate` is an optional peer dependency (v5 or v6 alpha):

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

Event types are enumerated from the machine's own event descriptors at each state and sent as bare `{ type }` objects. Provide the `events` option when a transition needs payload fields (see [Options](#options)). Transitions are taken by `xstate` itself — the graph contains only real behavior. Completed (`done`) snapshots are kept as nodes but not expanded, since a finished actor accepts no events. The resulting graph is `directed`, with `initialNodeId` set to the initial snapshot's id.

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

- Node id: JSON of `{ value, context, stateInputs, historyValue }`, omitting empty optional records — exported as `getSerializedSnapshot`. History stores state-node IDs, not live node objects. Distinct state inputs and remembered history must remain distinct because they can change future transitions.
- Edge id: `` `${sourceId}|${serializedEvent}|${targetId}` ``, where the event is serialized with `JSON.stringify` by default.

These match the v6 snapshot identity used by `xstate/graph` after its input/history fix. Machines without inputs or history retain their previous IDs. Coverage and path reports keyed by these ids are diffable between commits.

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

`getShortestPaths` also returns every tied shortest path to a node, where `xstate/graph` keeps one per state. Expect equal or higher path counts; use `getShortestPath` with `to` for one path per target.

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
| `events` | `[]` | Event objects as an array, an event-type map of payload cases, or a function of the snapshot. Supplied cases replace defaults matching their event type. Other event types retain defaults. |
| `eventMode` | `'augmentDefaults'` | `'replaceDefaults'` explores only supplied cases. |
| `fromState` | — | Snapshot that seeds exploration. |
| `actorIdentity` | — | v5 actor `id` and `sessionId` for the isolated exploration actor. Pass the source actor when a starting snapshot depends on these strings. |
| `runtime` | Installed `xstate` | Matching runtime module. Required for an aliased v6 package. |
| `serializeState` | JSON including value/context, state inputs and history | Node id for a snapshot |
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

## Data boundary

Node `context` and edge `event` values are stored as-is and the default ids `JSON.stringify` them, so machine context and events must be JSON-serializable (no `bigint`, cycles, functions, or class instances). Provide `serializeState` / `serializeEvent` and project the data yourself if your machine holds non-JSON values.

`transitions` includes the transitions selected throughout the macrostep, including eventless and raised-event transitions. Their event descriptors are available as `eventType`. Transition bodies and guards are not reevaluated for metadata. `actions` contains transition action labels; entry/exit effects are not listed. External effects are not executed.

## Guards

Guards are evaluated by `xstate` for real. Only the branch the real guard selected appears in the graph — unlike tools that stub guards out to explore every branch.

The `guard` on an edge is therefore a **label**, not a proof: `{ text, hypothesized: true }`. Use it to annotate reports; do not treat it as a verified predicate. To explore a branch the current context does not reach, change the context — supply `input`, or send events that move the machine there.

## Relationship to `xstate/graph`

The adapter has conformance fixtures against v5 and v6 path discovery, including v6 state inputs, history, and eventless microsteps. Its graph exposes the broader graph algorithms, layout adapters, and format exports. Path return shapes and event-array defaults differ as documented above; this does not claim that every `xstate/graph` option has the same signature.

## XState v6 and aliased runtimes

When `xstate` itself resolves to v6, the adapter uses that runtime's microstep
helpers. If a machine comes from an alias, pass the same runtime explicitly:

```ts
import * as runtime from 'xstate-v6';
import { createGraphFromMachine } from '@statelyai/graph/xstate';

const machine = runtime.createMachine({
  initial: 'idle',
  states: { idle: { on: { GO: { target: 'done' } } }, done: { type: 'final' } },
});
const graph = createGraphFromMachine(machine, { runtime });
```

Event maps such as `{ GO: [{ ok: true }, { ok: false }] }` and arrays retain
defaults for other event types. Supplied cases replace defaults for their type.
For synthetic v6 events, a supplied case must also match the transition's fields.
Supplying an `xstate.after` case suppresses all default `xstate.after` cases,
including delays that the supplied case does not match.
An applicable empty case list throws. Set `eventMode: 'replaceDefaults'` to
explore only supplied cases.
Wildcard descriptors require concrete event cases and are not sent as invented
literal wildcard events. Synthetic v6 actor events retain their match fields.

`fromState` seeds exploration from an existing snapshot. For v5 snapshots whose
behavior depends on actor identity strings, pass `actorIdentity: actor` alongside
`fromState: actor.getSnapshot()`. Exploration copies only `id` and `sessionId`
onto an isolated actor. It does not reuse the live actor or its system.
Reference equality, the original actor's `getSnapshot()`, and system lookups
are not preserved. `actorIdentity` is rejected for v6 machines.

Transition failures
include the source identity and event, with the original failure as `cause`.
`limit` bounds expanded active states; exceeding it throws. Terminal snapshots
are retained without expansion. The queue uses an index rather than shifting
its remaining frontier on every step.

`graph.data.exploration` reports its event-case scope, stop boundaries,
initial microstep transitions, and whether transition attribution was available.
These are observed behavioral edges for supplied event cases. Complete source
transition coverage additionally needs an independently extracted obligation
universe; a sampled graph cannot supply that denominator by itself.

For source-backed coverage with an independent denominator, see
[source transition coverage](source-coverage.md).
