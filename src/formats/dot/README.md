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

**Not fully mapped:**
- HTML labels (`<...>`) — stored as raw string
- Compass points in port syntax (`:port:compass`)
- `rank=same` and layout hints beyond `rankdir`
- `style` attribute (beyond color extraction)

### `dotConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const dot = dotConverter.to(graph);
const graph = dotConverter.from(dot);
```
