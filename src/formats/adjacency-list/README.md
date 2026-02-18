# Adjacency List

Converter for the adjacency list format — a plain `Record<string, string[]>` mapping each node ID to its neighbors.

## Resources

- [Adjacency list (Wikipedia)](https://en.wikipedia.org/wiki/Adjacency_list)

## API

```ts
import { toAdjacencyList, fromAdjacencyList, adjacencyListConverter } from '@statelyai/graph/adjacency-list';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'social',
  nodes: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
    { id: 'carol', label: 'Carol' },
  ],
  edges: [
    { id: 'e0', sourceId: 'alice', targetId: 'bob' },
    { id: 'e1', sourceId: 'alice', targetId: 'carol' },
    { id: 'e2', sourceId: 'bob', targetId: 'carol' },
  ],
});

const adj = toAdjacencyList(graph);
// { alice: ['bob', 'carol'], bob: ['carol'], carol: [] }

// Import
const imported = fromAdjacencyList({
  server: ['db', 'cache', 'queue'],
  db: [],
  cache: [],
  queue: ['db'],
}, { directed: true, id: 'backend' });
// a graph containing:
// nodes: - server - db - cache - queue
// edges: - (server -> db) - (server -> cache) - (server -> queue) - (queue -> db)
```

### `toAdjacencyList(graph): Record<string, string[]>`

Returns a record mapping each node ID to its outgoing neighbor IDs.

### `fromAdjacencyList(adj, options?): Graph`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directed` | `boolean` | `true` | Whether the graph is directed |
| `id` | `string` | `''` | Graph ID |

### `adjacencyListConverter`

Pre-built `GraphFormatConverter<Record<string, string[]>>`:

```ts
const adj = adjacencyListConverter.to(graph);
const graph = adjacencyListConverter.from(adj);
```
