# GML

Converter for [GML](https://en.wikipedia.org/wiki/Graph_Modelling_Language) (Graph Modelling Language) — a hierarchical text format widely supported by graph tools.

## Preservation

<!-- preservation contract for gml derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Bare Graph APIs preserve no source document. `gmlDocumentConverter` retains
exact native source, including comments and unknown syntax, after JSON persistence.
Its Graph projection and supported edits remain partial; selected-field tests do
not prove unrestricted semantic losslessness.

Preserves selected Graph fields, empty labels, null-label presence and node order through versioned extensions. Unknown repeated attributes, graphics and imported missing-label presence use discriminated `_gml` metadata. Strings use entity escapes. Legacy export keeps quoted IDs; opt-in standard mode writes integer references and flat native nodes. Comments and complete source spelling/order are not preserved.

## Resources

- [GML specification (Graphlet)](https://web.archive.org/web/20190309090728/http://www.fim.uni-passau.de/index.php?id=17297&L=1)
- [GML on Wikipedia](https://en.wikipedia.org/wiki/Graph_Modelling_Language)

## API

<!-- exported symbols from src/formats/gml/index.ts -->

```ts
import { toGML, fromGML, gmlConverter, gmlDocumentConverter } from '@statelyai/graph/gml';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'filesystem',
  nodes: [
    { id: 'root', label: 'root' },
    { id: 'src', label: 'src', parentId: 'root' },
    { id: 'index', label: 'index.ts', parentId: 'src' },
    { id: 'lib', label: 'lib', parentId: 'root' },
    { id: 'utils', label: 'utils.ts', parentId: 'lib' },
  ],
  edges: [
    { id: 'e0', sourceId: 'index', targetId: 'utils', label: 'imports' },
  ],
});

const gml = toGML(graph);

// Import
const imported = fromGML(`graph [
  directed 1
  node [
    id "web"
    label "Web App"
  ]
  node [
    id "api"
    label "REST API"
  ]
  node [
    id "db"
    label "PostgreSQL"
  ]
  edge [
    source "web"
    target "api"
    label "HTTP"
  ]
  edge [
    source "api"
    target "db"
    label "SQL"
  ]
]`);
// a graph containing:
// nodes: - web - api - db
// edges: - (web -> api) - (api -> db)
```

### `toGML(graph, options?: GMLExportOptions): string`

<!-- GML fidelity notes derived from src/formats/gml/index.ts -->

Maps selected graph `mode`, `initialNodeId`, `data`, `direction`, `style`, plus node and edge `label`, `data`, `ports`, `sourcePort`, `targetPort`, `weight`, `shape`, `color`, `style`, and visual properties in `graphics [x, y, w, h]` blocks. Legacy compound output uses nested node blocks. `toGML(graph, { standard: true })` writes integer IDs/endpoints and flat native nodes, retaining original Graph IDs/hierarchy in a versioned `stately` extension. `GMLExportOptions` and `GMLImportOptions` are exported types. Reserved discriminated metadata is not an unrestricted foreign-data container.

### `fromGML(gml, options?: GMLImportOptions): Graph`

Uses an iterative block parser, rejects unclosed strings/blocks and decodes numeric and Latin-1 named entities. Default import accepts legacy backslash escapes; `{ standard: true }` treats native backslashes literally. Handles:
- Nested node blocks for hierarchy
- `graphics` blocks for positions/dimensions
- JSON-encoded graph/node/edge metadata fields
- Multiple same-key entries and unknown ordered nested attributes, including unmapped graphics
- Native explicit labels, including empty strings, take precedence over private null markers

### `gmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const gml = gmlConverter.to(graph);
const graph = gmlConverter.from(gml);
```

### `gmlDocumentConverter`

<!-- native document API and bounded edit contract derived from converter index and document hook -->

```ts
const document = gmlDocumentConverter.from(gml);
const persisted = JSON.parse(JSON.stringify(document));
const unchanged = gmlDocumentConverter.to(persisted); // exact original text
if (document.graph) {
  document.graph.nodes[0].label = 'Updated';
  const edited = gmlDocumentConverter.to(document);
}
```

`from` retains source when projection is unavailable (`graph: null`) and reports
its diagnostics; `{ strict: true }` rejects unavailable projections. `to` patches
verified literal node/edge labels and proves the resulting Graph projection by
reparsing. Independent source edits survive; conflicting native and Graph field
edits throw an ordinary error carrying diagnostics. Unedited bytes stay intact.

Label patches require one quoted label and a unique explicit native ID or versioned `originalId`. Missing labels can be inserted locally. Numeric IDs and nested nodes are supported; synthesized edge IDs reject safe patching. The document codec uses legacy import escaping, matching `gmlConverter`. Multiple graphs retain source with an unavailable projection.

Nullable labels, structure, data, geometry and style edits currently require explicit
regeneration: `gmlDocumentConverter.getUpdate(document, { mode: 'regenerate' })` returns a
result with loss diagnostics. Strict `to` never silently regenerates or replays
stale source after unsupported Graph edits. Native explicit labels, including empty strings,
are authoritative over private null metadata; null exports omit native labels.
The document projection uses `null` for native missing labels, distinguishing them
from explicit empty strings. Bare import retains its historical empty-string view
with private missing-label provenance for faithful regeneration.

<!-- GML native interoperability profile derived from standard export and independent NetworkX reader proof -->

Standard output adds `multigraph 1` when parallel endpoint pairs exist, supporting
readers that require that hint. A conflicting preserved native hint rejects rather
than overwriting it. Integer-ID profile and legacy quoted-ID support remain unchanged;
fresh empty node/edge labels now emit explicit `label ""` in both profiles.
Quoted output and document label patches encode control whitespace as numeric
entities, preserving CR/LF/TAB through native line readers. Standard export rejects
lone surrogates in native strings and Graph identity fields; JSON-escaped user data
can retain them. Strict document label edits also require Unicode scalar values.
Portable native-validation CI uses pinned NetworkX 3.7 `parse_gml(..., label=None)`
for numeric identity, Unicode/entity labels, missing/empty label presence, isolated
nodes, numeric weights, parallel edges and malformed blocks. This validates the
tested NetworkX profile, without claiming complete GML semantics.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

Strict label patches require a unique native `id` or independently recognized
versioned `originalId` in both baseline and current projected scopes. A new explicit
`id "e0"` cannot validate a historical generated edge identity. Repeated private
identity values do not authorize a patch. Stable IDs permit independent native
attribute edits; source-only updates retain exact text. Ambiguous identity reports
`ambiguous-native-identity` with the requested field path.
