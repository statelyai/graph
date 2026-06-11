# SUMMARY-2 — follow-up improvement session, 2026-06-09

Companion to [ANALYSIS.md](./ANALYSIS.md) (updated in place: competitive rows now carry
decisions, Phase 3 tables carry status) and [SUMMARY.md](./SUMMARY.md) (the prior session).

**End state:** 1284 tests pass in 51 files (prior session ended at 1220/49) · typecheck clean ·
`pnpm verify` passes (typecheck + generated-schema check + tests + build + publint + package
smoke) · no lint script exists in this repo (typecheck is the only static gate — noted, not
added; adding a linter is a project-owner choice) · changeset added
(`.changeset/mighty-cycles-align.md`, minor).

## Phase 0 — verdicts on the prior session's claims

Method: full suite re-run (1220/1220 green at session start); both perf measurements re-run;
all 9 claim groups graded by an independent re-audit that ran the new test files against
pre-session sources (73 tests fail on old code — failing-first confirmed, non-vacuous) plus 14
adversarial probes; type-ergonomics probe compiled old-style call sites against the new
`NodeUpdate`/`EdgeUpdate` types.

| Claim | Verdict | Evidence |
|---|---|---|
| Perf: 10k-node `getSuccessors` sweep 17.3 s → 14 ms | **HELD** | Re-measured 14 ms at session start (31 ms at session end — machine noise, same order; still ~560× under the old cost) |
| Perf: warm `getNode` 1,726 µs → 0.3 µs | **HELD** | Re-measured 0.3 µs (0.4 µs at session end) |
| update*/null-unset + `NodeUpdate`/`EdgeUpdate` types | **HELD** | tests/core-fixes.test.ts:33–91; probes: `weight: 0` sets, `label: null` settable; old `Partial<Omit<*Config,'id'>>` call sites still compile, wrong data shapes still rejected |
| Port-ref validation + hierarchy-cycle guard | **HELD**, but introduced one new bug (below) | tests/core-fixes.test.ts:93–174; no false positive on self-loop-via-ports |
| Mode-aware queries / structural in-out edges | **HELD** | tests/core-fixes.test.ts:176–257; parallel-edge and self-loop probes match documented semantics |
| O(1) index staleness + replacement detection | **HELD** | src/indexing.ts:53–68; dead helpers confirmed gone |
| All 10 algorithm fixes (zero-weight crash, negative-weight throw, isTree, cycle dedup, biconnected root, SCC, topo, isomorphic self-loops, Prim forest, undirected self-loop cycles) | **HELD** | tests/algorithm-fixes.test.ts, each verified failing on pre-session code; Prim totals cross-checked against Kruskal on 30 random graphs |
| Diff key coverage + convergence | **HELD** | Convergence probes incl. unset and empty-string labels |
| `invertDiff` "no longer aliases its input" | **OVERSTATED** | Only top-level arrays were copied; nested `ports`/`style`/`data` still shared (confirmed by mutation probe). The session's own test only exercised top-level. **Fixed this session** (`structuredClone`, src/diff.ts) with a nested-mutation test |
| Format fixes (toD2, xyflow leak, per-edge mode ×6, GraphML/GEXF/DOT/mermaid/adjacency-list, matrix honesty) | **HELD** | 16 format tests fail on pre-session code; spot-checks pass |

**Second-order damage found (the external-grader pass):**
- **NEW BUG (fixed first, per Phase 0 rules):** the `updateNode` hierarchy-cycle guard walked
  ancestors without a visited-set, so reparenting *any* node in a graph containing a
  pre-existing authored parent cycle (`x↔y`, which `createGraph` accepts) hung forever —
  old code returned. Fixed with a seen-set (src/graph.ts) + test
  ("does not hang when the graph has a pre-existing authored parent cycle").
- Doc drift fixed: `getDegree` JSDoc contradicted its own self-loop rule; `getPatches` JSDoc
  stated a patch order contradicting `toPatches`.
- Adjacent gap found and fixed in Phase 2: `isAcyclic` and `getCycles` disagreed on undirected
  *parallel-edge 2-cycles* (pre-existing — the root cause was the parent-*node* skip in the
  undirected cycle DFS; replaced with an arrival-*edge-id* skip).
- Confirmed clean: quick-walk determinism/termination, Prim weights, diff idempotence,
  null-unset edge cases (`weight: 0`, `label: null`), type inference at call sites.

**REGRESSED: nothing.** No Phase 0 measurement got worse.

## Phase 1 — re-ranking

The inherited next-5 survived re-estimation almost intact, with two corrections:

1. **Mode unification (#1, est. 1–2 days)** — re-scoped after discovering the hard part the
   estimate hid: cycle detection on genuinely *mixed* graphs cannot be done with DFS back-edge
   checks (a counterexample: `u→a`, `a→v` directed + `v—u` undirected has a 3-edge cycle that
   arrival-edge-skip DFS provably misses). Resolution: dispatch on **effective** modes — pure
   directed and pure non-directed graphs keep their exact polynomial algorithms; genuinely
   mixed graphs get exact simple-cycle *enumeration* with early exit for `isAcyclic`
   (worst-case expensive, documented). Centrality/MST/isomorphism are reachability-shaped, so
   per-edge arc expansion is exact there — no subtlety. **Done.**
2. **Standard-GraphML import (#2)** — estimate held. **Done** (nested `<graph>`, native
   `<port>`, `sourceport`/`targetport`, multi-graph-first); matrix legitimately upgraded.
3. **ELK port-id scheme (#3)** — re-estimated *down*: ELK requires document-unique ids, so the
   only defect was our emitter; no fragile prefix-stripping heuristics needed (the prior
   session's deferral reason was partly wrong). **Done** (`nodeId__portName` + metadata name,
   owner map keyed by unique id, old-format and external input both covered).
4. **mermaid/state emit (#4)** — the "needs a label-semantics decision" blocker was decided:
   `data.description` is authoritative; `label` emits via the description form and parses back
   into both. **Done** (isolated states, labels, `initialNodeId ↔ [*] -->`).
5. **Perf regression guard (#5)** — re-shaped: `vitest bench` has no assertions, so CI wiring
   alone guards nothing. Added a *thresholded test* (`tests/perf-regression.test.ts`, ~100×
   headroom against CI noise, fails on any return to per-read linear scans) which CI already
   runs, plus bench entries for the same operations. **Done.**

Added from Phase 0 / second reading: the updateNode hang fix, the invertDiff deep-copy, the
undirected 2-cycle consistency fix, Floyd-Warshall negative-cycle detection, NaN guards
(graphml/gexf/gml), MST output field preservation (same field-stripping class the prior session
fixed in transforms but missed in spanning-tree.ts), xyflow parent-before-child ordering.
Dropped from the backlog: nothing inherited was stale, but "wire `vitest bench` into CI" was
dropped as stated (replaced by the assertable test).

Competitive rows: all five now carry explicit decisions in ANALYSIS.md (two addressed where
the gap was correctness/adapter quality; ecosystem breadth, algorithm count, and renderer
audience accepted as non-goals; ngraph-class pathfinding speed left on the backlog behind a
perf guard).

## Phase 2 — what shipped (with numbers)

| Metric | Session start | Session end |
|---|---|---|
| Tests | 1220 (49 files) | **1284 (51 files)**; every behavior change verified failing-first (11/21 mode-unification tests fail without the changes; format agents confirmed per-fix) |
| Statement coverage | 92.71 % | **92.99 %** (lines 95.07 %) |
| `walks.ts` stmt coverage | 80.51 % | **90.76 %** (hardening budget) |
| `isomorphism.ts` stmt coverage | 92.77 % | **95.74 %** |
| 10k-node query sweep | 14 ms | 31 ms (noise; guarded < 2,000 ms by test) |
| Warm `getNode` | 0.3 µs | 0.4 µs (guarded by test) |

- **Mode unification** (`src/algorithms/{shared,traversal,paths,centrality,spanning-tree,isomorphism}.ts`):
  `getEffectiveModeKind` dispatch; exact mixed-graph cycle enumerator; per-edge mode in
  centrality helpers + degree centralities (now delegating to the mode-aware query functions),
  Prim, isomorphism signatures/edge-matching; `isIsomorphic` no longer requires equal graph
  `mode`. Override-equivalence suite proves `mode:'undirected'` graphs ≡ all-edges-overridden
  directed graphs across isAcyclic/cycles/centrality/PageRank/MST/SCC/isomorphism.
- **Undirected parallel 2-cycles**: arrival-edge-id skip in the undirected cycle DFS;
  `getCycles` now consistent with `isAcyclic`.
- **Floyd-Warshall**: throws on negative cycles (names the node, points to bellman-ford).
- **MST**: output preserves node ports/visual fields and edge mode/ports/color.
- **Standard-GraphML import + NaN guards** (graphml/gexf/gml) — see changeset for details.
- **ELK unique port ids**, **mermaid/state emit completeness**, **xyflow parent ordering**.
- **Phase 0 fixes**: updateNode hang, invertDiff deep-copy, two JSDoc corrections.
- README support-matrix table regenerated from `src/formats/support.ts`.

## Deliberately NOT done (and why)

- **Per-edge mode in connectivity.ts and community.ts** — both are *documented* as treating
  the graph as undirected (bridges/articulation points/communities are undirected concepts);
  honoring per-edge directedness there would change semantics, not fix them. Left as
  documented behavior.
- **Betweenness normalization still keyed on `graph.mode`** — traversal is per-edge correct;
  the normalization divisor is a reporting convention with no principled mixed-graph value.
  Documented here rather than invented.
- **Walk/`resolveFrom` root detection is direction-blind** (counts authored in-degree, ignores
  modes; duplicated in `walks.ts` and `algorithms/shared.ts`). Changing it changes which node
  is auto-selected as the start — behavioral risk for marginal benefit; backlog #4.
- **Low-severity format edges** carried from session 1: TGF separator/whitespace collisions,
  GML numeric labels, mermaid `_region_` substring collision, D2 unquoted `a--b` ambiguity,
  mermaid/state label-vs-description coexistence loss. None on a hot path.
- **getDiff `old`/`new` values alias the live graph's nested objects** (pre-existing,
  distinct from the fixed invertDiff aliasing). Deep-copying every diff would cost on large
  graphs; needs a measured decision. Backlog #5.
- Adding a linter (none configured) — owner decision, not a unilateral session change.

## Next 5 (re-estimated)

1. **Mixed-graph `isAcyclic` fast path** (~0.5–1 day): the exact enumerator is correct but
   worst-case expensive; add the polynomial pre-checks (directed-subgraph cycle → false;
   arc-expansion SCC singleton-ness → true) so enumeration only runs in the ambiguous middle.
   Only matters if users hit large dense mixed graphs — instrument first.
2. **Schema validation ↔ mutation API parity** (~0.5 day): `createGraph` accepts parent
   cycles and dangling refs that `validateGraph` (zod subpath) flags; the Phase 0 hang came
   from exactly this gap. Either validate in `createGraph` behind an opt-in, or document
   `validateGraph` as the required gate for untrusted input and wire it into `from*` parsers.
3. **mermaid family escape/`_region_` hardening** (~0.5–1 day): shared escaping is fixed, but
   region-marker substring collisions and flowchart `linkStyle` fragility remain the weakest
   round-trip claims.
4. **De-duplicate and mode-fix `resolveFrom`** (~0.25 day): one implementation in
   `algorithms/shared.ts`, used by walks; decide root detection semantics for non-directed
   edges and document.
5. **Large-graph pathfinding pass** (~1–2 days, only if demand): typed-array Dijkstra/A*
   (ngraph-class), driven by the bench suite added this session.

## Extended scope (same session, owner-directed): "fastest & best"

The owner directed execution of roadmap items #2–#5 (CSR core, differential testing, shared
config cloning, algorithm gaps). All landed; end state **1498 tests in 59 files**, typecheck
clean, `pnpm verify` green.

**CSR core** (`src/algorithms/csr.ts`): hot loops (closeness, betweenness, PageRank, HITS,
eigenvector, connected components) run on a compressed-sparse-row snapshot — `Int32Array`
arcs, integer node positions, zero string hashing in inner loops. Cached per `GraphIndex`
object + a new `version` counter (bumped by every structural API mutation, including per-edge
`mode` changes via `touchIndex`), revalidated against `graph.mode` — so it inherits the index
staleness contract exactly; `tests/csr.test.ts` pins all eight invalidation paths.

| Operation (2k nodes / 6k edges unless noted) | Before | After | vs graphology (same graph) |
|---|---|---|---|
| closeness | 2,575 ms | **73 ms** (35×) | — |
| betweenness | 4,597 ms | **169 ms** (27×) | ours 179 ms, theirs 296 ms (**1.7× faster**) |
| PageRank | 26 ms | **2 ms** (13×) | ours 2.2 ms, theirs 2.8 ms |
| HITS | 202 ms | **4 ms** (50×) | — |
| components (100k nodes / 100k edges) | 379 ms | **7 ms** (54×) | 0.8 vs 1.6 ms at 2k (**2× faster**) |

A thresholded betweenness test joined `tests/perf-regression.test.ts` so the CSR path can't
silently regress. Caveat for any public "fastest" claim: one machine, one graph shape — the
full competitor benchmark harness (former roadmap #1) remains open.

**Differential suite** (`tests/differential/`, 158 tests, ~0.7 s): graphology as oracle
(components, Dijkstra, PageRank, degrees, betweenness — each verified on a hand-checked
example before the random loop; one *pinned intentional divergence*: non-directed self-loop
degree is 1 for us, 2 for graphology) plus randomized self-properties (override-equivalence,
reverseGraph involution, diff convergence under 15 random API mutations, hasPath ⇔
getShortestPath, Prim ≡ Kruskal). **Zero genuine discrepancies found**, and the suite
re-validated the CSR rewrite end-to-end. graphology and four plugin packages are now
devDependencies.

**Shared config cloning** (`src/config.ts`): `toNodeConfig`/`toEdgeConfig` with a compile-time
exhaustiveness guard — adding a field to `GraphNode`/`GraphEdge` breaks the build until the
clone functions handle it (verified live with a fake field). Adopted by diff, transforms, and
spanning-tree (whose output previously *shared port objects* with the source graph — the
fourth instance of the silent-drop/aliasing class, now closed structurally as the convergence
judgment below recommended).

**New algorithms** (40 known-answer tests): `getLouvainCommunities` (deterministic, weighted),
`getMaxFlow` (Edmonds–Karp + min cut, CLRS network verified), `getDominatorTree`
(Cooper–Harvey–Kennedy, paper example verified; statechart framing in docs),
`getTransitiveReduction` (DAG-only with descriptive errors, fields preserved).

**Updated next-3 after this scope:** (1) competitor benchmark harness + published comparison
page — the prerequisite for claiming "fastest" publicly; (2) port Dijkstra/A*/simple-paths
onto CSR (paths still run on Map adjacency; same win available, more reconstruction care);
(3) the previous next-5 items that remain (mixed-`isAcyclic` fast path, schema-validation
parity, mermaid `_region_` hardening).

## Convergence judgment

**Converging.** Session 1 found crashers, silently-wrong results, and a 1,000×-class
performance defect in the core read path; this session's external re-audit of that work found
one medium-low new bug (a hang on already-malformed input), one overstated claim (nested
aliasing), and doc drift — strictly less severe, and the inherited backlog re-estimated
*accurately or generously* (ELK turned out easier than deferred). The structural risk worth
naming is the one pattern that produced bugs in both sessions: **field-list duplication** —
every layer (updates, diff keys, transforms, MST output, format converters) re-enumerates the
optional fields of nodes/edges by hand, and every new field or new output path risks another
silent-drop (session 1: transforms/diff/updates; session 2 found the same bug shape in
spanning-tree.ts). A single shared `cloneNodeConfig`/`cloneEdgeConfig` pair used by every
producer of configs would close the class rather than the instances; it didn't make the next-5
on impact-per-hour only because the known instances are now all fixed and tested — but if a
third session finds another silent-drop, build that abstraction before fixing the instance.
