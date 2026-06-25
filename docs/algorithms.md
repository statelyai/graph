# Algorithms reference

Every algorithm is a standalone prefixed function over a plain-JSON `Graph` — no classes, no wrappers. Expensive multi-result functions come in `gen*` (lazy generator, early-exit friendly) / `get*` (eager array, `return [...gen*()]`) pairs; hot paths run on a cached CSR (compressed-sparse-row) snapshot, and every traversal honors each edge's *effective* mode (`getEdgeMode`: per-edge `mode` override, else `graph.mode`), so mixed directed/undirected graphs behave correctly throughout.

See [README.md](../README.md#algorithms) for a tour, [./layout.md](./layout.md) for the visual side, and [./benchmarks.md](./benchmarks.md) for numbers.

Conventions: `n` = nodes, `m` = edges, `k` = iterations. Default edge weight is `edge.weight ?? 1`; weighted algorithms accept a `getWeight` accessor. Where a start node is optional (`options.from`), it defaults to `graph.initialNodeId`, then to the unique zero-in-degree node, else throws.

## Traversal & ordering

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `genBFS(graph, startId)` | Lazy breadth-first node visit | O(n + m) | CSR-backed generator. Mode-aware: non-directed edges traversable both ways. Unknown start yields nothing. |
| `genDFS(graph, startId)` | Lazy depth-first node visit | O(n + m) | Iterative (no recursion limit), CSR-backed. |
| `getPreorder(graph, opts?)` / `getPostorder(graph, opts?)` | One DFS pre/post ordering from `from` | O(n + m) | Deterministic: neighbors in index order. |
| `genPreorders(graph, opts?)` / `genPostorders(graph, opts?)` | All possible DFS pre/post orderings | exponential (output-sensitive) | Lazy; branches on every neighbor choice. `getPreorders`/`getPostorders` are the eager forms. |

## Connectivity & components

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `hasPath(graph, sourceId, targetId)` | Reachability | O(n + m) | BFS, mode-aware. `hasPath(g, a, a)` is `true`. |
| `isConnected(graph)` | Single weak component? | O(n + m) | Empty graph is connected. |
| `isTree(graph)` | Connected + acyclic + exactly `n − 1` edges | O(n + m) | Directed diamonds and parallel edges are not trees. Empty/single-node graphs are trees. |
| `getConnectedComponents(graph)` | Weakly-connected components | O(n + m) | Every edge connects regardless of mode/direction. CSR-backed. |
| `getStronglyConnectedComponents(graph)` | SCCs (Tarjan) | O(n + m) | Non-directed edges count as mutual reachability. Recursive — deep graphs may hit stack limits. |
| `getBridges(graph)` | Edges whose removal disconnects | O(n + m) | Treats the graph as undirected. Result sorted by id. |
| `getArticulationPoints(graph)` | Cut vertices | O(n + m) | Undirected semantics; sorted by id. |
| `getBiconnectedComponents(graph)` | Biconnected components (node arrays) | O(n + m) | Articulation points appear in multiple components. |

## Cycles & DAG

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `isAcyclic(graph)` | No cycles? | O(n + m) typical | Mixed graphs use polynomial fast paths (directed-only cycle, union-find on non-directed edges, singleton SCCs); only ambiguous multi-node SCCs fall back to exact simple-cycle enumeration (exponential worst case, scoped to that SCC). |
| `genCycles(graph)` / `getCycles(graph)` | All simple cycles as `GraphPath`s | exponential (output-sensitive) | Dispatches on the *effective* mode kind: directed (Johnson-style DFS), undirected (edge-id dedup — two parallel edges form a genuine 2-cycle; can't re-traverse the arrival edge), or mixed (exact search, each edge used at most once; correct but potentially expensive on dense mixed graphs). |
| `getTopologicalSort(graph)` | Topological order or `null` | O(n + m) | Returns `null` on any cycle *and* whenever any edge's effective mode isn't `'directed'` (undirected = mutual precedence = 2-cycle). |
| `getTransitiveReduction(graph)` | New graph with transitively-redundant edges removed | O(n·m) time, O(n²) reach memory | DAG-only: throws on a cycle or any non-directed edge. Exact-duplicate parallel edges collapse to the first in `graph.edges` order. Input not mutated. |
| `getDominatorTree(graph, opts?)` | `{ nodeId: idomId \| null }` rooted at `from` | near-linear (Cooper–Harvey–Kennedy iteration) | Root maps to `null`; unreachable nodes omitted. Mode-aware traversal. For statecharts: "which states must every path from the initial state pass through?" |

## Shortest paths

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getShortestPath(graph, { from, to, ... })` | One shortest path or `undefined` | sublinear in practice | Single-pair queries use **bidirectional Dijkstra** (frontiers meet long before a unidirectional search finishes); ties broken arbitrarily. Pass `algorithm: 'bellman-ford'` for negative weights (full search). |
| `genShortestPaths(graph, opts?)` / `getShortestPaths(...)` | *All* tied shortest paths from `from` (to `to`, or to every reachable node) | Dijkstra O((n + m) log n) + lazy reconstruction | Tie predecessors are recorded, so equal-cost alternatives are all yielded. With `to`, the search **early-exits** once everything at distance ≤ dist(target) settles. Paths are reconstructed on demand — abandoning the generator never pays for paths it didn't yield. Zero-weight cycles are handled (no revisits during reconstruction). |
| `getAStarPath(graph, { from, to, heuristic, ... })` | One heuristic-guided shortest path | O((n + m) log n), heuristic-dependent | Admissible heuristic ⇒ optimal path. |
| `getAllPairsShortestPaths(graph, opts?)` | Shortest paths between all pairs | Dijkstra-per-source (default) O(n(n + m) log n); `'floyd-warshall'` O(n³); `'bellman-ford'` O(n²m) | Floyd-Warshall throws on a negative cycle (self-distance < 0). Eager — output can be huge. |
| `genSimplePaths(graph, opts?)` / `getSimplePaths(...)` / `getSimplePath(...)` | All (or first) simple paths from `from` (optionally to `to`) | exponential (output-sensitive) | DFS with backtracking; without `to`, every non-empty simple path is yielded. |
| `getJoinedPath(headPath, tailPath)` | Concatenated `GraphPath` | O(steps) | Throws unless head ends where tail starts. |

**Negative-weight contract.** Dijkstra, A*, and the bidirectional/early-exit searches may legitimately finish without ever scanning a negative edge — so they assert "no negative weights" **up front**: O(1) via the CSR's cached `firstNegativeEdge` flag for the default weight, or one O(m) sweep when a custom `getWeight` is supplied. They throw with a pointer to `{ algorithm: 'bellman-ford' }` (O(n·m), handles negative edges; negative *cycles* still throw).

## Spanning trees

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getMinimumSpanningTree(graph, opts?)` | New `Graph` containing the MST/forest edges | Prim (default) O(m log m); `algorithm: 'kruskal'` O(m log m) | Mode-aware: non-directed edges are candidates in both directions; directed edges only source→target (Prim). All nodes are kept; weight from `opts.getWeight ?? edge.weight ?? 1`. |

## Centrality

All return `Record<nodeId, number>` (or `HITSResult`). Iterative methods take `{ alpha?, maxIterations? (100), tolerance? (1e-6) }`.

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getDegreeCentrality` / `getInDegreeCentrality` / `getOutDegreeCentrality` | Degree / n − 1 | O(n + m) | |
| `getClosenessCentrality(graph)` | Closeness over unweighted hops | O(n(n + m)) | Wasserman–Faust scaled by reachable fraction, so disconnected graphs are comparable. Directed/undirected per edge semantics. |
| `getBetweennessCentrality(graph)` | Brandes betweenness, normalized | O(n·m) | **Unweighted** shortest paths. Normalization keys off `graph.mode` (undirected scores halved), not per-edge modes. CSR typed-array implementation. |
| `getPageRank(graph, opts?)` | PageRank (power iteration) | O(k(n + m)) | `alpha` damping (0.85). Dangling mass redistributed uniformly; result sums to 1. |
| `getHITS(graph, opts?)` | `{ hubs, authorities }` | O(k(n + m)) | L2-normalized each iteration. |
| `getEigenvectorCentrality(graph, opts?)` | Eigenvector centrality | O(k·m) | `A + I` shift (networkx/graphology scheme) so bipartite graphs converge. Score flows along edge direction (fed by in-neighbors); optional `getWeight`. **Throws on non-convergence.** |
| `getKatzCentrality(graph, opts?)` | Katz: `x' = αAᵀx + β` | O(k·m) | Converges only for `alpha < 1/λ_max`; **throws on non-convergence** (default `alpha` 0.1, `beta` 1). L2-normalized. |

## Communities

All community algorithms treat the graph as **undirected** regardless of mode. Output communities are sorted (ids lexicographic, communities by first id) — deterministic.

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getLouvainCommunities(graph, opts?)` | Two-phase Louvain partition (`string[][]` of node ids) | ≈O(m) per pass, ≤ `maxPasses` (10) | Deterministic: `graph.nodes` order, no shuffling. Parallel-edge weights summed; self-loops count as internal weight. `resolution` γ > 1 favors smaller communities. |
| `getLabelPropagationCommunities(graph, opts?)` | LPA partition (`GraphNode[][]`) | O(k·m) | Without `seed`: synchronous, lexicographic tie-breaking (deterministic). With `seed`: classic asynchronous variant — shuffled order + random ties, mulberry32-seeded, **deterministic per seed**. |
| `genGirvanNewmanCommunities(graph, opts?)` | Lazy successive splits via edge-betweenness removal | O(n·m) per removal round | Yields a partition each time the component count grows; abandon early to skip deeper levels. |
| `getGirvanNewmanCommunities(graph, opts?)` | The split at `level` (default 1) | as above | `level <= 0` returns the connected components. |
| `getGreedyModularityCommunities(graph)` | Greedy modularity merging | very expensive (re-scores every pair per merge) | Small graphs only. |
| `getModularity(graph, communities)` | Modularity Q of a partition | O(m + Σ\|c\|²) | Undirected convention (degree counts both endpoints). |

## Flow & cuts

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getMaxFlow(graph, { from, to, getCapacity? })` | `{ value, flows, cutEdges }` | Edmonds–Karp O(n·m²) | Capacity defaults to `edge.weight ?? 1`; negative capacity throws. Directed edges carry flow source→target only; non-directed edges become two independent opposite arcs each with full capacity. `flows` is net flow per edge id (positive = source→target). Self-loops carry nothing. |
| `getMinCut(graph, { source, sink, getCapacity? })` | `{ value, cutEdges, partition }` | same solver | Max-flow-min-cut: `partition.source` = residual-reachable side (in `graph.nodes` order); `Σ cap(cutEdges) === value`. |

## Bipartite

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `isBipartite(graph)` | 2-colorability | O(n + m) | Edges treated as undirected; **self-loops make a graph non-bipartite**. |
| `getMaximumBipartiteMatching(graph)` | Maximum matching (`BipartiteMatch[]`) | Hopcroft–Karp O(m·√n) | Bipartition derived by 2-coloring. Throws if not bipartite, naming the conflicting edge. Matches report the realizing edge with its stored orientation; for parallel edges, the first one used wins. |

## Cores

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `getCoreNumbers(graph)` | Core number per node | O(m) (Batagelj–Zaveršnik bucket peeling) | **Undirected degree convention** — every edge contributes to both endpoints regardless of mode/direction; self-loops ignored. |
| `getKCore(graph, k)` | Node ids in the k-core | O(m) | `k <= 0` returns every node id; order follows `graph.nodes`. |

## Isomorphism & equivalence

| Function | Computes | Complexity | Notes |
|---|---|---|---|
| `isIsomorphic(graphA, graphB, opts?)` | Structural isomorphism | exponential worst case (degree-signature-pruned backtracking) | Degree signatures count per *effective* edge mode (in/out for directed, one undirected incidence otherwise), so per-edge overrides participate. Optional `nodeMatch`/`edgeMatch` refine with payloads. |
| `areEntitiesEqual(a, b, keys?)` | Key-wise node/edge equality | O(keys) | Objects compared by JSON stringification. |
| `isLayoutEqual(a, b)` / `isNonLayoutEqual(a, b)` | Equality on `LAYOUT_KEYS` / everything else | O(keys) | Layout keys: `x`, `y`, `width`, `height`, `points`, … — useful for "did layout actually change?" checks. |

## Random walks (model-based testing)

Walk generators yield `GraphStep`s lazily and honor effective edge modes (non-directed edges traversable both ways). All accept `seed` (mulberry32 — deterministic per seed; `Math.random` otherwise), `from`, and an edge `filter(edge, ctx)`.

| Function | Behavior | Notes |
|---|---|---|
| `genRandomWalk(graph, opts?)` | Uniform random edge each step | Infinite until a sink (no traversable edges) is reached. |
| `genWeightedRandomWalk(graph, opts?)` | Probability ∝ `getWeight` (`edge.weight ?? 1`) | Negative weights clamp to 0; all-zero stops the walk. |
| `genQuickRandomWalk(graph, opts?)` | Targets unvisited edges; BFS-hops to the nearest one when stuck | Ends when no unvisited edge is reachable — fast edge coverage. |
| `genPredefinedWalk(graph, edgeIds, opts?)` | Replays an explicit edge-id sequence | Throws on a missing or non-adjacent edge. |
| `genWalkSteps(gen, n)` / `genWalkUntilNode(gen, id)` / `genWalkUntilEdge(gen, id)` | Stop-condition wrappers | Compose around any step generator. |
| `genWalkUntilNodeCoverage(gen, graph, c, opts?)` / `genWalkUntilEdgeCoverage(gen, graph, c)` | Stop at coverage fraction `c` (0–1) | Start node counts as visited for node coverage. |
| `getCoverage(graph, steps, opts?)` | `CoverageStats` for a completed walk | Node/edge coverage ratios + visited ids. |

## Graph generators

| Function | Creates | Notes |
|---|---|---|
| `createCompleteGraph(n, opts?)` | K_n, undirected | Nodes `n0..`, edges `e0..`; `idPrefix` overrides. |
| `createGridGraph(rows, cols, opts?)` | Grid with right/down neighbors, undirected | Nodes `n{r}_{c}`. |
| `createRandomGraph(n, p, opts?)` | Erdős–Rényi G(n, p), undirected | Deterministic per `seed` (mulberry32). |

## Queries (headline)

`src/queries.ts` holds O(1)/O(deg) indexed lookups rather than algorithms — neighborhood (`getNeighbors`, `getSuccessors`, `getPredecessors`, `getEdgesOf`, `getInEdges`, `getOutEdges`, `getEdgesBetween`), degree (`getDegree`, `getInDegree`, `getOutDegree`), hierarchy (`getChildren`, `getParent`, `getAncestors`, `getDescendants`, `getRoots`, `getSiblings`, `getDepth`, `getLCA`, `isCompound`, `isLeaf`), endpoints (`getSources`, `getSinks`), BFS hop-distance maps (`getRelativeDistanceMap`, `getRelativeDistance`), and ports (`getPort`, `getPorts`, `getEdgesByPort`). All collection queries return `[]` (never `undefined`) when empty. `getGraphIssues(graph)` validates referential integrity (dangling endpoints, missing parents, …) without throwing.

## Performance notes

- **CSR snapshot.** Hot loops (BFS/DFS, components, shortest paths, centrality, cores, bipartite) run on a compressed-sparse-row snapshot of the graph's *traversable arcs* (`src/algorithms/csr.ts`): flat `Int32Array`s addressed by node position, so traversal pays no string hashing or Map lookups. Directed edges contribute one arc; non-directed edges contribute both. It also caches a `firstNegativeEdge` flag for O(1) negative-weight assertions.
- **Auto-invalidation.** The CSR is cached per `GraphIndex` and revalidated against the index `version` and `graph.mode` — O(1) per access. Replacing `nodes`/`edges` arrays, length changes, and all `add*`/`delete*`/`update*` API mutations are detected automatically.
- **`invalidateIndex(graph)`** is only needed after *direct in-place field mutation* (e.g. `edge.sourceId = 'x'`, `node.parentId = 'y'`), which is not O(1)-detectable. The same staleness contract covers both the index and the CSR.
- Algorithm results are differential-tested against graphology on seeded random graphs; see [./benchmarks.md](./benchmarks.md) for throughput comparisons.
