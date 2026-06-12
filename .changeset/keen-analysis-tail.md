---
'@statelyai/graph': minor
---

Analytical coverage tail: cores, Katz, bipartite matching, min-cut, seeded label propagation, and graph generators.

- **k-core** — `getCoreNumbers(graph)` (Batagelj–Zaveršnik, O(m)) and `getKCore(graph, k)`; degrees are undirected per the standard definition.
- **Katz centrality** — `getKatzCentrality(graph, { alpha, beta, getWeight, ... })`; throws a descriptive error when `alpha` exceeds the spectral bound and iteration diverges.
- **Eigenvector centrality** hardened — `(A+I)`-shifted power iteration (no more bipartite oscillation), `getWeight` support, descriptive non-convergence error. Differentially tested against graphology.
- **Bipartite** — `isBipartite(graph)` and `getMaximumBipartiteMatching(graph)` (Hopcroft–Karp, O(m√n)); the non-bipartite error names the edge that closes the odd cycle.
- **Min-cut** — `getMinCut(graph, { source, sink, getCapacity? })` → `{ value, cutEdges, partition }`, sharing the max-flow solver (`value` always equals `getMaxFlow(...)` by construction).
- **Seeded label propagation** — `getLabelPropagationCommunities` gains `seed`: asynchronous LPA with seeded shuffling/tie-breaking, deterministic per seed.
- **Generators** — `createCompleteGraph(n)`, `createGridGraph(rows, cols)`, `createRandomGraph(n, p, { seed })` (G(n,p), deterministic per seed) in the root export.
