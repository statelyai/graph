---
"@statelyai/graph": minor
---

Add edge weights, A* pathfinding, subgraph extraction, and graph reversal.

- `weight?: number` on edges; algorithms default to `(e) => e.weight ?? 1` with BFS fast path when unweighted
- `getAStarPath(graph, { from, to, heuristic })` for heuristic-guided shortest paths
- `getSubgraph(graph, nodeIds)` returns induced subgraph with internal edges
- `reverseGraph(graph, filterEdge?)` flips edge directions
- Remove stale TODO for Mermaid sequence blocks (already implemented)
