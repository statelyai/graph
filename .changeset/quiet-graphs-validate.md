---
'@statelyai/graph': minor
---

Add semantic graph validation via `validateGraph()`, covering shape plus graph
invariants such as duplicate ids, dangling edges, missing parents, invalid
initial nodes, duplicate ports, invalid port references, and parent cycles.

Default missing graph, node, edge, and port `data` values to `null` when
creating resolved graph objects.

Refresh format fidelity claims and conformance tests for ELK, xyflow, and
Mermaid state round-tripping, and expand algorithm benchmarks across sparse,
dense, compound, multi-edge, and port-heavy graphs.
