---
'@statelyai/graph': minor
---

New algorithms, public kernel, cancellation, and format fidelity:

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
