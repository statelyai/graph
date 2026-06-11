# SUMMARY — deep improvement session, 2026-06-09

Companion to [ANALYSIS.md](./ANALYSIS.md) (architecture map, competitive position, full ranked
audit). This file: what was fixed, what wasn't, and what to do next.

**End state:** 1220 tests pass in 49 files (baseline: 1131/47) · typecheck clean ·
`pnpm verify` (typecheck + generated-schema check + tests + build + publint + package smoke)
passes · changeset added (`.changeset/heavy-results-shake.md`, minor).

## Numbers (measured, not estimated)

| Metric | Before | After |
|---|---|---|
| `getSuccessors` sweep, 10k nodes / 20k edges | 17,305 ms | **14 ms** (≈1,200×) |
| `getNode`, warm 10k-node graph | 1,726 µs/op | **0.3 µs/op** (≈5,700×) |
| Statement coverage (v8) | 91.82 % | 92.71 % |
| `indexing.ts` stmt coverage | 62.26 % | 100 % |
| `isomorphism.ts` stmt coverage | 86.07 % | 92.77 % |
| Tests | 1131 | 1220 (+89; every behavior change has a failed-before/passes-after test) |

The perf cliff: `getIndex` recomputed an O(nodes+edges) signature string on **every read**, so
every query was linear and per-node sweeps quadratic. See "Deliberate tradeoffs" below.

## What was fixed (by area; details & repros in ANALYSIS.md and the changeset)

### Core mutations (`src/graph.ts`, `src/types.ts`)
- `updateNode`/`updateEdge` silently dropped most declared fields (visual props; edge
  `mode`/`weight` were **impossible to change**). Now every field applies; new exported
  `NodeUpdate`/`EdgeUpdate` types; `null` unsets optional fields (JSON-safe — chosen over
  `undefined` so patches survive serialization).
- `updateEdge` endpoint changes now validate kept port references (previously produced edges
  `addEdge` itself would reject); error names the port, the node, and the two ways to fix it.
- `updateNode` rejects port replacements that would orphan edge port refs, and `parentId`
  changes that would create hierarchy cycles (previously: infinite loops in `getAncestors` etc.).

### Queries & indexing (`src/queries.ts`, `src/indexing.ts`)
- `getSuccessors`/`getPredecessors`/`getDegree`/`getInDegree`/`getOutDegree`/`getSources`/
  `getSinks` now honor effective edge mode (graph default + per-edge override), matching the
  documented "traversable both ways" semantics the algorithms layer already used.
  `getInEdges`/`getOutEdges` deliberately stay structural (authored direction) — every consumer
  reads `edge.targetId` as "the far end"; their JSDoc now says so and points to the mode-aware
  alternatives.
- Stale-index bug: replacing `graph.nodes`/`graph.edges` with same-length arrays (immutable-style
  updates) silently returned garbage. Refs are now part of the staleness check.
- Deleted dead `indexRemoveNode`/`indexRemoveEdge` (unused since deletions rebuild) and the
  entire signature machinery (see tradeoffs).

### Algorithms (`src/algorithms/`) — all verified failing-first in `tests/algorithm-fixes.test.ts`
- Zero-weight cycles crashed shortest paths with stack overflow; `hasPath` (which materialized
  *every* shortest path to test reachability — exponential) is now a mode-aware BFS.
- Dijkstra/A* silently returned wrong paths on negative weights; they now throw, naming the edge
  and pointing to `{ algorithm: 'bellman-ford' }`.
- `isTree` accepted directed diamonds and parallel edges (no edge-count check).
- Undirected cycle enumeration dropped distinct cycles sharing inner nodes (dedup now keyed on
  traversed edge-id sets) and missed self-loops.
- Biconnected components merged at DFS-root articulation points.
- SCC ignored undirected/bidirectional edges; topo sort silently "ordered" undirected graphs
  (now `null`); `isIsomorphic` never applied `edgeMatch` to self-loops; Prim returned a
  non-spanning edge set on disconnected graphs (now a forest, matching Kruskal).

### Diff/patch, transforms, equivalence, walks
- `getDiff` was blind to `ports`, `weight`, `mode`, `sourcePort`, `targetPort`; combined with the
  update bug, `applyPatches` could never converge. Now: full key coverage, absent↔null
  normalization (JSON-safe diffs), convergence tests for set/unset/ports. `invertDiff` no longer
  aliases its input.
- `reverseGraph` deleted ports/mode instead of swapping `sourcePort`↔`targetPort`; `getSubgraph`
  dropped ports/per-edge mode and kept dangling `initialNodeId`; `flatten` dropped authored leaf
  self-loops, edge `weight`/`mode`, node fields, and the graph `initialNodeId` (now resolved to
  the initial leaf; `resolveInitial` also gained a cycle guard).
- `areEntitiesEqual`/`isNonLayoutEqual` were asymmetric (keys from first arg only).
- Walks are now mode-aware (undirected edges traverse both ways, incl. `genPredefinedWalk`);
  `genQuickRandomWalk` detours honor `filter` (previously walked forbidden edges) via internal
  BFS — also removing its dependency on the crash-prone path reconstruction;
  `takeUntil*Coverage` no longer yield a step when the target is already met.

### Formats (`src/formats/`) — all verified failing-first
- `toD2` crashed (`TypeError`) on any graph not produced by `fromD2`.
- xyflow leaked internal `__statelyai` metadata into user data for `data: undefined`.
- Per-edge `mode` now round-trips in cytoscape, d3, jgf, gml, elk, xyflow (graph-level
  `bidirectional` also for jgf/gml) — previously all six claimed `full` round-trip while dropping it.
- GraphML import mutated labels (`"1.50"`→`"1.5"`, whitespace trimmed); synthesized edge ids
  could collide with explicit ids (extended the pre-session uncommitted fix); GEXF turned empty
  labels into node ids and trimmed whitespace; DOT emitted newlines its own parser rejected and
  left DOT keywords (`node`, `graph`, …) unquoted; mermaid `|` in edge labels corrupted parses;
  `fromAdjacencyList` created edges to nonexistent nodes.
- `src/formats/support.ts` + the README table (derived from it) now match actual behavior:
  graphml hierarchy/ports downgraded to `partial` (standard nested `<graph>`/`<port>` elements
  are dropped on import), mermaid/state round-trip downgraded to `partial` (isolated states and
  plain labels dropped on emit), notes added for d2 nested vars and the ELK port-id caveat.
- README fixes: MST example used a nonexistent `weight` option (it's `getWeight`); documented the
  new update/unset semantics.

## Deliberate tradeoffs and decisions

1. **Index staleness is now an O(1) check** (array refs + lengths) instead of an O(n+e) content
   scan per read. Consequence: in-place *field* mutation (`edge.sourceId = 'x'`) is no longer
   auto-detected — call `invalidateIndex()` (which was already the documented contract; the
   `getIndex` JSDoc only ever promised count-based rebuilds). One test pinned the old deep-scan
   behavior and was updated to demonstrate the contract. Rationale: 5,700× per-read cost for a
   safety net, quadratic algorithm sweeps, and no O(1) way to detect deep mutation on plain
   objects. Array replacement and length changes are still auto-detected — and now correctly
   (the old code got replacement *wrong*, trusting a stale index).
2. **`getInEdges`/`getOutEdges` stay mode-blind** (authored direction). Making them mode-aware
   would silently break every consumer that reads `edge.targetId` as the far endpoint. Node-level
   queries are mode-aware instead; JSDoc directs users accordingly.
3. **`null`-to-unset** (not `undefined`) in updates/diffs, so payloads survive JSON round-trips.
4. One lazy-enumeration test was rewritten: it asserted laziness via a Proxy on a replaced
   `graph.edges` array — i.e., it depended on the stale-index bug. It now proves laziness with a
   2^30-path graph that would hang an eager implementation.
5. Added `@vitest/coverage-v8` as a devDependency (coverage was previously unmeasurable).

## Deliberately NOT fixed (and why)

- **Per-edge `mode` overrides in `isAcyclic`/`getCycles` dispatch, centrality, MST, isomorphism**
  (they branch on `graph.mode` only). Cross-cutting refactor — needs one shared mode-aware
  adjacency helper adopted everywhere; high regression surface. Fixed where cheap (SCC, topo
  sort, queries, walks); the rest is improvement #1 below.
- **Standard-GraphML import** of nested `<graph>` elements and native `<port>`/`sourceport`
  attributes (silently dropped). Real parser work; the support matrix now states the limitation
  instead of claiming `full`.
- **ELK port-id collisions** (`id: port.name` is not globally unique; external ELK input can
  mis-resolve endpoints). The safe fix changes emitted ELK ids and needs a round-trip-safe
  scheme; documented in the matrix instead.
- **mermaid/state emit gaps** (isolated plain states, `label` vs `data.description`,
  `initialNodeId` ↔ `[*]`). Needs a design decision on label semantics; matrix downgraded.
- **Floyd-Warshall negative-cycle detection** (`dist[i][i] < 0` unchecked) — same crash family as
  the fixed reconstruction bug but only with negative cycles, which Bellman-Ford already detects;
  low-frequency, noted here.
- Low-severity format edges: TGF separator/whitespace collisions, GML numeric labels, mermaid
  `_region_` substring collision, multi-`<graph>` GraphML files, xyflow parent-before-child
  ordering, D2 `a--b` unquoted-id ambiguity. Each is small but none is on a hot path.
- `playground/` (untracked local scratch) left untouched.

## Next 5 improvements (ranked by impact/effort)

1. **Unify mode resolution across algorithms** (~1–2 days): single shared mode-aware adjacency
   helper in `algorithms/shared.ts` used by `isAcyclic`/`genCycles` dispatch, centrality, MST,
   isomorphism, connectivity. Kills the remaining class of wrong results on mixed-mode graphs
   (ANALYSIS A7). Add property tests comparing `mode:'undirected'` graphs vs all-edges-overridden
   directed graphs.
2. **Standard-GraphML import** (~1 day): nested `<graph>` → `parentId`, `<port>` elements →
   ports, `sourceport`/`targetport` attributes → edge port refs; then restore `full` matrix
   claims with yEd/Gephi fixture files.
3. **ELK port-id scheme** (~0.5–1 day): emit globally-unique port ids (e.g. `${nodeId}__${port}`)
   with a `statelyai.portName` layout option for lossless reverse mapping; key `fromELK`'s
   owner map by `(nodeId, portId)`.
4. **mermaid/state emit completeness** (~0.5–1 day): emit isolated states, map `label` to
   `s1 : label` (decide precedence vs `data.description`), map `graph.initialNodeId` ↔ `[*] -->`.
5. **Perf regression guard** (~0.5 day): extend `bench/` with the 10k-node query-sweep and warm
   `getNode` benchmarks from this session (17.3 s → 14 ms; 1,726 µs → 0.3 µs) so the index
   contract can't silently regress; wire `vitest bench` into CI.
