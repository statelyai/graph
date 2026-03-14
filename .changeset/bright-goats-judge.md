---
"@statelyai/graph": patch
---

Fix schema and GraphML serialization drift, optimize weighted graph algorithms, and make `genSimplePaths()` truly lazy.

- add `weight` to `EdgeSchema` and tighten schema drift tests against the runtime graph types
- preserve graph, node, and edge metadata in GraphML round-trips, including `initialNodeId`, `direction`, `style`, geometry, and edge `weight`
- use a heap-backed priority queue for weighted shortest paths, A*, and Prim MST
- refactor `genSimplePaths()` to yield incrementally instead of collecting all paths before returning
