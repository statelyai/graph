---
'@statelyai/graph': patch
---

Pathfinding internals: lazy path materialization and a typed-array heap. `genShortestPaths` now reconstructs a path only when it is actually yielded (abandoning the generator early skips the work), and the Dijkstra/A*/bidirectional hot loops use a Float64Array/Int32Array binary heap instead of object nodes. Same API, same results — measured −70% on first-path-then-stop, −41% on all-targets, −71% on single-target early exit (10k-node graph).
