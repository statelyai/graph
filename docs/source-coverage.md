# Source-backed transition coverage

Use a source manifest to define the obligation universe before exploring event
cases. A graph built only from observed cases cannot establish that denominator.
The optional `@statelyai/sdk/source-coverage` entry supplies manifests and
instrumentation; `@xstate/test` supplies v6 sessions. The graph library owns
coverage accounting, search and path/witness reduction without depending on a
compiler or interpreter.

```ts
import {
  getSourceCoverageWitnesses,
  getSourceCoverageReplay,
} from '@statelyai/graph';
import { createSourceCoverageSession } from '@xstate/test';

const createSession = (input) =>
  createSourceCoverageSession(machine, control, {
    input,
    runtimeId: 'xstate@6.0.0-alpha.70',
  });
const result = await getSourceCoverageWitnesses({
  manifest,
  createSession,
  events: [{ type: 'START' }, { type: 'PAY', amount: 5 }],
  suggestEvents: async ({ state, prefix, uncovered }) => {
    // Return validated generator/LLM candidates for missing predicates.
    return [];
  },
  maxStates: 10000,
  maxDepth: 32,
  maxExecutions: 100000,
});
for (const fixture of result.witnesses) {
  await getSourceCoverageReplay(manifest, fixture, createSession);
}
```

`machine` and the file-local `control` come from the instrumented module loaded
by a trusted execution host. Sessions calculate each step once. They expose
`runtimeId`, `initial`, `step(event)` and optional `close()`. A step contains a
behavior-preserving `stateId`, the snapshot, observed source outcome IDs and a
terminal flag. The snapshot type is preserved for event generation callbacks.
Custom session identities must preserve every distinction affecting future
behavior. The supplied XState adapter includes state inputs and remembered
history. It leaves external effects unexecuted; use a SUT harness to check real
integration behavior.

`genSourceCoverageWitnesses` asynchronously yields newly discovered witnesses;
consume it through completion to obtain its final report. Its `get` counterpart
returns that final report and reduced suite. Stopping the iterator closes active
sessions. `getReducedSourceCoverageWitnesses` and its `gen` counterpart retain
every witnessed obligation while reducing redundant fixture runs.

`getMinimizedSourceCoverageWitness` deletes event chunks and optionally uses
`shrinkEvent(event)` to shrink payloads. Each candidate must reproduce the
original required observations. An execution budget bounds shrinking; the
result reports whether that budget was reached. Shrinkers should propose
simpler JSON-serializable payloads, and the execution host should enforce their
schemas and input policies.

`getSourceCoverageReport` reports witnessed IDs against the complete source
manifest, including zero-hit obligations. Counts are the number of retained
witnesses containing an outcome. Unknown IDs, mismatched machine identity,
mixed runtimes and stale source hashes fail instead of reducing the denominator.
Reading witness JSON is not execution verification; replay it with a trusted
session factory before treating a saved report as current evidence.

Complete transition-outcome coverage means extraction was complete and every
required outcome has an execution witness. Separate return sites and finite
target alternatives remain separate even when their destinations coincide;
refusals have their own outcome kind. It does not establish all condition
combinations, context values, event sequences or schedules. Search bounds may
stop exploration, but exhausting a bound is never an unreachability proof.
An incomplete extraction remains incomplete even when every known obligation
was observed. Suggestions alone never count as evidence.

The data-only protocol is version 1, with SHA-256 source identity and an explicit
execution runtime identifier. `tests/fixtures/source-coverage.json` is shared
with Viz and XState as a conformance fixture. It includes two same-target
branches, refusal, event setup and an eventless transition.

Search covers `machineIndex` (default 0). Known observations from other machines
in the same source module are excluded from that witness, while unknown IDs
still fail. Combine per-machine witnesses against the full manifest to report
file-wide coverage.
