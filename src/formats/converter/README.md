# Converter

Utility for creating custom `GraphFormatConverter` objects from `to`/`from` function pairs.

## API

<!-- exported symbols from src/formats/converter/index.ts -->

```ts
import { createFormatConverter } from '@statelyai/graph/converter';
import { createGraph } from '@statelyai/graph';

// Build a custom CSV converter
const csvConverter = createFormatConverter(
  (graph) => {
    return graph.edges
      .map((e) => `${e.sourceId},${e.targetId}`)
      .join('\n');
  },
  (csv) => {
    const edges = csv.split('\n').map((line, i) => {
      const [sourceId, targetId] = line.split(',');
      return { id: `e${i}`, sourceId, targetId };
    });
    const nodeIds = new Set(edges.flatMap((e) => [e.sourceId, e.targetId]));
    return createGraph({
      nodes: [...nodeIds].map((id) => ({ id, label: id })),
      edges,
    });
  },
);

const graph = createGraph({
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ],
  edges: [
    { id: 'e0', sourceId: 'a', targetId: 'b' },
    { id: 'e1', sourceId: 'b', targetId: 'c' },
  ],
});

const csv = csvConverter.to(graph);
// "a,b\nb,c"

const imported = csvConverter.from('x,y\ny,z\nz,x');
// a graph containing:
// nodes: - x - y - z
// edges: - e0 (x -> y) - e1 (y -> z) - e2 (z -> x)
```

### `createFormatConverter(to, from): GraphFormatConverter<T>`

Creates a converter with `.to(graph)` and `.from(data)` methods.

This module also re-exports pre-built converters for the simplest formats:

- `adjacencyListConverter` — `GraphFormatConverter<Record<string, string[]>>`
- `edgeListConverter` — `GraphFormatConverter<[string, string][]>`
