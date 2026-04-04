---
"@statelyai/graph": minor
---

Clean up and simplify type definitions:

- Remove `GraphEntityConfig`; merged into `GraphEntity`
- Export `VisualGraphFormatConverter` from main entry
- Rename `Positioned` export to `EntityRect`
- Simplify `VisualNode`, `VisualEdge`, `VisualPort` to use property narrowing instead of `Omit`
- Fix `Graph<any, E>` → `Graph<N, E>` on exported APIs for better generic propagation
- Normalize `label` to `string | null` on both `GraphNode` and `GraphEdge` (node label default changed from `''` to `null`)
