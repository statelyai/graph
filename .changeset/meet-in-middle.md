---
'@statelyai/graph': patch
---

Bidirectional Dijkstra for single-pair queries + airtight negative-weight enforcement:

- **`getShortestPath` now runs bidirectional Dijkstra** (forward on traversable arcs, backward on reverse arcs, Pohl termination). On a 50k-node/200k-edge random graph a point query dropped 58 ms → 0.8 ms; in the cross-library harness this is now 2.2× faster than graphology's bidirectional implementation (previously 60× slower). Same results — one shortest path, ties broken arbitrarily as before; `{ algorithm: 'bellman-ford' }` keeps the full search for negative weights.
- **Negative-weight detection is now up-front for sublinear searches** (single-pair, early-exit, A*): O(1) via a flag cached on the CSR build for default weights, one O(edges) sweep for custom `getWeight`. Previously a sublinear search could terminate without scanning a reachable negative edge and silently return a wrong path. Corner-case behavior change: these queries now throw even when the negative edge is *unreachable* from the source — deterministic failure instead of result-dependent behavior.
