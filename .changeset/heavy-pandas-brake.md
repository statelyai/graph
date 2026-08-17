---
'@statelyai/graph': minor
---

Large performance overhaul of the algorithm hot paths:

- `getStronglyConnectedComponents` is now an iterative typed-array Tarjan over the CSR (stack-safe, ~15x faster).
- `getTopologicalSort` is a CSR Kahn's pass with cached in-degrees (~4x faster, no more O(n²) queue).
- `isBipartite`/`getMaximumBipartiteMatching` 2-color directly over the cached CSR with no per-call adjacency rebuild (~60x faster on repeated queries).
- Bellman-Ford (`algorithm: 'bellman-ford'`) relaxes cached compact arc arrays; single-pair queries skip tie-predecessor bookkeeping entirely (~15x faster).
- Floyd-Warshall all-pairs uses a flat distance matrix with copy-on-write tie-predecessor lists and O(length) path materialization (~4x faster).
- `genBFS`/`genDFS`/`genPostorder` are hand-rolled chunked iterators (identical order and laziness semantics, no generator resume machinery; ~1.5-2x faster full traversals), and traversal snapshots now reuse the CSR's node snapshot instead of copying `graph.nodes` per call.
- Dijkstra / A* / bidirectional search read default edge weights from a cached per-arc `Float64Array` instead of loading edge objects in the inner loop.
- `getDegree` serves from a per-version degree map (one hashed lookup per call), and repeated indexed queries against the same graph skip the WeakMap via a one-entry memo.
- All-targets shortest-path reconstruction (`genShortestPaths`) materializes each path once via a shared backtracking buffer instead of per-level array spreads.

