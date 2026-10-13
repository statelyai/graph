# GraphML

Converter for [GraphML](http://graphml.graphdrawing.org/) — the XML-based graph exchange format.

**Requires peer dependency:** `fast-xml-parser`

```bash
npm install fast-xml-parser
```

## Preservation

<!-- preservation contract for graphml derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Bare Graph APIs preserve no source document. `graphMLDocumentConverter` retains
exact native source, including comments and unknown syntax, after JSON persistence.
Its Graph projection and supported edits remain partial; selected-field tests do
not prove unrestricted semantic losslessness.

Resolves scoped key names/defaults, nested directedness, namespace aliases and native ports. Unknown data/declarations use versioned `_graphml` metadata, wrapping primitive user data when needed. Imports the first top-level graph only; hyperedges throw. Comments, complete document structure and vendor semantics remain outside this Graph converter.

## Resources

- [GraphML specification](http://graphml.graphdrawing.org/specification.html)
- [GraphML primer](http://graphml.graphdrawing.org/primer/graphml-primer.html)

## API

<!-- exported symbols from src/formats/graphml/index.ts -->

```ts
import { toGraphML, fromGraphML, graphmlConverter, graphMLDocumentConverter } from '@statelyai/graph/graphml';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'network',
  nodes: [
    { id: 'router', label: 'Router', shape: 'diamond' },
    { id: 'server', label: 'Server', shape: 'rectangle' },
    { id: 'client1', label: 'Client 1' },
    { id: 'client2', label: 'Client 2' },
  ],
  edges: [
    { id: 'e0', sourceId: 'router', targetId: 'server' },
    { id: 'e1', sourceId: 'router', targetId: 'client1' },
    { id: 'e2', sourceId: 'router', targetId: 'client2' },
  ],
});

const xml = toGraphML(graph);

// Import
const imported = fromGraphML(`<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <graph id="pipeline" edgedefault="directed">
    <node id="fetch"><data key="d0">Fetch Data</data></node>
    <node id="parse"><data key="d0">Parse JSON</data></node>
    <node id="validate"><data key="d0">Validate</data></node>
    <node id="store"><data key="d0">Store Results</data></node>
    <edge source="fetch" target="parse"/>
    <edge source="parse" target="validate"/>
    <edge source="validate" target="store"/>
  </graph>
</graphml>`);
// a graph containing:
// nodes: - fetch - parse - validate - store
// edges: - (fetch -> parse) - (parse -> validate) - (validate -> store)
```

### `toGraphML(graph, options?: GraphMLExportOptions): string`

<!-- GraphML fidelity notes derived from src/formats/graphml/index.ts -->

Produces GraphML XML with:
- `<key>` declarations for label, parentId, initialNodeId, data, style, x, y, width, height, shape, color, weight, ports, sourcePort, and targetPort
- `<data>` elements on nodes, edges, and the graph
- JSON-serialized `data`, `style`, and portable `ports` fields; native `<port>` elements and endpoint port attributes
- Versioned private presence/mode data preserves Graph null labels and bidirectional edges; changed native labels/direction take precedence
- Unknown data subtrees retain local namespace declarations; output is compact XML to avoid injected whitespace

### `fromGraphML(xml): Graph`

Checks XML well-formedness, resolves key IDs through scoped declarations, applies defaults and recognizes `directed="0"`/`"1"`. Nested graphs supply their own edge defaults. JSON-encoded fields remain backward-readable. Native port descriptions, data and nesting are retained; new exporter metadata permits live native port edits to supersede its portable extension. Legacy portable-only payloads keep their existing precedence. This convenience importer does not validate GraphML against its XSD or interpret arbitrary vendor XML.

### `graphmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const xml = graphmlConverter.to(graph);
const graph = graphmlConverter.from(xml);
```

### `graphMLDocumentConverter`

<!-- native document API and bounded edit contract derived from converter index and document hook -->

```ts
const document = graphMLDocumentConverter.from(xml);
const persisted = JSON.parse(JSON.stringify(document));
const unchanged = graphMLDocumentConverter.to(persisted); // exact original text
if (document.graph) {
  document.graph.nodes[0].label = 'Updated';
  const edited = graphMLDocumentConverter.to(document);
}
```

`from` retains source when projection is unavailable (`graph: null`) and reports
its diagnostics; `{ strict: true }` rejects unavailable projections. `to` patches
verified literal node/edge labels and proves the resulting Graph projection by
reparsing. Independent source edits survive; conflicting native and Graph field
edits throw an ordinary error carrying diagnostics. Unedited bytes stay intact.

Label patches resolve namespaces and scoped key IDs through `attr.name="label"`. They require unique explicit entity IDs, a string label key and plain-text data. A missing label can be inserted through one existing compatible key; CDATA/mixed content, duplicate labels and synthesized edge IDs reject. The first top-level graph is projected with an explicit multiple-graph diagnostic; projected hyperedges retain the source with an unavailable binary projection.

Nullable labels, structure, data, geometry and style edits currently require explicit
regeneration: `graphMLDocumentConverter.getUpdate(document, { mode: 'regenerate' })` returns a
result with loss diagnostics. Strict `to` never silently regenerates or replays
stale source after unsupported Graph edits. Native explicit labels, including empty strings,
are authoritative over private null metadata; null exports omit native labels.

### Standards export profile

<!-- GraphML standard export domain derived from GraphMLExportOptions and native XSD tests -->

`toGraphML(graph, { standard: true })` omits the optional empty graph ID and
rejects identifiers/port names outside the tested XSD NMTOKEN domain, duplicate
entity IDs, unresolved endpoints, invalid XML characters and nonfinite native
numbers. It preserves carriage returns through numeric references; Unicode
labels and JSON data remain supported. BMP Unicode identifiers are supported;
supplementary-plane identifiers reject because the pinned libxml2 validator
rejects them. IDs are never silently renamed. `GraphMLExportOptions` is exported.

The native suite validates this profile against the official GraphML 1.0 XSD,
including its redefine and XLink dependencies. Arbitrary vendor extensions need
their own schema; this option is not a runtime XSD validator. A nested keyref
fixture exposes ambiguity in the published descendant identity constraints under
libxml2. Source documents retain the original nested structure; the bare exporter
uses flat nodes plus parent metadata, matching its existing wire behavior.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

Strict label patches require a unique explicit native entity `id` in both the
baseline and current projected graph scopes. A newly inserted explicit ID cannot
validate an older generated edge ID, even if its text matches that fallback.
Other graphs and foreign namespaces cannot supply this identity. Stable IDs permit
independent native data edits; source-only changes retain exact source text.
Ambiguous identity rejects with path-bearing `ambiguous-native-identity` diagnostics.
