# Adjacency List

Converter for the adjacency list format — a plain `Record<string, string[]>` mapping each node ID to its neighbors.

## Resources

- [Adjacency list (Wikipedia)](https://en.wikipedia.org/wiki/Adjacency_list)

## API

```ts
import { toAdjacencyList, fromAdjacencyList } from '@statelyai/graph/adjacency-list';
```

### `toAdjacencyList(graph): Record<string, string[]>`

```ts
const adj = toAdjacencyList(graph);
// { a: ['b', 'c'], b: [], c: ['a'] }
```

### `fromAdjacencyList(adj, options?): Graph`

```ts
const graph = fromAdjacencyList(
  { a: ['b', 'c'], b: [], c: ['a'] },
  { directed: true, id: 'myGraph' }
);
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directed` | `boolean` | `true` | Whether the graph is directed |
| `id` | `string` | `''` | Graph ID |

> **Suggestion:** consider adding a `adjacencyListConverter` pre-built converter object (like other formats have) to this module.
