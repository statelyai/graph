# JGF

Converter for [JSON Graph Format](https://jsongraphformat.info/) — a standardized JSON schema for graph data.

## Preservation

<!-- preservation contract for jgf derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

The default preserves the existing hybrid dialect: array nodes and `graph.id` (including the empty string). Request `{ version: 1 }` for standards-valid v1 array output or `{ version: 2 }` for v2 node dictionaries. Imports accept both standards and the existing hybrid. Live native metadata, directedness and relation edits are retained. Versioned metadata preserves Graph-only fields; native snapshots retain extensions. Default output normalizes source schemas to the hybrid shape, rather than reproducing the source document.


<!-- native metadata policy derived from src/formats/preservation.ts -->

Native snapshots use a private JSON convention on Graph data. Import options
`{ metadata: 'native' }` disable adapter marker interpretation. A foreign value
that deliberately matches the marker schema remains ambiguous in automatic mode.
Comments, lexical formatting and source locations are not preserved.

## Resources

- [JSON Graph Format specification](https://jsongraphformat.info/)
- [JGF GitHub](https://github.com/jsongraph/json-graph-specification)

## API

<!-- exported symbols from src/formats/jgf/index.ts -->

```ts
import { toJGF, fromJGF, jgfConverter } from '@statelyai/graph/jgf';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'recipe',
  nodes: [
    { id: 'chop', label: 'Chop Vegetables' },
    { id: 'boil', label: 'Boil Water' },
    { id: 'cook', label: 'Cook Pasta' },
    { id: 'mix', label: 'Mix Together' },
    { id: 'serve', label: 'Serve' },
  ],
  edges: [
    { id: 'e0', sourceId: 'boil', targetId: 'cook' },
    { id: 'e1', sourceId: 'cook', targetId: 'mix' },
    { id: 'e2', sourceId: 'chop', targetId: 'mix' },
    { id: 'e3', sourceId: 'mix', targetId: 'serve' },
  ],
});

const jgf = toJGF(graph);
// {
//   graph: {
//     id: 'recipe',
//     directed: true,
//     nodes: [{ id: 'chop', label: 'Chop Vegetables' }, ...],
//     edges: [{ source: 'boil', target: 'cook' }, ...]
//   }
// }

// Import
const imported = fromJGF({
  graph: {
    id: 'auth',
    directed: true,
    nodes: [
      { id: 'login', label: 'Login Page' },
      { id: 'mfa', label: 'MFA Challenge' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'denied', label: 'Access Denied' },
    ],
    edges: [
      { source: 'login', target: 'mfa', label: 'credentials ok' },
      { source: 'login', target: 'denied', label: 'invalid' },
      { source: 'mfa', target: 'dashboard', label: 'verified' },
      { source: 'mfa', target: 'denied', label: 'failed' },
    ],
  },
});
// a graph containing:
// nodes: - login - mfa - dashboard - denied
// edges: - (login -> mfa) - (login -> denied) - (mfa -> dashboard) - (mfa -> denied)
```

### `toJGF(graph): JGFGraph`

<!-- JGF fidelity notes derived from src/formats/jgf/index.ts -->

Graph-only properties and field presence are stored in versioned `metadata.__statelyai` snapshots. Object user data is also exposed in native metadata; current native edits take precedence.

### `toJGF(graph, { version: 1 | 2 })`

Version 1 emits array nodes and stores Graph identity in metadata. Version 2 emits ID-keyed node dictionaries and resolves nullable or omitted direction defaults to booleans, normalizing v1 nullable metadata into v2 objects. The default remains the legacy hybrid shown above.

### `fromJGF(jgf, options?): Graph`

Imports v1 arrays, v2 dictionaries and the legacy hybrid. Native metadata and relation are retained as Graph data; recognized versioned markers restore Graph-only properties.

### `jgfConverter`

Pre-built `GraphFormatConverter<JGFGraph>`:

```ts
const jgf = jgfConverter.to(graph);
const graph = jgfConverter.from(jgf);
```

### Types

| Type | Description |
|------|-------------|
| `JGFGraph` | `{ graph: { id, directed?, metadata?, nodes, edges } }` |
| `JGFGraphV1` | Standards-valid v1 output without hybrid graph ID |
| `JGFGraphV2` | Standards-valid v2 output with ID-keyed nodes |
| `JGFInput` | v1, v2 and sparse native document input |
| `JGFExportOptions` | Explicit `version: 1` or `version: 2` |
| `JGFImportOptions` | Reserved metadata interpretation override |
| `JGFNode` | `{ id, label?, metadata? }` |
| `JGFEdge` | `{ id?, source, target, label?, metadata? }` |


## Native documents

<!-- jgfDocumentConverter derived from src/formats/jgf/index.ts and src/formats/document/index.ts -->

`jgfDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Original v1, v2 and hybrid schemas stay intact. Labels, native metadata, directedness and relations can be edited. Graph-only fields and ambiguous reserved metadata edits reject. Native hyperedges are retained with a null Graph projection; bare `fromJGF` rejects them rather than dropping their semantics.

Bare exports interpret recognized import carriers by default. Use
`{ nativeCarrier: false }` when Graph data is user-authored and could match the
private carrier schema. Document projection pins importer state to its external
source before unwrapping it, preserving foreign lookalikes.
