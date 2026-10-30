---
'@statelyai/graph': minor
---

Support XState v6 machine graphs alongside v5. Preserve state inputs and remembered history in snapshot IDs, include resolved eventless and raised-event transitions in edge metadata, and expose event-case maps, explicit default replacement, starting snapshots and exploration metadata. Pass `runtime` when using an aliased XState runtime. Transition functions are evaluated once per explored event and external effects are not executed.

Canonicalize history record order and report missing initial transition attribution. Pass `actorIdentity` with a v5 starting snapshot to preserve actor ID and session ID comparisons during isolated exploration.
