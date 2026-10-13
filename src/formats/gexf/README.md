# GEXF

Converter for [GEXF](https://gexf.net/) (Graph Exchange XML Format) — the XML format used by [Gephi](https://gephi.org/).

**Requires peer dependency:** `fast-xml-parser`

```bash
npm install fast-xml-parser
```

## Preservation

<!-- preservation contract for gexf derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Bare Graph APIs preserve no source document. `gexfDocumentConverter` retains
exact native source, including comments and unknown syntax, after JSON persistence.
Its Graph projection and supported edits remain partial; selected-field tests do
not prove unrestricted semantic losslessness.

Reads native weights, mutual edges and the undirected default. Attribute IDs are scoped by node/edge class; custom declarations/defaults, creator metadata and selected temporal/visual state use versioned `_gexf` metadata. Temporal state is preserved opaquely rather than executed. Custom graph attributes remain a backward-compatible dialect and are not claimed XSD-valid; source comments and complete source syntax are not retained.

## Resources

- [GEXF specification](https://gexf.net/schema.html)
- [Gephi](https://gephi.org/)

## API

<!-- exported symbols from src/formats/gexf/index.ts -->

```ts
import { toGEXF, fromGEXF, gexfConverter, gexfDocumentConverter } from '@statelyai/graph/gexf';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'citations',
  nodes: [
    { id: 'paper1', label: 'Graph Theory Fundamentals', color: '#e91e63' },
    { id: 'paper2', label: 'Network Analysis' },
    { id: 'paper3', label: 'Community Detection' },
  ],
  edges: [
    { id: 'e0', sourceId: 'paper2', targetId: 'paper1', label: 'cites' },
    { id: 'e1', sourceId: 'paper3', targetId: 'paper1', label: 'cites' },
    { id: 'e2', sourceId: 'paper3', targetId: 'paper2', label: 'cites' },
  ],
});

const xml = toGEXF(graph);

// Import
const imported = fromGEXF(`<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3" version="1.3">
  <graph defaultedgetype="directed">
    <nodes>
      <node id="api" label="API Gateway" />
      <node id="users" label="User Service" />
      <node id="orders" label="Order Service" />
    </nodes>
    <edges>
      <edge id="e0" source="api" target="users" />
      <edge id="e1" source="api" target="orders" />
      <edge id="e2" source="orders" target="users" />
    </edges>
  </graph>
</gexf>`);
// a graph containing:
// nodes: - api - users - orders
// edges: - e0 (api -> users) - e1 (api -> orders) - e2 (orders -> users)
```

### `toGEXF(graph, options?: GEXFExportOptions): string`

<!-- GEXF fidelity notes derived from src/formats/gexf/index.ts -->

Produces GEXF 1.3 XML with:
- Node/edge attributes via `<attvalues>`
- Hierarchy via `pid` attribute
- Graph directedness via `defaultedgetype`; `initialNodeId`, `direction`, and `data` via custom `<graph>` attributes
- Graph `style` stored as a custom `<graph>` attribute
- Visual properties via `viz:color`, `viz:position`, `viz:size`
- Custom node attributes for `width`, `height`, `style`, and `ports`
- Native edge `weight`, `type="mutual"` and graph `defaultedgetype="mutual"`; custom geometry/style/port attributes
- Private null-label/geometry presence and original color strings preserve selected Graph distinctions without overriding changed native labels/colors
- JSON-serialized graph/node/edge style and data fields where needed

### `fromGEXF(xml, options?: GEXFImportOptions): Graph`

Parses:
- Well-formed XML in 1.3 and published 1.2draft namespaces, including prefix aliases
- Class-scoped `<attributes>` declarations/defaults and `<attvalues>` on nodes/edges
- Native edge weights, mutual directedness and the standard undirected graph default
- `@pid` and nested `<nodes>` for hierarchy
- Custom graph attributes for `initialNodeId`, `direction`, `data`, and `style`
- RGB/hex `viz:color`, `viz:position`, `viz:size`, and native shape; alpha, z, selected dynamics and unknown custom values are retained as metadata
- JSON-encoded `data`, `style`, and `ports` fields

### `gexfConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const xml = gexfConverter.to(graph);
const graph = gexfConverter.from(xml);
```

### `gexfDocumentConverter`

<!-- native document API and bounded edit contract derived from converter index and document hook -->

```ts
const document = gexfDocumentConverter.from(xml);
const persisted = JSON.parse(JSON.stringify(document));
const unchanged = gexfDocumentConverter.to(persisted); // exact original text
if (document.graph) {
  document.graph.nodes[0].label = 'Updated';
  const edited = gexfDocumentConverter.to(document);
}
```

`from` retains source when projection is unavailable (`graph: null`) and reports
its diagnostics; `{ strict: true }` rejects unavailable projections. `to` patches
verified literal node/edge labels and proves the resulting Graph projection by
reparsing. Independent source edits survive; conflicting native and Graph field
edits throw an ordinary error carrying diagnostics. Unedited bytes stay intact.

Label patches target native `label` attributes on unique explicit IDs, including nested nodes. Missing attributes are inserted locally; XML characters and escaping are checked. Published 1.2draft and 1.3 namespaces are recognized. Multiple graphs retain the source with an unavailable single-graph projection.

Nullable labels, structure, data, geometry and style edits currently require explicit
regeneration: `gexfDocumentConverter.getUpdate(document, { mode: 'regenerate' })` returns a
result with loss diagnostics. Strict `to` never silently regenerates or replays
stale source after unsupported Graph edits. Native explicit labels, including empty strings,
are authoritative over private null metadata; null exports omit native labels.

### Standards export profile

<!-- GEXF standard carrier and namespace policy derived from GEXFExportOptions/GEXFImportOptions and native XSD tests -->

```ts
const standard = toGEXF(graph, { standard: true });
const restored = fromGEXF(standard, { standard: true });
```

The opt-in 1.3 profile moves Graph-only root ID, initial state, data, direction and
style into a JSON `<meta><description>` carrier identified by
`format: "@statelyai/graph/gexf-root", version: 1`. Original descriptions remain
separate description elements. Reserved-carrier collisions and multiple carriers
reject; malformed marker-shaped user descriptions remain native text. Carrier
interpretation requires the explicit import option. Explicit native root fields
and directedness remain authoritative; the carrier contains no node/edge snapshots.
`GEXFExportOptions` and `GEXFImportOptions` are exported.

Visual elements use the core namespace required by the published 1.3 XSD. The
[public visualization example](https://gexf.net/viz.html) uses a `/viz` namespace
that this XSD rejects; default export retains that existing dialect. Import accepts
both forms. Standard export preserves attribute whitespace with numeric references
and rejects invalid XML characters/nonfinite native numbers. The native suite pins
and validates official 1.2draft and 1.3 schemas through libxml2. This is a tested
export profile, not runtime XSD validation of arbitrary foreign extensions or full
execution of dynamic graph semantics.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

Strict label patches require a unique explicit native entity `id` in both the
baseline and current projected graph scopes. A newly inserted `id="e0"` cannot
validate a historical generated `e0` edge. Foreign namespaces/unselected graphs
cannot supply the baseline identity. Stable native IDs still permit independent
source edits; source-only updates remain authoritative. Ambiguity reports the
field path with `ambiguous-native-identity` instead of patching another edge.
