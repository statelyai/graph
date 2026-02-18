# Edge List

Converter for the edge list format — a simple `[source, target][]` array of tuples.

## Resources

- [Edge list (Wikipedia)](https://en.wikipedia.org/wiki/Edge_list)

## API

```ts
import { toEdgeList, fromEdgeList, edgeListConverter } from '@statelyai/graph/edge-list';
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
const edges = edgeListConverter.to(graph);
const graph = edgeListConverter.from(edges);
```
