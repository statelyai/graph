---
"@statelyai/graph": major
---

Add graph and edge `mode` directedness, replacing graph `type`, and add D2 format support.

Graphs now use `mode: 'directed' | 'undirected' | 'bidirectional'` as the graph-level default, and edges may override it with their own `mode`. Traversal, path, and query logic resolves effective edge mode so mixed directedness works consistently.

Adds `@statelyai/graph/d2` with parsing and emitting for D2 syntax, including hierarchy, ports, styles, comments, classes, imports, and connector directedness.
