---
'@statelyai/graph': minor
---

Add `@statelyai/graph/xstate` with `createGraphFromMachine(machine, options?)`: one machine→graph path that enumerates events from the machine's own descriptors, serializes nodes as `{ value, context }` (same ids as `xstate/graph`), and attaches guard text (`hypothesized: true`), actions, and selected transition definitions to edges. `getCoverageTargets` on the result yields stable state / transition / transition-pair targets. `xstate` v5 is an optional peer dependency.
