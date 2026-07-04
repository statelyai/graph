# DOT

Converter for the [DOT language](https://graphviz.org/doc/info/lang.html) used by Graphviz.

**Requires peer dependency:** `dotparser`

```bash
npm install dotparser
```

## Resources

- [DOT language specification](https://graphviz.org/doc/info/lang.html)
- [Graphviz](https://graphviz.org/)
- [dotparser (npm)](https://www.npmjs.com/package/dotparser)

## API

<!-- exported symbols from src/formats/dot/index.ts -->

```ts
import { toDOT, fromDOT, dotConverter } from '@statelyai/graph/dot';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'etl',
  direction: 'right',
  nodes: [
    { id: 'extract', label: 'Extract', shape: 'rectangle', color: '#2196f3' },
    { id: 'transform', label: 'Transform', shape: 'diamond' },
    { id: 'load', label: 'Load', shape: 'rectangle', color: '#4caf50' },
  ],
  edges: [
    { id: 'e0', sourceId: 'extract', targetId: 'transform', label: 'raw data' },
    { id: 'e1', sourceId: 'transform', targetId: 'load', label: 'cleaned' },
  ],
});

const dot = toDOT(graph);
// digraph etl {
//   rankdir=LR;
//   extract [label="Extract", shape=box, fillcolor="#2196f3", style=filled];
//   transform [label="Transform", shape=diamond];
//   load [label="Load", shape=box, fillcolor="#4caf50", style=filled];
//   extract -> transform [label="raw data"];
//   transform -> load [label="cleaned"];
// }

// Import
const imported = fromDOT(`digraph deploy {
  rankdir=LR;
  build [label="Build" shape=box];
  test [label="Test" shape=box];
  staging [label="Staging" shape=ellipse];
  prod [label="Production" shape=box fillcolor="#4caf50" style=filled];
  build -> test;
  test -> staging [label="passed"];
  staging -> prod [label="approved"];
}`);
// a graph containing:
// nodes: - build - test - staging - prod
// edges: - (build -> test) - (test -> staging) - (staging -> prod)
```

### `toDOT(graph): string`

Uses `digraph`/`->` for directed graphs, `graph`/`--` for undirected. Preserves: `label`, `shape` (mapped to DOT names), `color` (as `fillcolor`), `direction` (as `rankdir`), edge `color`, and edge `sourcePort` / `targetPort` as `node:port` endpoints.

### `fromDOT(dot): Graph`

Parses:
- `digraph`/`graph` → directed/undirected
- Node attributes: `label`, `shape` (mapped back), `fillcolor`/`color`
- Edge attributes: `label`, `color`
- Edge port ids from `node:port` endpoints
- Edge chains (`a -> b -> c` → 2 edges)
- `subgraph` → compound node with `parentId`
- `rankdir` → `direction`
- `node [...]` / `edge [...]` default attributes
- Auto-creates nodes referenced in edges

### Round-trip preservation

Constructs that have no native `Graph`/`Node`/`Edge` field are preserved under a
single namespaced `dot` key inside the relevant entity's `data`, so
`fromDOT` → `toDOT` is non-lossy for them (matching how the graphml/gexf/gml
converters store unmapped state in `data`). The value is plain JSON.

- **Graph** `data.dot`:
  - `attrs` — leftover `graph [...]` attributes (`bgcolor`, `fontname`, …; `rankdir` is excluded, it maps to `direction`).
  - `nodeDefaults` / `edgeDefaults` — the `node [...]` / `edge [...]` default attribute bags declared at graph scope.
  - `ranks` — `rank=same` (and `min`/`max`/…) groups, as `{ rank, nodes }`. Rank subgraphs are treated as layout constraints, not compound nodes.
- **Node / Edge** `data.dot`:
  - `attrs` — any attribute not mapped to a native field (`label`, `shape`, `color`).
  - `labelHtml` — set when the label came from an HTML-like `<...>` value; the label string is stored verbatim and re-emitted with `<>` delimiters.
  - `sourceCompass` / `targetCompass` (edges) — compass points from `node:port:compass` port syntax, re-emitted as the third `:`-segment.

**Remaining known losses:**
- Compass points only survive when written in the full three-segment
  `node:port:compass` form. A two-segment `node:se` is ambiguous (dotparser
  reports `se` as the port id, not a compass), so it round-trips as a port.
- Statement ordering and comments are not preserved (attributes are re-emitted
  in a canonical order).
- `style` on nodes is partly interpreted: `color`/`fillcolor` become the native
  `color` field; the raw `style` attribute is otherwise kept in the `dot.attrs`
  bag rather than reconstructed field-by-field.

### `dotConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const dot = dotConverter.to(graph);
const graph = dotConverter.from(dot);
```
