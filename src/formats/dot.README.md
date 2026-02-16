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

```ts
import { toDOT, fromDOT, dotConverter } from '@statelyai/graph/dot';
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

### `fromDOT(dot): Graph`

```ts
const graph = fromDOT(`digraph G {
  rankdir=LR;
  a [label="Hello" shape=box fillcolor="#ff0000" style=filled];
  b [label="World"];
  a -> b -> c [label="next" color="blue"];
  subgraph cluster_group {
    label="Group";
    x; y;
    x -> y;
  }
}`);
```

Parses:
- `digraph`/`graph` → directed/undirected
- Node attributes: `label`, `shape` (mapped back from DOT names), `fillcolor`/`color`
- Edge attributes: `label`, `color`
- Edge chains (`a -> b -> c` → 2 edges)
- `subgraph` → compound node with `parentId`
- `rankdir` → `direction`
- `node [...]` / `edge [...]` default attributes
- Auto-creates nodes referenced in edges

**Not mapped:**
- HTML labels (`<...>`) — stored as raw string
- Port syntax (`:port:compass`)
- `rank=same` and layout hints beyond `rankdir`
- `style` attribute (beyond color extraction)

### `dotConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const dot = dotConverter.to(graph);
const graph = dotConverter.from(dot);
```
