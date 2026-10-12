# Cytoscape

Converter for [Cytoscape.js](https://js.cytoscape.org/) JSON format — the standard interchange format for the Cytoscape.js graph visualization library.

<!-- runtime dependencies derived from src/formats/cytoscape/index.ts -->

The converter uses plain JSON and does not require the `cytoscape` runtime.
Install `cytoscape` only when passing the converted data to Cytoscape.js.

## Preservation

<!-- preservation contract for cytoscape derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Imports grouped elements, including omitted empty groups from `cy.json()`, and flat element arrays. Grouped output retains native element properties, viewport and user data through a JSON snapshot. Null labels, empty strings and independent coordinates use versioned metadata. Edge IDs that collide with node IDs are qualified for Cytoscape’s global element namespace, with Graph IDs retained in metadata. Flat input is normalized to grouped output; declaration order across node and edge groups is not preserved.


<!-- native metadata policy derived from src/formats/preservation.ts -->

Native snapshots use a private JSON convention on Graph data. Serialize `cy.json()` before document import to remove JavaScript-only undefined fields. Import options
`{ metadata: 'native' }` disable adapter marker interpretation. A foreign value
that deliberately matches the marker schema remains ambiguous in automatic mode.
Comments, lexical formatting and source locations are not preserved.

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

<!-- Cytoscape fidelity notes derived from src/formats/cytoscape/index.ts -->

Maps selected graph `mode`, `initialNodeId`, `data`, `direction`, `style`; node `parentId` (as `parent`), position (`x`/`y`), `shape`, `color`, `width`, `height`, `style`, `label`, `ports`; and edge `weight`, visual/style fields, `sourcePort`, `targetPort`, and `data`.

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


## Native documents

<!-- cytoscapeDocumentConverter derived from src/formats/cytoscape/index.ts and src/formats/document/index.ts -->

`cytoscapeDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Grouped and flat source shapes, including interleaved elements, stay intact. Labels, mapped styles/weights/geometry and user data patch native fields. Structural edits and user data colliding with native entity keys reject.

Bare exports interpret recognized import carriers by default. Use
`{ nativeCarrier: false }` when Graph data is user-authored and could match the
private carrier schema. Document projection pins importer state to its external
source before unwrapping it, preserving foreign lookalikes.
