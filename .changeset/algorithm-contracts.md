---
"@statelyai/graph": minor
---

Tighten algorithm contracts:

- **Breaking:** `getMinCut` takes `{ from, to }` (was `{ source, sink }`) and returns `cutEdges` as edge objects, matching `getMaxFlow`.
- **Breaking:** unknown node ids are "not found" instead of errors or fabricated results. `getMaxFlow`, `getMinCut`, and `getSteinerTree` return `undefined` (`getSteinerTree` also when the terminals are disconnected), `getDominatorTree` returns `{}`, `hasPath(g, x, x)` is `false` for an unknown `x`, and path queries no longer yield a trivial self-path for an unknown source.
- **Breaking:** `getDegree` counts every self-loop twice, including non-directed ones, so degrees sum to `2 × edges.length`.
- `hasPath` accepts `{ direction }` and runs on the CSR snapshot.
- `isAcyclic` is iterative, so deep graphs no longer overflow the call stack, runs in O(n + m) for graphs mixing directed and non-directed edges (previously exponential in the worst case), and is cached until the graph changes.
- `genCycles` is now lazy: Johnson's algorithm per biconnected block, iterative, O((n + m) · (cycles + 1)). Taking the first cycle of a dense graph no longer enumerates all of them first, and long cycles no longer overflow the call stack. Cycle order may differ.
- New `getCycle` returns one cycle (or `undefined`) in O(n + m).
- **Breaking:** `isTree` returns `false` for the empty graph. It ignores edge direction (`a → c ← b` is a tree).
- New `isArborescence` checks for a rooted tree whose edges all point away from the root, optionally at `{ from }`.
- New `genTopologicalSort`; both topological sorts accept `{ from }` to emit chosen nodes first.
- Lazy generators (`genShortestPaths`, `genSimplePaths`, `genCycles`, `genAllPairsShortestPaths`, `genShortestSimplePaths`, `genPreorders`, `genPostorders`, `genGirvanNewmanCommunities`) no longer return wrong results or crash when the graph is mutated mid-iteration.
- **Breaking:** `getDepth` returns `undefined` (was `-1`) for an unknown node, and `isLeaf`/`isCompound` return `false` for one.
- `isIsomorphic` is a VF2-style matcher: breadth-first matching order, candidates from neighbors of matched nodes, O(degree) checks, iterative. Large sparse graphs that previously never finished now take milliseconds. It also no longer pairs a directed self-loop with a non-directed one, and pairs parallel edges exactly under `edgeMatch` instead of greedily.
- No more call-stack overflows on deep inputs: `genSimplePaths`/`getSimplePath`, tied shortest-path reconstruction (`genShortestPaths`, Floyd–Warshall), `getDescendants`, `deleteNode` cascades, `getFlattenedGraph`, `getTransitiveReduction`, and maximum bipartite matching are iterative.
- `genPreorders`/`genPostorders` backtrack with an undo log instead of copying state per step (a chain no longer costs O(n²)), and no longer drop orders that end at a dangling edge. `getPreorder` no longer rescans neighbors when returning to a node.
- `getTransitiveReduction` no longer crashes on an edge from a missing node.
- Fix a memory leak: the graph index no longer keeps a `WeakRef` memo, which kept every graph indexed during one synchronous call alive until it returned (e.g. ~2.8 GB for `getShortestSimplePaths` on a 3,000-node chain, now ~200 MB).
- `getModularity` runs in O(n + m) (was quadratic in community size), ignores dangling edges, and tolerates unknown ids in communities.
- `getFlattenedGraph` runs in linear time on deep hierarchies (was quadratic) by resolving leaf ranges and initial states once.
- `getMaxFlow`/`getMinCut` and `getGreedyModularityCommunities` no longer crash on dangling edges; random walks no longer step onto them.
- **Breaking:** `getTSPTour` returns `undefined` for an unknown `from` (previously started at the first node); `genPredefinedWalk` yields nothing from an unknown start; `getCoverage` no longer counts an unknown start node as visited.
