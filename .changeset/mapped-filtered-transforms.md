---
'@statelyai/graph': minor
---

Add `getMappedGraph()` and `getFilteredGraph()` structural transforms. `getMappedGraph()` returns a new graph with node/edge `data` transformed by mapping functions while preserving all structure; `getFilteredGraph()` returns a new graph keeping only nodes and edges that pass the given predicates, dropping incident edges of removed nodes. `getSubgraph()`, `getReversedGraph()`, and the new transforms now also preserve graph-level `direction` and `style`.
