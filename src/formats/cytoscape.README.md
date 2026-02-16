# Cytoscape

Converter for [Cytoscape.js](https://js.cytoscape.org/) JSON format — the standard interchange format for the Cytoscape.js graph visualization library.

## Resources

- [Cytoscape.js documentation](https://js.cytoscape.org/)
- [Cytoscape.js JSON format](https://js.cytoscape.org/#notation/elements-json)

## API

```ts
import {
  toCytoscapeJSON,
  fromCytoscapeJSON,
  cytoscapeConverter,
} from '@statelyai/graph/cytoscape';
```

### `toCytoscapeJSON(graph): CytoscapeJSON`

```ts
const cyto = toCytoscapeJSON(graph);
// {
//   elements: {
//     nodes: [{ data: { id: 'a', label: 'A' } }],
//     edges: [{ data: { id: 'e0', source: 'a', target: 'b' } }]
//   }
// }
```

Preserves: `parentId` (as `parent`), position (`x`/`y`), `shape`, `color`, `width`, `height`, `label`, node/edge `data`, graph `direction`.

### `fromCytoscapeJSON(cyto): Graph`

```ts
const graph = fromCytoscapeJSON(cytoscapeJSON);
```

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
