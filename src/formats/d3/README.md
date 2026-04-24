# D3

Converter for [D3.js](https://d3js.org/) force-directed graph JSON — the `{ nodes, links }` format used by `d3-force`.

## Resources

- [d3-force documentation](https://d3js.org/d3-force)
- [Force-directed graph example](https://observablehq.com/@d3/force-directed-graph)

## API

<!-- exported symbols from src/formats/d3/index.ts -->

```ts
import { toD3Graph, fromD3Graph, d3Converter } from '@statelyai/graph/d3';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'deps',
  nodes: [
    { id: 'react', label: 'React' },
    { id: 'react-dom', label: 'ReactDOM' },
    { id: 'scheduler', label: 'Scheduler' },
  ],
  edges: [
    { id: 'e0', sourceId: 'react-dom', targetId: 'react' },
    { id: 'e1', sourceId: 'react-dom', targetId: 'scheduler' },
    { id: 'e2', sourceId: 'react', targetId: 'scheduler' },
  ],
});

const d3 = toD3Graph(graph);
// {
//   nodes: [{ id: 'react', label: 'React' }, ...],
//   links: [{ source: 'react-dom', target: 'react' }, ...]
// }

// Import
const imported = fromD3Graph({
  nodes: [
    { id: 'app', label: 'App' },
    { id: 'auth', label: 'Auth Service' },
    { id: 'store', label: 'Data Store' },
  ],
  links: [
    { source: 'app', target: 'auth' },
    { source: 'app', target: 'store' },
    { source: 'auth', target: 'store' },
  ],
});
// a graph containing:
// nodes: - app - auth - store
// edges: - (app -> auth) - (app -> store) - (auth -> store)
```

Handles D3's mutated link objects where `source`/`target` may be node objects (after simulation) or strings.

<!-- D3 fidelity notes derived from src/formats/d3/index.ts -->

Also preserves `ports`, `sourcePort`, and `targetPort` through the loose `{ nodes, links }` object shape.

### `d3Converter`

Pre-built `GraphFormatConverter<D3Graph>`:

```ts
const d3 = d3Converter.to(graph);
const graph = d3Converter.from(d3);
```

### Types

| Type | Description |
|------|-------------|
| `D3Graph` | `{ nodes: D3Node[], links: D3Link[] }` |
| `D3Node` | `{ id: string, [key: string]: any }` |
| `D3Link` | `{ source: string, target: string, [key: string]: any }` |

> **Note:** `fromD3Graph` always produces a `directed` graph.
