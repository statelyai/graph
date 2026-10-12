# ELK

Converter for [ELK](https://eclipse.dev/elk/) (Eclipse Layout Kernel) JSON — the layout format consumed by [`elkjs`](https://github.com/kieler/elkjs). Works with `VisualGraph` since ELK expects/produces positions and sizes.

## Preservation

<!-- preservation contract for elk derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Imports extended and primitive edges, ports, labels and sections. Primitive edges normalize to extended output, with new routing-section IDs qualified against existing native elements. Export allocates globally unique node, root, port and edge IDs, retaining ordinary port IDs when available. Hyperedges are rejected explicitly. Versioned metadata preserves Graph field presence and authored order; native snapshots retain additional labels, sections and options. The imported first section retains its native ID and additional keyed sections when geometry changes. Editing arrays without stable entity IDs can replace their native details; this is not a document editing API.


<!-- native metadata policy derived from src/formats/preservation.ts -->

Native snapshots use a private JSON convention on Graph data. Import options
`{ metadata: 'native' }` disable adapter marker interpretation. A foreign value
that deliberately matches the marker schema remains ambiguous in automatic mode.
Comments, lexical formatting and source locations are not preserved.

## Resources

- [ELK documentation](https://eclipse.dev/elk/documentation.html)
- [elkjs on npm](https://www.npmjs.com/package/elkjs)

## API

<!-- exported symbols from src/formats/elk/index.ts -->

```ts
import { toELK, fromELK, elkConverter } from '@statelyai/graph/elk';
import { createVisualGraph } from '@statelyai/graph';
import ELK from 'elkjs';

const graph = createVisualGraph({
  nodes: [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 0, y: 0, width: 100, height: 50 },
  ],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
});

// Export → lay out → re-import
const elk = new ELK();
const laidOut = await elk.layout(toELK(graph));
const positioned = fromELK(laidOut);
```

### Compound nodes

Parent/child hierarchy maps to ELK's nested `children`. Edges whose source and target are both descendants of a compound node are placed on that node's `edges` array; all other edges live on the root.

### Ports

`VisualPort.name` is qualified as `nodeId__portName` for ELK `port.id`; the original name is stored in metadata. This qualification can collide. `direction` maps to `org.eclipse.elk.port.side`:

| `direction` | ELK `port.side` |
| --- | --- |
| `'in'` | `WEST` |
| `'out'` | `EAST` |
| `'inout'` | (unset) |

Edges referencing a port use the port id in `sources`/`targets`; `fromELK` resolves port ids back to `(nodeId, portName)` via a port-owner map.

### Direction

`VisualGraph.direction` maps to ELK's `elk.direction` layout option (`down`/`up`/`right`/`left` ↔ `DOWN`/`UP`/`RIGHT`/`LEFT`).

### `elkConverter`

Pre-built `VisualGraphFormatConverter<ElkNode>`:

```ts
const elk = elkConverter.to(graph);
const roundTripped = elkConverter.from(elk);
```

### Types

| Type | Description |
| --- | --- |
| `ElkNode`, `ElkExtendedEdge`, `ElkPort`, `ElkLabel`, `LayoutOptions`, … | Re-exported from `elkjs/lib/elk-api` for convenience |

> **Peer dependency:** `elkjs` (optional) — install it to actually run layouts; the converter itself only depends on the types.


## Native documents

<!-- elkDocumentConverter derived from src/formats/elk/index.ts and src/formats/document/index.ts -->

`elkDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Primitive edges retain their original representation. Labels, node/port geometry and the imported first routing section can be edited while retaining additional labels/sections/options. Hyperedge sources are retained with a null Graph projection. Structural edits and unsupported Graph data/style fields reject.

Bare exports interpret recognized import carriers by default. Use
`{ nativeCarrier: false }` when Graph data is user-authored and could match the
private carrier schema. Document projection pins importer state to its external
source before unwrapping it, preserving foreign lookalikes.
