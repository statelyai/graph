# Scaling & Plugin Architecture

Design decisions for large graphs, long-running algorithms, incremental work,
and third-party extensions. Status: decided 2026-07 — implementation tracked below.

## Principle

**JSON is the canonical representation. Typed arrays are the compute layer.**

A `Graph` is always a plain JSON-serializable object. Performance comes from
*derived* structures — the adjacency index (`src/indexing.ts`) and the CSR
snapshot (`src/algorithms/csr.ts`, flat `Int32Array`s) — which are cached in
`WeakMap`s keyed on the graph, revalidated in O(1) via a version counter, and
never serialized. Rebuild cost is paid once per structural change, not per query.

This is already how the hot paths work (traversal, paths, centrality, cores,
bipartite). The gaps below are about making the pattern public, complete, and
cancellable — not changing the model.

## Decisions

### 1. The kernel becomes public (`@statelyai/graph/kernel`)

New subpath exporting the primitives third-party algorithm authors and
large-graph users need, with the same semver guarantees as the rest of the API:

- `getIndex(graph)` / `GraphIndex` — adjacency maps + `version` counter
- `getCSR(graph)` / `GraphCSR` — typed-array snapshot for inner loops
- `invalidateIndex(graph)` (already public at root; re-exported here)
- `memoizeByGraph(fn)` — result memoization keyed on `(graph index identity,
  version, argsKey)`. Repeated queries on an unchanged graph become O(1);
  any mutation (which bumps `version`) invalidates automatically. The library
  itself does not pre-memoize algorithm results — callers opt in.

Rationale: without this, a third-party algorithm must rebuild adjacency from
`graph.nodes`/`graph.edges` on every call and has no way to participate in the
invalidation contract. This is the entire difference between "external code"
and "first-class algorithm."

### 2. Cancellation: `signal?: AbortSignal` on expensive algorithms

Every super-linear or iterative `get*` algorithm accepts an optional
`signal` in its options and checks it periodically (per source/iteration, not
per inner-loop step). On abort it throws `signal.reason`.

Targets: betweenness, closeness, PageRank, HITS, eigenvector, Katz, Louvain,
greedy modularity, label propagation, Girvan–Newman, max-flow/min-cut,
all-pairs shortest paths, isomorphism, dominator tree.

Not adopted: a bundled worker runtime, or `onProgress` callbacks. Workers are
a *recipe*, not a runtime: graphs are plain JSON, so `structuredClone`/
`postMessage` the graph to a worker and run the algorithm there — zero
serialization layer. Documented in README with a worked example. `gen*`
generators remain the cooperative-slicing story for main-thread work.

### 3. Incremental algorithms: memoization now, dynamic structures next

- **Now**: `memoizeByGraph` (above) gives version-keyed result reuse for free.
- **Next** (first true incremental algorithm): `createDynamicComponents(graph)`
  — a union-find handle over connected components that consumes edge/node
  *additions* in O(α) instead of recomputing, and falls back to full recompute
  on deletions (fully dynamic connectivity is not worth its complexity here).
  Same pattern later for incremental PageRank if demand appears.
- Explicitly rejected: automatic background recomputation or observable
  graphs. Mutation stays explicit and synchronous; derived caches stay lazy.

### 4. Large graphs (1M+ nodes)

- Extend CSR coverage to the algorithms that still walk JSON objects:
  Louvain, community, flow, connectivity/SCC, dominators, spanning-tree.
- Defer: a columnar interchange format (flat id/edge arrays). JSON objects
  are fine to ~10⁵–10⁶; if real users hit build-time walls, columnar input is
  an additive `fromColumnar()` — not a change to the model.

### 5. Plugin interface: conventions + kernel, no registry

A plugin is an npm package of standalone prefixed functions taking `graph`
first — exactly like the built-ins — built on `@statelyai/graph/kernel` for
the fast path and `memoizeByGraph` for caching.

- npm keyword: `statelyai-graph-plugin` (discoverability)
- Docs page: how to write one (conventions table, kernel usage, testing
  against the JSON schema, differential-testing pattern)
- **Rejected**: `GraphInstance.use()` / method-chaining registries. They fight
  tree-shaking, break TypeScript inference, and add a second calling
  convention. The standalone-function model *is* the plugin model; the kernel
  subpath is what makes it viable for outsiders.

## Implementation checklist

- [ ] `src/kernel.ts` + `memoizeByGraph` + tests
- [ ] `./kernel` subpath in package.json exports + tsdown entry
- [ ] `signal` support across the algorithms listed in §2 + tests
- [ ] README: worker recipe, kernel docs, plugin authoring guide
- [ ] `createDynamicComponents` (follow-up)
- [ ] CSR coverage for Louvain/flow/connectivity (follow-up)
