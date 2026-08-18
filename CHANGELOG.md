# @statelyai/graph

## 2.3.0

### Minor Changes

- [#34](https://github.com/statelyai/graph/pull/34) [`5a8eef6`](https://github.com/statelyai/graph/commit/5a8eef6b93d06e153d6a72526d85cf91a37128e2) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Large performance overhaul of the algorithm hot paths:

  - `getStronglyConnectedComponents` is now an iterative typed-array Tarjan over the CSR (stack-safe, ~15x faster).
  - `getTopologicalSort` is a CSR Kahn's pass with cached in-degrees (~4x faster, no more O(n²) queue).
  - `isBipartite`/`getMaximumBipartiteMatching` 2-color directly over the cached CSR with no per-call adjacency rebuild (~60x faster on repeated queries).
  - Bellman-Ford (`algorithm: 'bellman-ford'`) relaxes cached compact arc arrays; single-pair queries skip tie-predecessor bookkeeping entirely (~15x faster).
  - Floyd-Warshall all-pairs uses a flat distance matrix with copy-on-write tie-predecessor lists and O(length) path materialization (~4x faster).
  - `genBFS`/`genDFS`/`genPostorder` are hand-rolled chunked iterators (identical order and laziness semantics, no generator resume machinery; ~1.5-2x faster full traversals), and traversal snapshots now reuse the CSR's node snapshot instead of copying `graph.nodes` per call.
  - Dijkstra / A\* / bidirectional search read default edge weights from a cached per-arc `Float64Array` instead of loading edge objects in the inner loop.
  - `getDegree` serves from a per-version degree map (one hashed lookup per call), and repeated indexed queries against the same graph skip the WeakMap via a one-entry memo.
  - All-targets shortest-path reconstruction (`genShortestPaths`) materializes each path once via a shared backtracking buffer instead of per-level array spreads.

## 2.2.0

### Minor Changes

- [#32](https://github.com/statelyai/graph/pull/32) [`3baa78c`](https://github.com/statelyai/graph/commit/3baa78c00487a847f317b2a33d0ac2201f395cda) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add lazy, multi-source, directional, radius-limited postorder traversal. Keep
  active traversal structure stable across graph mutations and reject non-finite
  A-star heuristic values.

- [`e4a800e`](https://github.com/statelyai/graph/commit/e4a800ed5855778297a6ba61993376677c8d5449) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add immutable counterparts for graph CRUD, patch application, and layout geometry updates. These helpers return updated graph copies while leaving their input graphs untouched.

- [`7b5ac38`](https://github.com/statelyai/graph/commit/7b5ac385d7d6fb7f5c2458dff9cc4440c523f268) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add graph-generic path-set and coverage utilities: path inspection and
  containment, coverage targets and coverage-preserving reduction, edge-covering
  path planning, ordered shortest simple paths, Eulerian paths/circuits, and line
  graph construction.

- [#31](https://github.com/statelyai/graph/pull/31) [`0bd1016`](https://github.com/statelyai/graph/commit/0bd10163ddce5820bf295da04f13cf54fd14877d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add multi-source, directional, radius-limited BFS and DFS; induced neighborhood subgraphs; and graph union, intersection, difference, symmetric difference, disjoint union, and complement operations.

- [`97622b1`](https://github.com/statelyai/graph/commit/97622b193462a1ae67f485d934a4efafe0921e9c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - New algorithms, public kernel, cancellation, and format fidelity:

  - **New algorithms**: `isPlanar` (left-right planarity test), `getTSPTour`
    (nearest-neighbor + 2-opt), `getSteinerTree` (metric-closure
    2-approximation), `getGraphColoring`/`isValidColoring` (Welsh–Powell and
    DSatur), `genAllPairsShortestPaths` (lazy gen twin of
    `getAllPairsShortestPaths`).
  - **New generators**: `createWattsStrogatzGraph`, `createBarabasiAlbertGraph`.
  - **New `@statelyai/graph/kernel` subpath**: `getIndex`, `getCSR`,
    `invalidateIndex`, and `memoizeByGraph` — the fast-path primitives for
    large graphs and third-party algorithm plugins.
  - **Cancellation**: expensive algorithms (centrality, community detection,
    max-flow, all-pairs paths, isomorphism, dominators) accept
    `options.signal: AbortSignal`.
  - **Round-trip fidelity**: DOT preserves graph attributes, node/edge
    defaults, `rank=same`, HTML labels, and compass points; Mermaid preserves
    `%%{init}%%` directives, click handlers, linkStyle (now index-stable),
    state notes, mindmap `::icon()`, and block arrow tokens.
  - **Fix**: `getAllPairsShortestPaths` no longer overflows the call stack on
    graphs with a few hundred nodes.
  - **Benchmarks**: reproducible via `pnpm bench:compare` (`--quick` variant,
    JSON results, generated docs tables, fairness notes).

- [#33](https://github.com/statelyai/graph/pull/33) [`66b3828`](https://github.com/statelyai/graph/commit/66b38287d0d66be0f5ccaae69ff1a21872e366e9) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add `getMappedGraph()` and `getFilteredGraph()` structural transforms. `getMappedGraph()` returns a new graph with node/edge `data` transformed by mapping functions while preserving all structure; `getFilteredGraph()` returns a new graph keeping only nodes and edges that pass the given predicates, dropping incident edges of removed nodes. `getSubgraph()`, `getReversedGraph()`, and the new transforms now also preserve graph-level `direction` and `style`.

## 2.1.0

### Minor Changes

- [#28](https://github.com/statelyai/graph/pull/28) [`0498d52`](https://github.com/statelyai/graph/commit/0498d52e7f55e9aa495d5870ab59a54613b75f6c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Layout suite round two: transitions, geometry utilities, portable constraints, and four more engines.

  - **`genLayoutTransition(from, to, options?)`** (`@statelyai/graph/layout`, zero-dep) — tween between two layouts of the same graph: yields interpolated `LayoutFrame`s (drive with `applyLayoutFrame`, one per animation frame) and returns the target layout. Lay out with one engine, re-lay out with another, morph live. Options: `steps` (default 30), `ease` (default smoothstep).
  - **Geometry utilities** (`@statelyai/graph/layout`) — `translateGraph(graph, dx, dy)` and `centerGraph(graph, rect)` (**mutable**, in place): shift/center node positions, edge route `points`, and edge label rects. Hierarchy-aware — parent-relative children and container-relative edge routes are left alone.
  - **`LayoutOptions.constraints`** — portable, advisory layout constraints. First constraint: `layer(node)` assigns nodes to ordered layers along the flow axis. ELK maps it to partitions (`elk.partitioning.partition`); the Graphviz `dot` engine maps it to `{ rank=same; … }` groups; engines without a layer concept ignore it.
  - **`@statelyai/graph/layout/forceatlas2`** — `getForceAtlas2Layout` (sync; optional peers `graphology` + `graphology-layout-forceatlas2`): seeded determinism, native pinning via `isFixed`, edge `weight` influence.
  - **`@statelyai/graph/layout/d3-hierarchy`** — `getTidyTreeLayout` (sync; optional peer `d3-hierarchy`): Reingold–Tilford tidy tree. Root from `rootId` → `initialNodeId` → unique source; forests supported; non-tree extra edges preserved (spanning-tree layout).
  - **`@statelyai/graph/layout/webcola`** — `getColaLayout` (sync; optional peer `webcola`): constraint-based layout with overlap avoidance, seeded determinism, `isFixed` pinning, DAG flow via `direction`.
  - **`@statelyai/graph/layout/cytoscape`** — `getCytoscapeLayout` (async; optional peer `cytoscape`, headless): bridges cytoscape's layout ecosystem (`grid`, `circle`, `concentric`, `breadthfirst`, `cose`, plus caller-registered extensions via the injectable `cy` option). Compound nodes map to cytoscape parents.

  The package smoke test exercises all nine layout entry points against the packed tarball.

- [#28](https://github.com/statelyai/graph/pull/28) [`0498d52`](https://github.com/statelyai/graph/commit/0498d52e7f55e9aa495d5870ab59a54613b75f6c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Analytical coverage tail: cores, Katz, bipartite matching, min-cut, seeded label propagation, and graph generators.

  - **k-core** — `getCoreNumbers(graph)` (Batagelj–Zaveršnik, O(m)) and `getKCore(graph, k)`; degrees are undirected per the standard definition.
  - **Katz centrality** — `getKatzCentrality(graph, { alpha, beta, getWeight, ... })`; throws a descriptive error when `alpha` exceeds the spectral bound and iteration diverges.
  - **Eigenvector centrality** hardened — `(A+I)`-shifted power iteration (no more bipartite oscillation), `getWeight` support, descriptive non-convergence error. Differentially tested against graphology.
  - **Bipartite** — `isBipartite(graph)` and `getMaximumBipartiteMatching(graph)` (Hopcroft–Karp, O(m√n)); the non-bipartite error names the edge that closes the odd cycle.
  - **Min-cut** — `getMinCut(graph, { source, sink, getCapacity? })` → `{ value, cutEdges, partition }`, sharing the max-flow solver (`value` always equals `getMaxFlow(...)` by construction).
  - **Seeded label propagation** — `getLabelPropagationCommunities` gains `seed`: asynchronous LPA with seeded shuffling/tie-breaking, deterministic per seed.
  - **Generators** — `createCompleteGraph(n)`, `createGridGraph(rows, cols)`, `createRandomGraph(n, p, { seed })` (G(n,p), deterministic per seed) in the root export.

- [#25](https://github.com/statelyai/graph/pull/25) [`e1e2107`](https://github.com/statelyai/graph/commit/e1e2107f2fd0b4788d224f07ff010e30e748d0b4) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Pluggable layout: a renderer-agnostic layout contract with adapters for ELK, Graphviz, dagre, and d3-force — no layout algorithms of our own, just typed plug-and-play over the plain-JSON graph.

  - **Model:** edges gain `points?: {x,y}[]` (route waypoints incl. endpoints, tail→head) and `routing?: 'polyline' | 'orthogonal' | 'splines'` (`splines` = Graphviz 3n+1 bezier control-point convention). Both round-trip through every full-fidelity format, diff/patch, and `LAYOUT_KEYS`. Edge `x/y/width/height` are now canonically the **edge-label rect** (top-left + size) — engines read `width`/`height` as label dimensions and write computed label positions back; this matches dagre's own convention and was previously undefined.
  - **`@statelyai/graph/layout`** (zero-dep): `LayoutFn`/`IterativeLayoutFn`/`LayoutFrame`/`LayoutOptions` (direction, spacing, `measure` for renderer-owned text measurement, `isFixed` pinning, `seed`), plus `applyLayoutFrame` (per-animation-frame position writes, safe under the index contract), `getLayoutBounds`, `getNodeSize`.
  - **`@statelyai/graph/layout/elk`** — `getElkLayout` (async; optional peer `elkjs`): hierarchy + ports first-class, orthogonal edge routes captured into `points`, computed edge label rects, all ELK algorithms via `algorithm`/`layoutOptions`, injectable ELK instance for web workers. (`fromELK` now also captures routed sections and label geometry for anyone running ELK manually.)
  - **`@statelyai/graph/layout/dagre`** — `getDagreLayout` (sync; optional peer `@dagrejs/dagre`): polyline routes, label rects, multigraph parallel edges, compound support.
  - **`@statelyai/graph/layout/d3-force`** — `genForceLayout` generator (one simulation tick per `next()`, caller owns pacing/cancellation; yields `LayoutFrame`s, returns the settled `VisualGraph`) + `getForceLayout`; seeded determinism (same seed ⇒ same layout), `isFixed` pinning; optional peer `d3-force`.
  - **`@statelyai/graph/layout/graphviz`** — `getGraphvizLayout` (async WASM; optional peer `@hpcc-js/wasm-graphviz`): all eight Graphviz engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork), spline control points into `points`/`routing: 'splines'`, label positions, y-flip/center→top-left conversion handled.

  The package smoke test exercises every adapter against the packed tarball.

- [#28](https://github.com/statelyai/graph/pull/28) [`0e5982a`](https://github.com/statelyai/graph/commit/0e5982a0662d72a7cff89e1e73d8d4023f98aa2d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - xyflow: labels now land where the renderers actually read them. `toXYFlow` emits edge labels as the top-level `edge.label` (the prop React Flow / Svelte Flow render — previously the label went to `edge.data.label`, which built-in edges ignore) and node labels as `data.label` (what React Flow's default node renders). `fromXYFlow` reads both spots back for external React Flow input, and full-fidelity round-tripping via the `__statelyai` metadata is unchanged. If you relied on `edge.data.label` in `toXYFlow` output, read `edge.label` instead.

### Patch Changes

- [#28](https://github.com/statelyai/graph/pull/28) [`0e5982a`](https://github.com/statelyai/graph/commit/0e5982a0662d72a7cff89e1e73d8d4023f98aa2d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - `getDegree` is now O(1) per call: `|out| + |in|` corrected by a cached per-node count of non-directed self-loops (revalidated by index version + graph mode, like the CSR snapshot). A full degree sweep over a 100k-node/300k-edge graph drops from ~148 ms to ~10 ms — at parity with ngraph and graphology, which was the one benchmark cell this library lost across the board.

- [`a9d5a4b`](https://github.com/statelyai/graph/commit/a9d5a4b649e9c73351352d76f06f9569b9f82f91) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Allow nullable `initialNodeId` config inputs in TypeScript, mark the package as side-effect free for bundlers, and add repo-wide type/convention checks to the verification gate.

- [#28](https://github.com/statelyai/graph/pull/28) [`0498d52`](https://github.com/statelyai/graph/commit/0498d52e7f55e9aa495d5870ab59a54613b75f6c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Pathfinding internals: lazy path materialization and a typed-array heap. `genShortestPaths` now reconstructs a path only when it is actually yielded (abandoning the generator early skips the work), and the Dijkstra/A\*/bidirectional hot loops use a Float64Array/Int32Array binary heap instead of object nodes. Same API, same results — measured −70% on first-path-then-stop, −41% on all-targets, −71% on single-target early exit (10k-node graph).

- [`af77e3f`](https://github.com/statelyai/graph/commit/af77e3f98924a0552cf42733f3ef5ea2e839d754) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Validate node `initialNodeId` references in `addNode`, `updateNode`, and batch node additions.

  Add prefixed canonical exports for traversal, transforms, diff patching, path joining, and walk stop helpers while preserving the old names as deprecated aliases.

## 2.0.0

### Major Changes

- [#22](https://github.com/statelyai/graph/pull/22) [`6bead2c`](https://github.com/statelyai/graph/commit/6bead2cadd9913911f02dd34f673aca227b4770d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Correctness, performance, and API-honesty overhaul.

  **Migration notes (the two changes most likely to require action):**

  1. **In-place field mutation is no longer auto-detected.** `edge.sourceId = 'x'` / `node.parentId = 'y'` now require `invalidateIndex(graph)` afterwards (or use `updateEdge`/`updateNode`, or immutable-style array replacement — both auto-detected). Code relying on the old per-read deep scan gets stale query results. This trade bought O(1) reads: a 10k-node query sweep dropped from 17.3 s to 14 ms.
  2. **Errors instead of silently wrong results:** Dijkstra/A\* throw on negative weights (use `{ algorithm: 'bellman-ford' }`); Floyd-Warshall throws on negative cycles; GraphML/GEXF/GML importers throw on non-numeric numeric fields; `updateNode`/`updateEdge` reject orphaned port references and hierarchy-cycle-creating reparents.

  Full changes:

  - **`updateNode`/`updateEdge` now apply every declared field.** Previously `x`/`y`/`width`/`height`/`shape`/`color`/`style` (and edge `mode`/`weight`) were silently dropped. New `NodeUpdate`/`EdgeUpdate` types; optional fields accept `null` to unset (JSON-safe), making diff → patch → apply converge.
  - **Mode-aware queries.** `getSuccessors`, `getPredecessors`, `getDegree`, `getInDegree`, `getOutDegree`, `getSources`, `getSinks` now honor effective edge directedness (graph `mode` + per-edge overrides). `getInEdges`/`getOutEdges` remain structural (authored direction) and are documented as such.
  - **Indexing is now O(1) per read** (was O(nodes+edges) on every query — a 10k-node `getSuccessors` sweep dropped from 17.3 s to 14 ms). The index auto-rebuilds when `graph.nodes`/`graph.edges` are replaced or change length; in-place _field_ mutations now require `invalidateIndex()` (previously auto-detected at the cost above). Also fixes stale-index results after immutable-style array replacement.
  - **Algorithm fixes:** zero-weight-cycle stack overflow in shortest paths/`hasPath` (now BFS-based); Dijkstra/A\* throw on negative weights instead of silently returning wrong paths; `isTree` edge-count check; undirected cycle dedup no longer drops distinct cycles; biconnected components split correctly at DFS-root articulation points; SCC honors undirected/bidirectional edges; `getTopologicalSort` returns `null` for non-directed edges; `isIsomorphic` compares self-loop edges; Prim returns a spanning forest on disconnected graphs (matching Kruskal); undirected self-loops are reported by `getCycles`.
  - **Mutation safety:** `updateEdge` validates port references when endpoints change; `updateNode` rejects port removals that would orphan edge port refs and parent changes that would create hierarchy cycles.
  - **Diff:** `getDiff` now covers `ports`, `weight`, `mode`, `sourcePort`, `targetPort`; `invertDiff` no longer aliases its input.
  - **Transforms:** `reverseGraph` swaps `sourcePort`/`targetPort` and preserves edge `mode` and node ports; `getSubgraph` preserves ports/per-edge mode and strips dangling `initialNodeId`; `flatten` preserves authored leaf self-loops, edge `weight`/`mode`, node fields, and resolves the graph `initialNodeId`.
  - **Walks:** mode-aware traversal (undirected edges walk both ways); `genQuickRandomWalk` detours honor `filter` and no longer depend on shortest-path reconstruction; `takeUntil*Coverage` yield nothing when the target is already met.
  - **Formats:** `toD2` no longer crashes on graphs not produced by `fromD2`; xyflow round-trips `data: undefined` without leaking metadata; per-edge `mode` round-trips in cytoscape/d3/jgf/gml/elk/xyflow; GraphML no longer mutates numeric-looking labels or trims whitespace and synthesizes collision-safe edge ids; GEXF preserves empty labels; DOT escapes newlines and quotes reserved keywords; mermaid escapes `|` in labels; `fromAdjacencyList` materializes referenced nodes; the format support matrix now matches actual converter behavior.

### Minor Changes

- [#22](https://github.com/statelyai/graph/pull/22) [`e48bbda`](https://github.com/statelyai/graph/commit/e48bbdad25e4e55ca4c4c7d9b95b33731c0dd73b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - CSR pathfinding, polynomial mixed-graph acyclicity, and malformed-input hardening:

  - **Pathfinding on the CSR core.** Dijkstra/BFS shortest paths and A\* now run on the compressed-sparse-row snapshot. Measured on 50k nodes / 200k edges: single-target `getShortestPath` 329 → 58 ms (5.7×), `getAStarPath` 27 → 7 ms (3.8×), all-targets `getShortestPaths` 514 → 342 ms (reconstruction-bound). Results unchanged (validated by the differential Dijkstra oracle).
  - **`isAcyclic` on mixed graphs is now polynomial in practice**: cycles among directed edges alone, cycles among non-directed edges alone (union-find), and the all-singleton-SCC case resolve without enumeration; only ambiguous multi-node SCCs fall back to exact simple-cycle search, restricted to that SCC. A 30-diamond acyclic mixed graph (2^30 simple paths) that previously hung now resolves instantly.
  - **New `getGraphIssues(graph)`** (core export, zod-free): structural invariant checking — duplicate ids, dangling edge endpoints, missing parents, parent cycles (reported once per cycle), missing initial nodes, duplicate port names, invalid port references — with entity-naming messages and machine-readable codes. The recommended gate for untrusted/imported graphs; `@statelyai/graph/schemas`' `validateGraph` now delegates its invariant portion to it.
  - **Hierarchy queries terminate on malformed parent cycles**: `getAncestors`, `getDescendants`, `getDepth`, and `getLCA` previously hung forever on authored `parentId` cycles; each now stops at the first repeated node (documented convention).
  - **mermaid/state:** user nodes whose ids merely contain `_region_` (e.g. `foo_region_bar`) are no longer mistaken for parallel-region markers and dropped — region detection now requires the exact structural pattern under a parallel parent.

- [#22](https://github.com/statelyai/graph/pull/22) [`6bead2c`](https://github.com/statelyai/graph/commit/6bead2cadd9913911f02dd34f673aca227b4770d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Mode unification, standard-GraphML import, and follow-up fixes:

  - **Per-edge `mode` overrides now work everywhere.** `isAcyclic`/`getCycles` dispatch on effective edge modes — genuinely mixed graphs (directed + non-directed edges) use an exact simple-cycle search (correct, may be expensive on large dense mixed graphs); centrality (degree/in/out, closeness, PageRank, HITS, eigenvector), Prim MST, and `isIsomorphic` all honor per-edge modes. `isIsomorphic` no longer requires equal graph-level `mode` (effective edge modes are what's structural). Two parallel undirected edges are now correctly reported as a 2-cycle by `getCycles` (consistent with `isAcyclic`).
  - **MST output preserves entity fields** (node ports/shape/visual props; edge `mode`/ports/color) instead of stripping them.
  - **Floyd-Warshall detects negative cycles** and throws a descriptive error instead of crashing during path reconstruction.
  - **Standard-GraphML import:** nested `<graph>` elements → `parentId` hierarchy, native `<port>` elements → ports, `sourceport`/`targetport` attributes → edge port refs; multi-graph documents import the first graph. The format-support matrix is legitimately back to full hierarchy/ports for GraphML. Numeric `<data>` values that aren't numbers now throw a descriptive error (also in GEXF/GML) instead of silently poisoning the graph with NaN.
  - **ELK port ids are document-unique** (`nodeId__portName`) as ELK requires; original port names round-trip via metadata; external ELK input with ports resolves to correct endpoints.
  - **mermaid/state emit:** isolated plain states are emitted; node labels emit via `state "label" as id` (and parse back into `label`); `graph.initialNodeId` round-trips as a top-level `[*] -->` transition.
  - **xyflow:** parents are ordered before children in `toXYFlow` output, as React Flow requires.
  - Fixes from re-auditing the previous release: `updateNode` no longer hangs when reparenting onto a graph with a pre-existing authored parent cycle; `invertDiff` deep-copies nested values (ports/style/data) instead of sharing them with the input.
  - New perf regression test guards the O(1) index read path.

- [#22](https://github.com/statelyai/graph/pull/22) [`c482fcd`](https://github.com/statelyai/graph/commit/c482fcdc672b93b3cbda4b0c74a4e1d70bf3cb40) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Performance core, new algorithms, and a differential-testing correctness moat:

  - **CSR algorithm core.** Hot algorithm loops now run on an internal compressed-sparse-row snapshot (`Int32Array` arcs, integer node indices — no string hashing in inner loops), cached per index and invalidated by the same transparent contract as the index (API mutations, array replacement, length changes; `invalidateIndex()` for in-place field mutation). Measured on a 2k-node/6k-edge graph: closeness 2,575 → 73 ms (35×), betweenness 4,597 → 169 ms (27×), HITS 202 → 4 ms (50×), PageRank 26 → 2 ms (13×); connected components on 100k nodes/100k edges 379 → 7 ms (54×). Head-to-head on identical graphs this is now faster than graphology for betweenness (1.7×), PageRank (1.3×), and components (2×). Public API and results are unchanged (validated by the new differential suite); a thresholded perf regression test guards the CSR path in CI.
  - **New algorithms:** `getLouvainCommunities` (deterministic Louvain modularity optimization), `getMaxFlow` (Edmonds–Karp max-flow with min-cut edges, capacities from `weight`), `getDominatorTree` (Cooper–Harvey–Kennedy immediate dominators — for statecharts: which states every path from the initial state must pass through), `getTransitiveReduction` (minimal equivalent DAG; throws descriptively on cycles or non-directed edges). All mode-aware where applicable, with known-answer tests (CLRS flow network, dominator-paper examples).
  - **Differential test suite** (`tests/differential/`): seeded random graphs run through both this library and graphology as an oracle — connected components, Dijkstra distances, PageRank, degrees, and betweenness must agree (158 tests; zero discrepancies found). Plus randomized self-properties: override-equivalence, `reverseGraph` involution, diff→patch convergence under random mutations, `hasPath` ⇔ `getShortestPath`, Prim ≡ Kruskal.
  - **Structural fix:** one shared, compile-time-guarded `toNodeConfig`/`toEdgeConfig` (adding a field to `GraphNode`/`GraphEdge` now fails compilation until every config producer handles it) adopted by diff, transforms, and MST output — closing the recurring silent-field-drop bug class. MST output no longer shares port objects with the source graph.

### Patch Changes

- [#24](https://github.com/statelyai/graph/pull/24) [`9eca989`](https://github.com/statelyai/graph/commit/9eca9891bb8c918761c87840531124934834bd02) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Bidirectional Dijkstra for single-pair queries + airtight negative-weight enforcement:

  - **`getShortestPath` now runs bidirectional Dijkstra** (forward on traversable arcs, backward on reverse arcs, Pohl termination). On a 50k-node/200k-edge random graph a point query dropped 58 ms → 0.8 ms; in the cross-library harness this is now 2.2× faster than graphology's bidirectional implementation (previously 60× slower). Same results — one shortest path, ties broken arbitrarily as before; `{ algorithm: 'bellman-ford' }` keeps the full search for negative weights.
  - **Negative-weight detection is now up-front for sublinear searches** (single-pair, early-exit, A*): O(1) via a flag cached on the CSR build for default weights, one O(edges) sweep for custom `getWeight`. Previously a sublinear search could terminate without scanning a reachable negative edge and silently return a wrong path. Corner-case behavior change: these queries now throw even when the negative edge is *unreachable\* from the source — deterministic failure instead of result-dependent behavior.

- [#24](https://github.com/statelyai/graph/pull/24) [`634f618`](https://github.com/statelyai/graph/commit/634f618b47145fcf9653669d0aa7b62e4441810e) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Benchmark-driven pathfinding/traversal performance:

  - `bfs`/`dfs` generators run on the CSR snapshot — a full BFS sweep over a 100k-node/300k-edge graph dropped from 623 ms to 4.4 ms, now the fastest of the five libraries measured (graphology, ngraph, graphlib, cytoscape) instead of the slowest.
  - Single-target `getShortestPath`/`getShortestPaths({ to })` early-exit the Dijkstra/BFS search once everything at the target's distance is settled (all equal-cost tie paths, including through zero-weight edges, are preserved — tested). Random-graph single-pair queries dropped ~2× on top of the earlier CSR gains.

  Also adds `pnpm bench:compare` — a reproducible cross-library benchmark harness (seeded identical graphs across 4 shapes × 3 sizes, idiomatic public APIs, median-of-runs, markdown/JSON reports in `bench/compare/results/`).

## 1.0.0

### Major Changes

- [`5acd7c3`](https://github.com/statelyai/graph/commit/5acd7c32a4d95897c3111d6fcbc982c406c861c6) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add graph and edge `mode` directedness, replacing graph `type`, and add D2 format support.

  Graphs now use `mode: 'directed' | 'undirected' | 'bidirectional'` as the graph-level default, and edges may override it with their own `mode`. Traversal, path, and query logic resolves effective edge mode so mixed directedness works consistently.

  Adds `@statelyai/graph/d2` with parsing and emitting for D2 syntax, including hierarchy, ports, styles, comments, classes, imports, and connector directedness.

## 0.13.0

### Minor Changes

- [`aeedcc0`](https://github.com/statelyai/graph/commit/aeedcc0e0c3730277231bf23ee71d969ff646347) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add semantic graph validation via `validateGraph()`, covering shape plus graph
  invariants such as duplicate ids, dangling edges, missing parents, invalid
  initial nodes, duplicate ports, invalid port references, and parent cycles.

  Default missing graph, node, edge, and port `data` values to `null` when
  creating resolved graph objects.

  Refresh format fidelity claims and conformance tests for ELK, xyflow, and
  Mermaid state round-tripping, and expand algorithm benchmarks across sparse,
  dense, compound, multi-edge, and port-heavy graphs.

## 0.12.1

### Patch Changes

- [`450d7da`](https://github.com/statelyai/graph/commit/450d7da0fb18e6ab72b16d596b30bfda3a4814ef) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve graph, node, and edge metadata more fully across D3, Cytoscape, GML,
  GEXF, and JGF adapters, and verify shipped schema JSON files in package smoke
  tests.

## 0.12.0

### Minor Changes

- [`09fe970`](https://github.com/statelyai/graph/commit/09fe970af7fc800d15816d6453043b3777cb2ff9) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add runtime schema validation helpers, improve port round-tripping across
  structured format adapters, extend package smoke coverage to type-check public
  subpath imports, and document format support and validation usage in the README.

### Patch Changes

- [`b4b2195`](https://github.com/statelyai/graph/commit/b4b2195fa38d06799bf9f215f58888c261440ce9) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve graph metadata in GEXF, round-trip DOT edge port references, tighten
  structured format parity tests, and derive package smoke coverage from the
  published export map.

## 0.11.1

### Patch Changes

- [`1480565`](https://github.com/statelyai/graph/commit/14805658942ca5a8e2f2c2dbfe274d98d6d73edd) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add Mermaid Ishikawa conversion and improve Mermaid v11.13 sequence and ER parsing.

- [`18588bd`](https://github.com/statelyai/graph/commit/18588bd4f65976a8c0405bd691e87adcd66ea7ed) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve ports and edge port references in GraphML round-trips, allow nullable
  node labels in `GraphSchema`

## 0.11.0

### Minor Changes

- [`88d0dbd`](https://github.com/statelyai/graph/commit/88d0dbdd5e7c6bc821d0b4c17a7fd5f67a934bcc) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add format support metadata as a published subpath, tighten schema drift checks,
  and modularize the algorithms entrypoint. This also adds benchmark coverage and
  CI checks for generated schema artifacts across multiple Node versions.

## 0.10.0

### Minor Changes

- [`bfb5f0b`](https://github.com/statelyai/graph/commit/bfb5f0b5c3ef6323160322f31b7c5807785d91f0) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Clean up and simplify type definitions:

  - Remove `GraphEntityConfig`; merged into `GraphEntity`
  - Export `VisualGraphFormatConverter` from main entry
  - Rename `Positioned` export to `EntityRect`
  - Simplify `VisualNode`, `VisualEdge`, `VisualPort` to use property narrowing instead of `Omit`
  - Fix `Graph<any, E>` → `Graph<N, E>` on exported APIs for better generic propagation
  - Normalize `label` to `string | null` on both `GraphNode` and `GraphEdge` (node label default changed from `''` to `null`)

### Patch Changes

- [`160167b`](https://github.com/statelyai/graph/commit/160167bfbd6fae4b7092ff6e45873ac166e41ba1) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `getEdgeBetween` in favor of `getEdgesBetween`.

## 0.9.0

### Minor Changes

- [`0fb9433`](https://github.com/statelyai/graph/commit/0fb9433c9490bf2014fea1eb9acab79a894a451b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add entity equivalence functions: `areEntitiesEqual`, `isLayoutEqual`, `isNonLayoutEqual`, and `LAYOUT_KEYS`.

- [`6d2465d`](https://github.com/statelyai/graph/commit/6d2465d88eb53122365e76d9fc89c061627d5f90) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add centrality, community detection, connectivity, and isomorphism algorithms.

## 0.8.0

### Minor Changes

- [`8b97c9b`](https://github.com/statelyai/graph/commit/8b97c9b66d8552589b4521b5369480ea363e385c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add port support for nodes and edges, enabling dataflow/node-editor graphs (Node-RED, Unreal Blueprints, ComfyUI).

  - Add `GraphEntityConfig`, `GraphEntity`, `VisualGraphEntity` base interfaces (DRY shared props for nodes, edges, ports)
  - Add `PortConfig<P>`, `GraphPort<P>`, `VisualPort<P>` types with generic data parameter
  - Add `P` (port data) as 4th generic to `Graph<N, E, G, P>` and all related types
  - Add `ports?: PortConfig[]` on `NodeConfig`, `ports?: GraphPort[]` on `GraphNode`
  - Add `sourcePort?` / `targetPort?` (port name strings) on `EdgeConfig` and `GraphEdge`
  - Add `createGraphPort()` factory
  - Add port validation: duplicate port names rejected, `addEdge`/`updateEdge` validate port existence
  - Add port queries: `getPort()`, `getPorts()`, `getEdgesByPort()`
  - ELK adapter: round-trip ports (name ↔ ELK port id, direction ↔ `org.eclipse.elk.port.side`)
  - xyflow adapter: `sourcePort` ↔ `sourceHandle`, `targetPort` ↔ `targetHandle`

## 0.7.0

### Minor Changes

- [`976a7e6`](https://github.com/statelyai/graph/commit/976a7e6821d43d0149e5ad776c660a5059484f23) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Make `Graph.initialNodeId`, `GraphNode.label`, and `GraphEdge.label` optional on resolved types for easier consumer usage
  - Add `createGraphNode()` and `createGraphEdge()` helpers that resolve defaults from config

## 0.6.0

### Minor Changes

- [`3115609`](https://github.com/statelyai/graph/commit/31156099ab26fe34e0bcf205221c48855a7d5674) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Make `edge.label` nullable

- [`54023f4`](https://github.com/statelyai/graph/commit/54023f4996a95a12145ed8f0ac1ed73ec9daedf0) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add edge weights, A\* pathfinding, subgraph extraction, and graph reversal.

  - `weight?: number` on edges; algorithms default to `(e) => e.weight ?? 1` with BFS fast path when unweighted
  - `getAStarPath(graph, { from, to, heuristic })` for heuristic-guided shortest paths
  - `getSubgraph(graph, nodeIds)` returns induced subgraph with internal edges
  - `reverseGraph(graph, filterEdge?)` flips edge directions
  - Remove stale TODO for Mermaid sequence blocks (already implemented)

- [`8f9912d`](https://github.com/statelyai/graph/commit/8f9912dd18c8ffaca4547061fe007f67124afd3a) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add walk generators and coverage utilities for model-based testing.

  - `genRandomWalk()`, `genWeightedRandomWalk()`, `genQuickRandomWalk()`, `genPredefinedWalk()` — step-by-step graph traversal generators that yield `GraphStep`, with optional `seed` for deterministic replay
  - Composable stop conditions: `takeSteps()`, `takeUntilNode()`, `takeUntilEdge()`, `takeUntilNodeCoverage()`, `takeUntilEdgeCoverage()`
  - `getCoverage()` computes node/edge coverage stats from a walk
  - `filter` option for edge guards, `onStep` callback for actions — keeps graph JSON-serializable

### Patch Changes

- [`22f77a5`](https://github.com/statelyai/graph/commit/22f77a51b6b0bed60a8890e44b8b9148c994e96d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Fix schema and GraphML serialization drift, optimize weighted graph algorithms, and make `genSimplePaths()` truly lazy.

  - add `weight` to `EdgeSchema` and tighten schema drift tests against the runtime graph types
  - preserve graph, node, and edge metadata in GraphML round-trips, including `initialNodeId`, `direction`, `style`, geometry, and edge `weight`
  - use a heap-backed priority queue for weighted shortest paths, A\*, and Prim MST
  - refactor `genSimplePaths()` to yield incrementally instead of collecting all paths before returning

## 0.5.0

### Minor Changes

- [`371133c`](https://github.com/statelyai/graph/commit/371133c89e54a16cc0ed2c5ca5c12cfd2819d3df) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add ELK formatter

- [`9e596d6`](https://github.com/statelyai/graph/commit/9e596d655b3e0479a57a9a41a3f1cb41991ab8c5) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Generate schemas

### Patch Changes

- [`166b695`](https://github.com/statelyai/graph/commit/166b69583728792f20c3051db015d1b2a6e5a375) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Fix Mermaid types

- [`49ffd94`](https://github.com/statelyai/graph/commit/49ffd942eea0173ec99b03beb1cbd5b226e0e509) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Improve Mermaid parity

## 0.4.0

### Minor Changes

- [`e268990`](https://github.com/statelyai/graph/commit/e268990dde29ff0e6cb89d10c8ddbdf142bec69b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Make `parentId`, `initialNodeId`, and `shape` optional on `GraphNode`. These fields are no longer defaulted to `null`/`'rectangle'` by `createGraph`/`createVisualGraph`, they are simply omitted when not provided.

  Add empty string validation for node/edge IDs, `parentId`, `sourceId`, and `targetId`.

- [`55462e6`](https://github.com/statelyai/graph/commit/55462e68902f6241d23d689971ce2cbd756624b5) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add xyflow (React Flow / Svelte Flow) format converter with `toXYFlow()` and `fromXYFlow()` for converting between `VisualGraph` and xyflow node/edge structures. Uses `@xyflow/system` as an optional peer dependency for types. Also adds `VisualGraphFormatConverter` type for visual-first format converters.

## 0.3.1

### Patch Changes

- [#6](https://github.com/statelyai/graph/pull/6) [`c186c2a`](https://github.com/statelyai/graph/commit/c186c2afb4eb7772855f41a03102892ecb97c9b1) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add JSDoc with usage examples to all exported functions

- [`83b3c66`](https://github.com/statelyai/graph/commit/83b3c66a9e5f740442e6e29bc6bfc78f86f61805) Thanks [@davidkpiano](https://github.com/davidkpiano)! - `VisualNode['shape']` is now optional

- [#8](https://github.com/statelyai/graph/pull/8) [`27f3f7f`](https://github.com/statelyai/graph/commit/27f3f7fe744ec5d12c401a372439f85b0f2ca0f3) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Mermaid: reconstruct sequence diagram blocks

## 0.3.0

### Minor Changes

- [#5](https://github.com/statelyai/graph/pull/5) [`25ab36a`](https://github.com/statelyai/graph/commit/25ab36a7507cefac24dc5d86f36b5918af109530) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Add DOT format (`@statelyai/graph/dot`)

  - Add Mermaid formatters: flowchart, sequence, state, class diagram, ER, mindmap, block
  - Add `getRelativeDistanceMap` and `getRelativeDistance` (queries)
  - Restructure formats into per-format subpackages with READMEs

- [#3](https://github.com/statelyai/graph/pull/3) [`bcf8c48`](https://github.com/statelyai/graph/commit/bcf8c48d8646b45d54049ac68627e8af699f2cda) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add format converters for JGF, Cytoscape.js JSON, D3 force JSON, GEXF, GML, and TGF

  - New `GraphFormatConverter<TSerial>` interface and `createFormatConverter()` factory
  - 6 new format modules with bidirectional `to*/from*` functions: `toJGF`/`fromJGF`, `toCytoscapeJSON`/`fromCytoscapeJSON`, `toD3Graph`/`fromD3Graph`, `toGEXF`/`fromGEXF`, `toGML`/`fromGML`, `toTGF`/`fromTGF`
  - Input validation with descriptive error messages on all `from*` functions
  - End-to-end integration tests with real Cytoscape.js and D3 force libraries
  - `cytoscape` and `d3-force` added as optional peer dependencies

## 0.2.0

### Minor Changes

- [`4f02507`](https://github.com/statelyai/graph/commit/4f025074bc4318f8c265388e8529eb0677e1eb8c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `toGraphML`, `fromGraphML`, `GraphSchema`, `NodeSchema`, and `EdgeSchema` from the main barrel export to avoid pulling in optional peer deps (`fast-xml-parser`, `zod`) during SSR.

  Use subpath imports instead:

  - `@statelyai/graph/formats/graphml`
  - `@statelyai/graph/schemas`
