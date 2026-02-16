# Edge List

Converter for the edge list format — a simple `[source, target][]` array of tuples.

## Resources

- [Edge list (Wikipedia)](https://en.wikipedia.org/wiki/Edge_list)

## API

```ts
import { toEdgeList, fromEdgeList } from '@statelyai/graph/edge-list';
```

### `toEdgeList(graph): [string, string][]`

```ts
const edges = toEdgeList(graph);
// [['a', 'b'], ['b', 'c'], ['c', 'a']]
```

### `fromEdgeList(edges, options?): Graph`

```ts
const graph = fromEdgeList(
  [['a', 'b'], ['b', 'c']],
  { directed: false, id: 'myGraph' }
);
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directed` | `boolean` | `true` | Whether the graph is directed |
| `id` | `string` | `''` | Graph ID |

Nodes are auto-created from edge endpoints. Node/edge `data` and `label` are not preserved (minimal format).

> **Suggestion:** consider adding a `edgeListConverter` pre-built converter object (like other formats have) to this module.
