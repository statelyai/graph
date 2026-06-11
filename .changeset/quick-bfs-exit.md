---
'@statelyai/graph': patch
---

Benchmark-driven pathfinding/traversal performance:

- `bfs`/`dfs` generators run on the CSR snapshot — a full BFS sweep over a 100k-node/300k-edge graph dropped from 623 ms to 4.4 ms, now the fastest of the five libraries measured (graphology, ngraph, graphlib, cytoscape) instead of the slowest.
- Single-target `getShortestPath`/`getShortestPaths({ to })` early-exit the Dijkstra/BFS search once everything at the target's distance is settled (all equal-cost tie paths, including through zero-weight edges, are preserved — tested). Random-graph single-pair queries dropped ~2× on top of the earlier CSR gains.

Also adds `pnpm bench:compare` — a reproducible cross-library benchmark harness (seeded identical graphs across 4 shapes × 3 sizes, idiomatic public APIs, median-of-runs, markdown/JSON reports in `bench/compare/results/`).
