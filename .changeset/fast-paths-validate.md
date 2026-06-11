---
'@statelyai/graph': minor
---

CSR pathfinding, polynomial mixed-graph acyclicity, and malformed-input hardening:

- **Pathfinding on the CSR core.** Dijkstra/BFS shortest paths and A* now run on the compressed-sparse-row snapshot. Measured on 50k nodes / 200k edges: single-target `getShortestPath` 329 → 58 ms (5.7×), `getAStarPath` 27 → 7 ms (3.8×), all-targets `getShortestPaths` 514 → 342 ms (reconstruction-bound). Results unchanged (validated by the differential Dijkstra oracle).
- **`isAcyclic` on mixed graphs is now polynomial in practice**: cycles among directed edges alone, cycles among non-directed edges alone (union-find), and the all-singleton-SCC case resolve without enumeration; only ambiguous multi-node SCCs fall back to exact simple-cycle search, restricted to that SCC. A 30-diamond acyclic mixed graph (2^30 simple paths) that previously hung now resolves instantly.
- **New `getGraphIssues(graph)`** (core export, zod-free): structural invariant checking — duplicate ids, dangling edge endpoints, missing parents, parent cycles (reported once per cycle), missing initial nodes, duplicate port names, invalid port references — with entity-naming messages and machine-readable codes. The recommended gate for untrusted/imported graphs; `@statelyai/graph/schemas`' `validateGraph` now delegates its invariant portion to it.
- **Hierarchy queries terminate on malformed parent cycles**: `getAncestors`, `getDescendants`, `getDepth`, and `getLCA` previously hung forever on authored `parentId` cycles; each now stops at the first repeated node (documented convention).
- **mermaid/state:** user nodes whose ids merely contain `_region_` (e.g. `foo_region_bar`) are no longer mistaken for parallel-region markers and dropped — region detection now requires the exact structural pattern under a parallel parent.
