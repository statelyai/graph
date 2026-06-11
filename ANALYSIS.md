# ANALYSIS — @statelyai/graph (session: 2026-06-09)

## Phase 1: What this codebase is

**@statelyai/graph** is a TypeScript-first graph library whose core design bet is that
**graphs are plain JSON-serializable objects** (`{ id, mode, initialNodeId, nodes, edges, data }`),
not class instances. All operations are standalone prefixed functions (`get*`, `gen*`, `is*`,
`has*`, `add*`, `create*`, `to*`/`from*`) that take the graph as the first argument. Performance
comes from a **transparent WeakMap index** (`src/indexing.ts`) that maps ids → array positions and
adjacency, auto-rebuilt when a staleness signature detects mutation. An optional `GraphInstance`
class wrapper delegates to the same functions.

It is built by Stately (stately.ai) as a **graph IR for visual tooling**: statechart-flavored
features (compound nodes via `parentId`, `initialNodeId`, `flatten()` decomposition,
`createGraphFromTransition` BFS state-space exploration), visual fields (`x/y/width/height/
shape/color/style`, `VisualGraph` with required geometry), ports (named connection points,
node-editor style), per-edge directedness (`mode: 'directed' | 'undirected' | 'bidirectional'`
graph-level default with per-edge override), and model-based-testing random walks with coverage
stats.

### Module map (src/, ~4.4k lines + ~9k lines formats)

| Module | Role |
|---|---|
| `graph.ts` | Factories (`createGraph`, `createGraphNode/Edge/Port`, `createVisualGraph`, `createGraphFromTransition`), lookups, mutations (`add/delete/update` node/edge), batch ops, `GraphInstance` |
| `types.ts` | All types. `Graph*` = resolved/strict; `*Config` = lenient input; `Visual*` = required geometry; `*Options` = algorithm params. Generics `<N, E, G, P>` all default `any` |
| `indexing.ts` | `WeakMap<Graph, GraphIndex>`: id→index maps, out/in adjacency, parent→children. Staleness via counts + id/endpoint signature string; incremental helpers for API mutations; `invalidateIndex` for direct mutation |
| `queries.ts` | Neighborhood (`getNeighbors/Successors/Predecessors`), degree, edge queries, hierarchy (`getChildren/Parent/Ancestors/Descendants/LCA/Depth/Siblings/Roots`), `getSources/Sinks`, statechart relative-distance, port queries |
| `algorithms/` (barrel `algorithms.ts`) | `traversal.ts` (bfs/dfs/acyclicity/components/topo/isTree), `paths.ts` (BFS/Dijkstra/Bellman-Ford/Floyd-Warshall/A*, simple paths, Tarjan SCC, cycles), `ordering.ts`, `spanning-tree.ts` (Prim/Kruskal), `centrality.ts` (degree/closeness/Brandes betweenness/PageRank/HITS/eigenvector), `connectivity.ts` (bridges/articulation/biconnected), `community.ts` (label propagation/Girvan-Newman/modularity), `isomorphism.ts` (pruned backtracking) |
| `diff.ts` | `getDiff` (id-matched, fixed key list), `getPatches`/`applyPatches` (ordered ops, delegates to mutation API), `invertDiff`, `toPatches`/`toDiff` |
| `transforms.ts` | `flatten` (statechart → leaf-node graph), `getSubgraph` (induced), `reverseGraph` |
| `walks.ts` | Seeded (mulberry32) random/weighted/coverage-greedy/predefined walks; `take*` combinators; `getCoverage` |
| `equivalence.ts` | Layout vs non-layout key-based entity comparison |
| `schemas.ts` | Zod schemas (peer dep), JSON schema generated to `schemas/` |
| `formats/` | 15 converter families, each a package subpath export (see below) |

### Formats inventory

Three lossless JSON adapters (**cytoscape, d3, jgf** — stash model fields in metadata slots);
two layout-engine adapters (**elk, xyflow** — fidelity via embedded `statelyai` metadata);
XML/text interchange (**graphml, gexf, gml** — own-dialect fidelity via JSON-stringified data,
limited support for other tools' dialects); diagram languages (**dot, d2** — parsing richer than
emitting); the **mermaid** family (flowchart, state, sequence, class, ER, mindmap, block,
ishikawa — regex-line parsers, lossy to-direction); minimal structural (**adjacency-list,
edge-list, tgf**). A machine-readable support matrix lives in `src/formats/support.ts`
(exported as `@statelyai/graph/format-support`).

### Public contract

- npm package `@statelyai/graph` v0.13.0, ESM-only, root export + 17 subpath exports
  (`/algorithms`, `/queries`, `/schemas`, `/format-support`, one per format).
- All format deps are **optional peers** (fast-xml-parser, dotparser, elkjs, zod, …).
- Users: Stately's own visual editors, and anyone needing a JSON graph IR between tools
  (React Flow ↔ ELK ↔ GraphML ↔ Mermaid), plus model-based testing via walks.
- Released via changesets; `pnpm verify` = typecheck + generated-schema check + tests + build +
  publint + package smoke test. 1131 tests in 47 files before this session.

## Phase 2: Competitive position (≤5 rows)

Decisions recorded 2026-06-09 (follow-up session): every "they are ahead" row is either
addressed, on the backlog, or explicitly accepted.

| Competitor | They are ahead | This library is ahead | Decision on the gap |
|---|---|---|---|
| **graphology** (de-facto JS standard + `graphology-library` algorithms) | Maturity & ecosystem: years of production use, events/observability, perf-tuned internals, many more algorithm packages (Louvain, force layouts), huge user base | Plain-JSON IR (no `.export()`/`.import()` ceremony), TS-first generics on node/edge/graph/port data, ports + compound hierarchy + per-edge mode in one model, 15-format conversion layer | Ecosystem breadth: **accepted non-goal** (cannot out-mature). The implicit gap — graphology's smaller model was more *uniformly correct* — **addressed**: per-edge mode now honored across queries, walks, cycles, centrality, MST, isomorphism, SCC (sessions 1–2) |
| **@dagrejs/graphlib** | Battle-tested compound-graph semantics (powers dagre); very stable API | Actively developed; modern TS types; serialization formats; algorithms beyond its small set (centrality, communities, isomorphism, walks); graphlib is in maintenance mode | **Accepted** — competitor in maintenance mode; this library's compound semantics now validated (hierarchy-cycle guards, flatten fixes) |
| **cytoscape.js** (headless mode) | Breadth & perf of algorithm collection (hundreds of methods), collection/selector ergonomics, massive community | Tree-shakable standalone functions vs monolithic OOP core; graphs are the data (no element wrappers); direct interop adapters incl. a first-class Cytoscape converter | Algorithm-count parity: **accepted non-goal** — strategy is a correct, well-tested core set + conversion to cytoscape when exotic algorithms are needed |
| **ngraph** suite (`ngraph.graph`, `ngraph.path`) | Raw pathfinding speed on large graphs (heavily optimized A*/NBA*) | Coherent single package vs scattered micro-modules; hierarchy, ports, visual fields, diff/patch, formats — ngraph models only flat node/link | **Backlog** — O(1) index reads landed (≈5,700× on warm lookups) + perf regression guard in CI; typed-array/heap pathfinding optimization remains a ranked backlog item, pursued only if large-graph users appear |
| **React Flow / xyflow ecosystem utils** | Direct grip on the largest node-editor audience; rendering + interaction solved | Renderer-agnostic IR with algorithms; xyflow is one adapter among 15 — users can pipe the same graph to ELK, Mermaid docs, GraphML tools | Audience: **accepted non-goal** (not a renderer). Adapter quality gap **addressed**: parent-before-child ordering, `data: undefined` fidelity, per-edge mode round-trip |

**Uncomfortable findings (status after follow-up):** (1) Distinctive features (per-edge `mode`,
ports, compound nodes) were the least consistent — now unified across the library with
override-equivalence tests. (2) The format support matrix overstated fidelity in ≥8 entries —
corrected; graphml has since been legitimately upgraded back to full hierarchy/ports by
implementing standard-GraphML import. (3) Index reads were O(n+e) — now O(1)
(refs+lengths staleness contract), guarded by `tests/perf-regression.test.ts`.

## Phase 3: Audit findings (ranked; all repro-verified)

> **Status (2026-06-09 follow-up session):** all HIGH items below are fixed. Of the MED/LOW
> items: A7 (per-edge mode in isAcyclic/getCycles/centrality/MST/isomorphism) is now fixed via
> effective-mode dispatch + a mixed-graph exact cycle enumerator; A8 (Prim forest) fixed; F4
> (ELK port-id collisions) fixed; F5 fixed; F6 NaN guards fixed (graphml/gexf/gml throw with
> field/value/owner). The graphml hierarchy/ports import gap (part of F2) is fixed by
> standard-GraphML import — the matrix is legitimately back to `full`. Still open: per-edge
> mode in connectivity/community (documented as undirected-only), TGF/GML/mermaid low-sev
> edges listed in SUMMARY-2.md. An external re-audit of the first session's fixes found 8/9
> claims HELD, one overstated (invertDiff aliasing — since fixed properly) and one new bug
> (updateNode ancestry-walk hang on authored parent cycles — fixed). See SUMMARY-2.md.

Coverage baseline (v8, first session): **91.8% stmts / 81.2% branch** overall; weakest:
`indexing.ts` 62% (incremental paths), `walks.ts` 79% (quick-walk detour), `isomorphism.ts` 86%.
1131 tests passing. Gaps align with the bug sites below.

### Correctness bugs — core (C#)

| # | Severity | Finding |
|---|---|---|
| C1 | HIGH | `updateNode` silently drops `x/y/width/height/shape/color/style` from updates; `updateEdge` additionally drops `mode`/`weight` — the type accepts them, nothing is applied (`graph.ts:558-680`). Edge mode/weight **cannot be changed at all** via the public API. Also breaks diff→patch convergence for visual props |
| C2 | HIGH | Neighbor queries ignore edge directedness: `getSuccessors/getPredecessors/getInEdges/getOutEdges/getSources/getSinks` treat every edge as directed even in `mode:'undirected'` graphs (`queries.ts`), contradicting `tests/mode.test.ts` semantics and the algorithms layer. `getDegree` ignores per-edge mode overrides |
| C3 | HIGH | Stale index when `graph.nodes`/`graph.edges` arrays are **replaced** (immutable-style update): ref change skips the staleness check instead of forcing rebuild (`indexing.ts:48-70`) → garbage query results |
| C4 | HIGH | `getDiff` blind to `ports`, `weight`, `sourcePort`, `targetPort`, `mode` (compare-key lists + config extractors, `diff.ts:21-89`) → `isEmptyDiff` true for differing graphs; patches lose fields |
| C5 | HIGH | `reverseGraph` deletes `sourcePort`/`targetPort`/per-edge `mode` and all node `ports` instead of swapping ports (`transforms.ts:145-186`); `getSubgraph` same field-stripping |
| C6 | MED | `updateEdge` changing `sourceId`/`targetId` keeps stale `sourcePort`/`targetPort` without validation — creates edges `addEdge` would reject (`graph.ts:636-651`) |
| C7 | MED | `updateNode` can set `parentId` to a descendant → hierarchy cycle → `getAncestors`/`getDepth`/`getDescendants` hang forever (`graph.ts:568`) |
| C8 | MED | `flatten` drops genuine leaf self-loops (`transforms.ts:109`) and loses graph `initialNodeId` + edge `weight`/`mode` |
| C9 | MED | `areEntitiesEqual` asymmetric: keys taken from first arg only (`equivalence.ts:44`) |
| C10 | MED | `genQuickRandomWalk` shortest-path detour ignores `options.filter` (`walks.ts:180-202`) |
| C11 | LOW | `takeUntilNodeCoverage` yields one extra step when target already met; `invertDiff` aliases input arrays; `getSubgraph` keeps dangling node `initialNodeId` |

### Correctness bugs — algorithms (A#)

| # | Severity | Finding |
|---|---|---|
| A1 | HIGH | Zero-weight cycle → **stack overflow** in shortest-path reconstruction (`paths.ts:199`); `hasPath` crashes (it materializes every shortest path just to test reachability — also exponential on tie-heavy graphs) |
| A2 | HIGH | Dijkstra silently returns wrong paths with negative weights (no detection, `paths.ts:62-91`); Floyd-Warshall lacks negative-cycle detection (same crash mode as A1) |
| A3 | HIGH | `isTree` true for directed diamond and for parallel edges (`traversal.ts:212` — no edge-count check) |
| A4 | HIGH | `genCyclesUndirected` dedup key excludes start node & is shared across starts → distinct triangles sharing an edge are dropped (`paths.ts:436-467`) |
| A5 | HIGH | Biconnected components merged when DFS root is a cut vertex (`connectivity.ts:116-119`) |
| A6 | MED | SCC ignores undirected/bidirectional edges (mutual reachability) (`paths.ts:336`); topo sort silently "orders" undirected graphs (`traversal.ts:166`) |
| A7 | MED | Per-edge `mode` overrides ignored by `isAcyclic`/`getCycles`/MST/centrality/isomorphism (they branch on `graph.mode` only) — cross-cutting; paths/Bellman-Ford/Floyd-Warshall do it right |
| A8 | MED | Prim on disconnected graph returns a non-spanning single-component edge set while Kruskal returns the full forest; directed-graph MST ill-defined for both |
| A9 | MED | `isIsomorphic` never applies `edgeMatch` to self-loops (`isomorphism.ts:117-131`); undirected self-loop is "cycle" per `isAcyclic` but invisible to `getCycles` |

### Correctness bugs — formats (F#)

| # | Severity | Finding |
|---|---|---|
| F1 | HIGH | `toD2` crashes (`TypeError`) on any graph not produced by `fromD2` — assumes parser-shaped `node.data`/`edge.data` (`d2/emitter.ts:80,173,260`) |
| F2 | HIGH | Support matrix (`formats/support.ts`) overstates fidelity in ≥8 entries: per-edge `mode` dropped by cytoscape/d3/jgf/gml/elk/xyflow yet all claim roundTrip `full`; graphml claims hierarchy/ports `full` but silently drops standard-GraphML nested graphs and native ports on import; mermaid/state claims `full` but drops isolated nodes and node labels |
| F3 | HIGH | xyflow corrupts `data: undefined` — internal `__statelyai` metadata leaks into user data on round-trip (`xyflow/index.ts:44-63`) |
| F4 | HIGH | ELK port ids collide across nodes (`id: port.name`) → genuine ELK input with same-named ports on two nodes resolves edge to **wrong endpoints** (`elk/index.ts:110,329`) |
| F5 | MED | GraphML import mutates labels that look like numbers (`"1.50"`→`"1.5"`) or have edge whitespace (XMLParser defaults, `graphml/index.ts:261`); GEXF turns empty label into node id; DOT emits literal newlines its own parser rejects and leaves DOT keywords (`node`, `graph`) unquoted; mermaid flowchart `\|` in edge label corrupts parse; `fromAdjacencyList` creates edges to nonexistent nodes |
| F6 | LOW | NaN-unguarded numeric parsing (graphml/gexf/gml weights); TGF separator collisions; mermaid `_region_` substring collision drops user nodes; synthesized GraphML edge id can collide with explicit ids |

### Performance

- Every `getIndex` call recomputes an O(n+e) signature string even when nothing changed, and the
  incremental index helpers reset the signature so the **next access does a full rebuild anyway**
  (`indexing.ts`) — every query is O(n+e); the incremental machinery is dead weight. Needs
  benchmarking before/after any fix (bench/ exists).
- `hasPath` materializes all shortest paths (exponential worst case) — fixed as part of A1.

### Test coverage gaps (measured)

- `indexing.ts` 62% stmts — incremental update paths untested (and buggy, C3).
- `walks.ts` 79% — quick-walk detour branch untested (and buggy, C10).
- `isomorphism.ts` 86% — self-loop matching untested (and buggy, A9).
- Coverage on the core mutation/query/path code is otherwise high; the gap pattern is
  "uncovered branch ⇒ bug" three for three.

### Dead code / dependency bloat

- No runtime deps; all format deps optional peers — no bloat found.
- `indexing.ts` incremental helpers are effectively dead weight (see Performance).
- `playground/` (untracked) is a local scratch area; left alone.

### DX friction

- Silent-drop updates (C1) are the worst footgun: type system says yes, runtime does nothing.
- `getTopologicalSort` returns `null` on cycles (good) but silently mis-orders undirected graphs.
- Negative-weight Dijkstra silently wrong (A2) — needs a loud error naming the offending edge.
- Support matrix inaccuracies (F2) mean docs ≠ behavior for format users.
