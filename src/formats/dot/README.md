# DOT

Converter for the [DOT language](https://graphviz.org/doc/info/lang.html) used by Graphviz.

**Requires peer dependency:** `dotparser`

```bash
npm install dotparser
```

## Preservation

<!-- preservation contract for dot derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Bare Graph APIs preserve no source document. `dotDocumentConverter` retains
exact native source, including comments and unknown syntax, after JSON persistence.
Its Graph projection and supported edits remain partial; selected-field tests do
not prove unrestricted semantic losslessness.

Merges repeated declarations and strict edges, keeps rank-subgraph contents and emits native clusters. Resolved defaults, independent fill/border/style, HTML labels, record/HTML ports and compass-only endpoints are preserved. A lexical adapter handles comma node lists for the older parser. Comments, complete grammar coverage and exact declaration order remain outside this Graph converter.

## Resources

- [DOT language specification](https://graphviz.org/doc/info/lang.html)
- [Graphviz](https://graphviz.org/)
- [dotparser (npm)](https://www.npmjs.com/package/dotparser)

## API

<!-- exported symbols from src/formats/dot/index.ts -->

```ts
import { toDOT, fromDOT, dotConverter, dotDocumentConverter } from '@statelyai/graph/dot';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'etl',
  direction: 'right',
  nodes: [
    { id: 'extract', label: 'Extract', shape: 'rectangle', color: '#2196f3' },
    { id: 'transform', label: 'Transform', shape: 'diamond' },
    { id: 'load', label: 'Load', shape: 'rectangle', color: '#4caf50' },
  ],
  edges: [
    { id: 'e0', sourceId: 'extract', targetId: 'transform', label: 'raw data' },
    { id: 'e1', sourceId: 'transform', targetId: 'load', label: 'cleaned' },
  ],
});

const dot = toDOT(graph);
// digraph etl {
//   rankdir=LR;
//   extract [label="Extract", shape=box, fillcolor="#2196f3", style=filled];
//   transform [label="Transform", shape=diamond];
//   load [label="Load", shape=box, fillcolor="#4caf50", style=filled];
//   extract -> transform [label="raw data"];
//   transform -> load [label="cleaned"];
// }

// Import
const imported = fromDOT(`digraph deploy {
  rankdir=LR;
  build [label="Build" shape=box];
  test [label="Test" shape=box];
  staging [label="Staging" shape=ellipse];
  prod [label="Production" shape=box fillcolor="#4caf50" style=filled];
  build -> test;
  test -> staging [label="passed"];
  staging -> prod [label="approved"];
}`);
// a graph containing:
// nodes: - build - test - staging - prod
// edges: - (build -> test) - (test -> staging) - (staging -> prod)
```

### `toDOT(graph): string`

Uses `digraph`/`->` for directed graphs, `graph`/`--` for undirected. Preserves: `label`, `shape` (mapped to DOT names), `color` (as `fillcolor`), `direction` (as `rankdir`), edge `color`, and edge `sourcePort` / `targetPort` as `node:port` endpoints.

### `fromDOT(dot): Graph`

Parses:
- `digraph`/`graph` → directed/undirected
- Node attributes: `label`, `shape` (mapped back), `fillcolor`/`color`
- Edge attributes: `label`, `color`
- Edge port ids from `node:port` endpoints
- Edge chains (`a -> b -> c` → 2 edges)
- `subgraph` → compound node with `parentId`
- `rankdir` → `direction`
- `node [...]` / `edge [...]` default attributes
- Auto-creates nodes referenced in edges

### Round-trip preservation

<!-- DOT preservation metadata and limitations derived from src/formats/dot/index.ts -->

Native attributes and rank/subgraph membership are retained in legacy `data.dot` bags. When user data also needs preserving, a discriminated `_dot` carrier keeps that data, including primitives and foreign `dot` payloads. DOT `_stately` attributes carry Graph-only fields such as original edge IDs, initial states, geometry, ports, arbitrary data and nullable-label presence. Native label presence, including explicit empty labels, remains authoritative.

- Graph metadata retains strictness, graph/default attributes, rank groups and additional subgraph membership.
- Node metadata retains HTML label markers, resolved inherited attributes, border color and style independently of fill.
- Record and HTML port declarations become advisory Graph ports. A bare compass token is a compass when no matching port is declared; full `node:port:compass` syntax retains both.
- Strict redeclarations update explicit ports/compass and attributes while retaining untouched endpoints/attributes.

**Remaining limits:** comments, statement spelling/order, complete Graphviz attribute semantics and arbitrary unsupported grammar are not preserved by this Graph API. Reserved metadata names have adapter meaning; source-document guarantees require a separate document layer. The installed parser still supplies the underlying grammar beyond the tested comma-list normalization.

### `dotConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const dot = dotConverter.to(graph);
const graph = dotConverter.from(dot);
```

### `dotDocumentConverter`

<!-- native document API and bounded edit contract derived from converter index and document hook -->

```ts
const document = dotDocumentConverter.from(dot);
const persisted = JSON.parse(JSON.stringify(document));
const unchanged = dotDocumentConverter.to(persisted); // exact original text
if (document.graph) {
  document.graph.nodes[0].label = 'Updated';
  const edited = dotDocumentConverter.to(document);
}
```

`from` retains source when projection is unavailable (`graph: null`) and reports
its diagnostics; `{ strict: true }` rejects unavailable projections. `to` patches
verified literal node/edge labels and proves the resulting Graph projection by
reparsing. Independent source edits survive; conflicting native and Graph field
edits throw an ordinary error carrying diagnostics. Unedited bytes stay intact.

Label patches target the last explicit quoted node label, or add a local override to an explicit node statement with a resolved plain label default. Edge patches require one simple statement per projected edge. Missing native default-ID labels, HTML/bare/concatenated labels, implicit nodes, cluster labels, strict merged edges and chains reject safe patching. Grammar unsupported by the legacy parser retains source with an unavailable projection. Graph streams project the first graph with an explicit diagnostic.

Nullable labels, structure, data, geometry and style edits currently require explicit
regeneration: `dotDocumentConverter.getUpdate(document, { mode: 'regenerate' })` returns a
result with loss diagnostics. Strict `to` never silently regenerates or replays
stale source after unsupported Graph edits. Native explicit labels, including empty strings,
are authoritative over private null metadata; null exports omit native labels.

<!-- DOT native label presence and independent reader proof derived from native Graphviz tests -->

Explicit Graph empty labels emit `label=""`; null labels omit the native label.
A missing native node label uses Graphviz's default `\N`, which displays its ID.
The importer retains this distinction in versioned `implicitLabel` provenance;
bare import keeps its historical empty-string Graph view, while document import
uses `null` for this absent native label. Edit native source to choose an explicit
literal in that case. The native suite uses Graphviz 15.0.0 to check topology,
parallel edges, ranks/clusters, strict merges, ports, attributes and label presence;
Graphviz JSON fixtures record engine/package versions and hashes.

<!-- Native wire string validity derived from DOT escaping and independent Graphviz negative controls -->

Native display strings/IDs and strict document label patches reject literal NUL
and lone surrogates. Arbitrary user data remains JSON-escaped in private metadata,
including these values, and is not rejected merely for containing them.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

Generated DOT edge IDs follow statement expansion order. A strict edge-label
patch after any change to the native edge record sequence requires one matching
versioned `_stately.id` in both baseline and current source. Insertions, removals,
reordering or record edits otherwise reject with `ambiguous-native-identity`.
The ordinary DOT `id` attribute is retained native data and is not this private
Graph identity protocol. Comments/defaults outside unchanged edge records and
stable node-label edits remain mergeable; source-only updates remain authoritative.
