# Edge List

Converter for the edge list format — a simple `[source, target][]` array of tuples.

## Preservation

<!-- preservation contract for edge-list derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **full**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

The minimal tuple representation preserves endpoint tuples and order, while omitting isolated nodes, edge IDs, labels, metadata and geometry. Import validates endpoint tuples; this format cannot provide a full Graph round-trip.

## Resources

- [Edge list (Wikipedia)](https://en.wikipedia.org/wiki/Edge_list)

## API

<!-- exported symbols from src/formats/edge-list/index.ts -->

```ts
import { toEdgeList, fromEdgeList } from '@statelyai/graph/edge-list';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'infra',
  nodes: [
    { id: 'web', label: 'Web Server' },
    { id: 'api', label: 'API Server' },
    { id: 'db', label: 'Database' },
    { id: 'cache', label: 'Cache' },
  ],
  edges: [
    { id: 'e0', sourceId: 'web', targetId: 'api' },
    { id: 'e1', sourceId: 'api', targetId: 'db' },
    { id: 'e2', sourceId: 'api', targetId: 'cache' },
  ],
});

const edges = toEdgeList(graph);
// [['web', 'api'], ['api', 'db'], ['api', 'cache']]

// Import
const imported = fromEdgeList([
  ['login', 'dashboard'],
  ['dashboard', 'settings'],
  ['dashboard', 'profile'],
  ['settings', 'logout'],
  ['profile', 'logout'],
], { directed: true, id: 'navigation' });
// a graph containing:
// nodes: - login - dashboard - settings - profile - logout
// edges: - (login -> dashboard) - (dashboard -> settings) - (dashboard -> profile) - (settings -> logout) - (profile -> logout)
```

### `toEdgeList(graph): [string, string][]`

Returns an array of `[sourceId, targetId]` tuples.

### `fromEdgeList(edges, options?): Graph`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directed` | `boolean` | `true` | Whether the graph is directed |
| `id` | `string` | `''` | Graph ID |

Nodes are auto-created from edge endpoints. Node/edge `data` and `label` are not preserved (minimal format).

### `edgeListConverter`

Pre-built `GraphFormatConverter<[string, string][]>`:

```ts
import { edgeListConverter } from '@statelyai/graph/converter';

const edges = edgeListConverter.to(graph);
const graph = edgeListConverter.from(edges);
```


## Native documents

<!-- edgeListDocumentConverter derived from src/formats/edge-list/index.ts and src/formats/document/index.ts -->

`edgeListDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Original tuple order and duplicate entries stay intact. Graph edits reject because endpoint tuples cannot encode Graph labels, data, geometry or stable entity IDs.
