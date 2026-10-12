# CSV / TSV graph tables

Separate node and edge tables preserve isolated nodes. This is an explicit Graph
schema, rather than a portable graph CSV standard. Conversion has no runtime dependencies.

<!-- exported API and default schema from src/formats/csv/index.ts -->

```ts
import { toCSV, fromCSV, toTSV, fromTSV, csvDocumentConverter } from '@statelyai/graph/csv';
const source = toCSV(graph); // { nodes, edges, schema, graph }
const restored = fromCSV(source);
const tabSource = toTSV(graph);
const tabGraph = fromTSV(tabSource);
const document = csvDocumentConverter.from(source);
```

`csvConverter` and `tsvConverter` provide `.to(graph)` / `.from(source)`.
`csvDocumentConverter` and `tsvDocumentConverter` retain native table documents.
The serializable source has `nodes` and `edges` strings, optional `schema`, optional
Graph root properties in `graph`, and opaque source-only `metadata`. Metadata does
not become `Graph.data` implicitly.

Each table requires a header. Default ID/endpoint columns contain plain strings;
optional columns use JSON cells, including visible labels. An empty JSON cell
means absent, `null` means null, and `""` means an empty string. CSV quoting applies
after JSON encoding: label `Hello` is a JSON string cell, displayed in CSV as
`"""Hello"""`. Arbitrary data supports JSON objects, arrays, scalars and null.
The default `__extra` JSON column carries otherwise unmapped Graph fields; `graph`
carries root fields. Undefined optional Graph fields are absent in the JSON view.

<!-- schema configuration and validation from src/formats/csv/index.ts -->

For externally authored plain-text labels, declare a string column:

```ts
const source: import('@statelyai/graph/csv').CSVGraphSource = {
  nodes: 'id,title\r\na,Hello\r\nb,World\r\n',
  edges: 'id,from,to\r\ne,a,b\r\n',
  schema: {
    nodes: [
      { name: 'id', field: 'id', type: 'string', required: true },
      { name: 'title', field: 'label', type: 'string' },
    ],
    edges: [
      { name: 'id', field: 'id', type: 'string', required: true },
      { name: 'from', field: 'sourceId', type: 'string', required: true },
      { name: 'to', field: 'targetId', type: 'string', required: true },
    ],
  },
};
```

Column types are `string`, `number`, `boolean`, `json` and `mode`; schema delimiter
is comma or tab. IDs/endpoints must have mapped columns. Names and mapped fields
must be unique. Resulting Graph fields are validated independently of cell types:
labels must be strings/null, visual numbers and weights finite, styles valid,
modes recognized, references present and port names unique. Duplicate IDs,
dangling endpoints, malformed quotes, duplicate headers and invalid typed cells
throw. Prototype-sensitive names remain own properties.

Custom schemas encode their stated fields only. Plain string cells cannot retain
missing/null distinctions; use JSON cells for those distinctions. `{ nativeCarrier:
false }` omits root properties and `$extra` fields, including any unmapped Graph
information and inherited root direction. `{ metadata: 'native' }` disables import
of `$extra`; declared data cells retain their explicit types. These options are
partial profiles with explicit losses.

<!-- document preservation and native proof from src/formats/csv/index.ts, tests/formats/csv.test.ts and tests/native/csv.test.ts -->

Documents reproduce original tables, metadata, unknown columns, BOM, quoting and
line endings exactly on no-op, including JSON persistence. Supported edits replace
existing mapped cells or Graph root properties; untouched bytes remain intact.
Identity, endpoints, hierarchy and port structure edits reject. Missing mapped
cells and ambiguous/unrepresentable changes reject with diagnostics rather than
replaying stale tables. Independent source edits survive unless they conflict with
requested Graph edits. All patches must reparse to the requested Graph projection.

Bare imports ignore unknown columns; retain the document envelope when those
columns matter. The parser supports doubled quotes, delimiters and embedded
CRLF/newlines within quoted cells. Default output uses CRLF; `lineEnding` can select
LF. [csv-parse](https://csv.js.org/parse/) 7.0.3 independently checks emitted cell
contents; it validates CSV syntax, while this adapter validates the graph schema.
Semantic and bare round-trip coverage remains partial.
