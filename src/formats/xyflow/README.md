# xyflow

Converter for [xyflow](https://xyflow.com/) (React Flow / Svelte Flow) node and edge objects. Works with `VisualGraph` since xyflow expects `position` and size.

## Preservation

<!-- preservation contract for xyflow derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Versioned metadata preserves Graph field presence, null labels, ports and authored order. Live native labels and user data edits take precedence. Native snapshots retain viewport and UI fields. Parent ordering uses a linear queue and preserves sibling order. Reserved payloads can be imported as ordinary native data with `{ metadata: 'native' }`.


<!-- native metadata policy derived from src/formats/preservation.ts -->

Native snapshots use a private JSON convention on Graph data. Import options
`{ metadata: 'native' }` disable adapter marker interpretation. A foreign value
that deliberately matches the marker schema remains ambiguous in automatic mode.
Comments, lexical formatting and source locations are not preserved.

## Resources

- [React Flow documentation](https://reactflow.dev/)
- [Svelte Flow documentation](https://svelteflow.dev/)

## API

<!-- exported symbols from src/formats/xyflow/index.ts -->

```ts
import { toXYFlow, fromXYFlow, xyflowConverter } from '@statelyai/graph/xyflow';
import { createVisualGraph } from '@statelyai/graph';

const graph = createVisualGraph({
  nodes: [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 200, y: 100, width: 100, height: 50 },
  ],
  edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
});

const flow = toXYFlow(graph);
// { nodes: [{ id: 'a', position: {x:0,y:0}, ... }], edges: [{ id: 'e0', source: 'a', target: 'b' }] }

const roundTripped = fromXYFlow(flow);
```

### Field mapping

| Graph | xyflow |
| --- | --- |
| `node.x`, `node.y` | `node.position` |
| `node.width`, `node.height` | `node.width`, `node.height` (reads `measured` / `initialWidth` on import) |
| `node.shape` | `node.type` |
| `node.parentId` | `node.parentId` |
| `edge.sourceId` / `edge.targetId` | `edge.source` / `edge.target` |
| `edge.sourcePort` / `edge.targetPort` | `edge.sourceHandle` / `edge.targetHandle` |
| `edge.label` | Top-level `edge.label`, with the original value also stored in adapter metadata |

### `xyflowConverter`

Pre-built `VisualGraphFormatConverter<XYFlow>`:

```ts
const flow = xyflowConverter.to(graph);
const roundTripped = xyflowConverter.from(flow);
```

### Types

| Type | Description |
| --- | --- |
| `XYFlow` | `{ nodes: XYFlowNode[], edges: XYFlowEdge[] }` |
| `XYFlowNode` | Re-exported `NodeBase` from `@xyflow/system` |
| `XYFlowEdge` | `EdgeBase` from `@xyflow/system` plus a string `label` field |

> **Note:** `fromXYFlow` restores `mode` and `direction` from graph metadata when present; otherwise it defaults to a `directed` graph with `direction: 'down'`.


## Native documents

<!-- xyflowDocumentConverter derived from src/formats/xyflow/index.ts and src/formats/document/index.ts -->

`xyflowDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Labels, positions, measured dimensions and user data patch native fields while retaining viewport and UI properties. Renderer labels are distinguished during projection. Edits to user labels colliding with the renderer mapping reject explicitly. Structural edits reject.

Bare exports interpret recognized import carriers by default. Use
`{ nativeCarrier: false }` when Graph data is user-authored and could match the
private carrier schema. Document projection pins importer state to its external
source before unwrapping it, preserving foreign lookalikes.
