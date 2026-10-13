# D3

Converter for [D3.js](https://d3js.org/) force-directed graph JSON — the `{ nodes, links }` format used by `d3-force`.

## Preservation

<!-- preservation contract for d3 derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Numeric endpoints resolve as node indices and are rebased after node edits. String IDs and live node references are supported. Imported native properties, including fixed positions and velocities, are retained in a JSON snapshot; serializable node lineage preserves native attributes across renames. New replacement nodes require their own attributes. Null labels, independent geometry and Graph field presence use versioned metadata.


<!-- native metadata policy derived from src/formats/preservation.ts -->

Native snapshots use a private JSON convention on Graph data. Import options
`{ metadata: 'native' }` disable adapter marker interpretation. A foreign value
that deliberately matches the marker schema remains ambiguous in automatic mode.
Comments, lexical formatting and source locations are not preserved.

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

Handles D3's mutated link objects where `source`/`target` may be node objects (after simulation) strings, or numeric node indices.

<!-- D3 fidelity notes derived from src/formats/d3/index.ts -->

Also maps selected graph `id`, `mode`, `initialNodeId`, `data`, `direction`, `style`, node hierarchy/layout/style fields, and edge layout/style/weight fields through the loose `{ nodes, links }` object shape. Ports and edge port references round-trip as `ports`, `sourcePort`, and `targetPort`.

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
| `D3Link` | String IDs, numeric indices or live node objects as endpoints |
| `D3ImportOptions` | Reserved metadata interpretation override |


## Native documents

<!-- d3DocumentConverter derived from src/formats/d3/index.ts and src/formats/document/index.ts -->

`d3DocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Labels, Graph data, styles, weights and mapped geometry use direct native fields. Node/edge IDs, endpoints, hierarchy and array order edits reject. Numeric and object endpoint tokens retain their original source representation. Node edits that would leave duplicated fields in embedded object endpoints stale reject: runtime alias identity is outside the JSON source domain. ID-only object endpoints support independent node edits.

Bare exports interpret recognized import carriers by default. Use
`{ nativeCarrier: false }` when Graph data is user-authored and could match the
private carrier schema. Document projection pins importer state to its external
source before unwrapping it, preserving foreign lookalikes.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

For strict document edge patches, a generated `e0` identity is valid only while
the native link record sequence remains unchanged. Otherwise a unique explicit
native link `id` must exist in both baseline and current source. A new link bearing
`id: "e0"` cannot retroactively validate a historical ID-less link. Ambiguous
insertion/removal/reordering/record changes reject with `ambiguous-native-identity`.
Stable IDs permit independent native data updates; source-only changes and stable
node-label patches remain supported.
