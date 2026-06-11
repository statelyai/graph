---
'@statelyai/graph': minor
---

Mode unification, standard-GraphML import, and follow-up fixes:

- **Per-edge `mode` overrides now work everywhere.** `isAcyclic`/`getCycles` dispatch on effective edge modes — genuinely mixed graphs (directed + non-directed edges) use an exact simple-cycle search (correct, may be expensive on large dense mixed graphs); centrality (degree/in/out, closeness, PageRank, HITS, eigenvector), Prim MST, and `isIsomorphic` all honor per-edge modes. `isIsomorphic` no longer requires equal graph-level `mode` (effective edge modes are what's structural). Two parallel undirected edges are now correctly reported as a 2-cycle by `getCycles` (consistent with `isAcyclic`).
- **MST output preserves entity fields** (node ports/shape/visual props; edge `mode`/ports/color) instead of stripping them.
- **Floyd-Warshall detects negative cycles** and throws a descriptive error instead of crashing during path reconstruction.
- **Standard-GraphML import:** nested `<graph>` elements → `parentId` hierarchy, native `<port>` elements → ports, `sourceport`/`targetport` attributes → edge port refs; multi-graph documents import the first graph. The format-support matrix is legitimately back to full hierarchy/ports for GraphML. Numeric `<data>` values that aren't numbers now throw a descriptive error (also in GEXF/GML) instead of silently poisoning the graph with NaN.
- **ELK port ids are document-unique** (`nodeId__portName`) as ELK requires; original port names round-trip via metadata; external ELK input with ports resolves to correct endpoints.
- **mermaid/state emit:** isolated plain states are emitted; node labels emit via `state "label" as id` (and parse back into `label`); `graph.initialNodeId` round-trips as a top-level `[*] -->` transition.
- **xyflow:** parents are ordered before children in `toXYFlow` output, as React Flow requires.
- Fixes from re-auditing the previous release: `updateNode` no longer hangs when reparenting onto a graph with a pre-existing authored parent cycle; `invertDiff` deep-copies nested values (ports/style/data) instead of sharing them with the input.
- New perf regression test guards the O(1) index read path.
