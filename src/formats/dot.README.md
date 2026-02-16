# DOT

Serializer for the [DOT language](https://graphviz.org/doc/info/lang.html) used by Graphviz.

## Resources

- [DOT language specification](https://graphviz.org/doc/info/lang.html)
- [Graphviz](https://graphviz.org/)

## API

```ts
import { toDOT } from '@statelyai/graph/dot';
```

### `toDOT(graph): string`

```ts
const dot = toDOT(graph);
// digraph myGraph {
//   rankdir=LR;
//   a [label="A", shape=box];
//   b;
//   a -> b [label="next"];
// }
```

Preserves: `label`, `shape` (mapped to DOT names), `color` (as `fillcolor`), `direction` (as `rankdir`), edge `color`.

Uses `digraph`/`->` for directed graphs, `graph`/`--` for undirected.

> **Note:** This module is export-only (no `fromDOT` parser). For DOT parsing, consider using a dedicated DOT parser library and converting to a `Graph` via `createGraph()`.

> **Suggestion:** Add a `fromDOT` parser for round-trip support.
