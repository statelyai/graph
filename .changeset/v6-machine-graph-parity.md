---
'@statelyai/graph': minor
---

Support XState v6 machine graphs alongside v5. Preserve state inputs and remembered history in snapshot IDs, include resolved eventless and raised-event transitions in edge metadata, and expose event-case maps, explicit default replacement, starting snapshots and exploration metadata. Pass `runtime` when using an aliased XState runtime. Transition functions are evaluated once per explored event and external effects are not executed.
