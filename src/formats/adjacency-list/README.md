# Adjacency List

Converter for the adjacency list format — a plain `Record<string, string[]>` mapping each node ID to its neighbors.

## Preservation

<!-- preservation contract for adjacency-list derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

The minimal adjacency representation omits isolated edge IDs, labels, arbitrary metadata and geometry. Export respects each edge mode. Import collapses repeated neighbors by default; `{ parallel: 'preserve' }` retains directed duplicates and reciprocal undirected multiplicity. Dictionary keys such as `__proto__` are handled safely without changing the plain-object return shape.

## Resources

- [Adjacency list (Wikipedia)](https://en.wikipedia.org/wiki/Adjacency_list)

## API

<!-- exported symbols from src/formats/adjacency-list/index.ts -->

```ts
import { toAdjacencyList, fromAdjacencyList } from '@statelyai/graph/adjacency-list';
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
import { adjacencyListConverter } from '@statelyai/graph/converter';

const adj = adjacencyListConverter.to(graph);
const graph = adjacencyListConverter.from(adj);
```


## Native documents

<!-- adjacencyListDocumentConverter derived from src/formats/adjacency-list/index.ts and src/formats/document/index.ts -->

`adjacencyListDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Original neighbor order and duplicate entries stay intact. Graph edits reject because the minimal format cannot encode Graph labels, data, geometry or stable edge IDs.
