# Cytoscape

Converter for [Cytoscape.js](https://js.cytoscape.org/) JSON format — the standard interchange format for the Cytoscape.js graph visualization library.

**Requires peer dependency:** `cytoscape`

```bash
npm install cytoscape
```

## Resources

- [Cytoscape.js documentation](https://js.cytoscape.org/)
- [Cytoscape.js JSON format](https://js.cytoscape.org/#notation/elements-json)

## API

<!-- exported symbols from src/formats/cytoscape/index.ts -->

```ts
import { toCytoscapeJSON, fromCytoscapeJSON, cytoscapeConverter } from '@statelyai/graph/cytoscape';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'workflow',
  nodes: [
    { id: 'start', label: 'Start', shape: 'circle', color: '#4caf50' },
    { id: 'process', label: 'Process Data', shape: 'rectangle' },
    { id: 'end', label: 'End', shape: 'circle', color: '#f44336' },
  ],
  edges: [
    { id: 'e0', sourceId: 'start', targetId: 'process', label: 'begin' },
    { id: 'e1', sourceId: 'process', targetId: 'end', label: 'done' },
  ],
});

const cyto = toCytoscapeJSON(graph);
// {
//   elements: {
//     nodes: [{ data: { id: 'start', label: 'Start' } }, ...],
//     edges: [{ data: { id: 'e0', source: 'start', target: 'process' } }, ...]
//   }
// }

// Import
const imported = fromCytoscapeJSON({
  elements: {
    nodes: [
      { data: { id: 'sensor', label: 'Sensor' }, position: { x: 0, y: 0 } },
      { data: { id: 'controller', label: 'Controller' }, position: { x: 100, y: 0 } },
      { data: { id: 'actuator', label: 'Actuator' }, position: { x: 200, y: 0 } },
    ],
    edges: [
      { data: { id: 'e0', source: 'sensor', target: 'controller' } },
      { data: { id: 'e1', source: 'controller', target: 'actuator' } },
    ],
  },
});
// a graph containing:
// nodes: - sensor - controller - actuator
// edges: - e0 (sensor -> controller) - e1 (controller -> actuator)
```

Preserves: `parentId` (as `parent`), position (`x`/`y`), `shape`, `color`, `width`, `height`, `label`, node/edge `data`, graph `direction`.

### `cytoscapeConverter`

Pre-built `GraphFormatConverter<CytoscapeJSON>`:

```ts
const cyto = cytoscapeConverter.to(graph);
const graph = cytoscapeConverter.from(cyto);
```

### Types

| Type | Description |
|------|-------------|
| `CytoscapeJSON` | Top-level `{ data?, elements: { nodes, edges } }` |
| `CytoscapeNode` | `{ data: { id, parent?, ... }, position? }` |
| `CytoscapeEdge` | `{ data: { id, source, target, ... } }` |
