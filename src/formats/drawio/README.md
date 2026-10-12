# draw.io XML

<!-- public API and optional peers from src/formats/drawio/index.ts and package.json -->

```ts
import {
  fromDrawio, toDrawio, createDrawioDocumentConverter,
} from '@statelyai/graph/drawio';

const graph = fromDrawio(xml, { pageId: 'page-one' });
const output = toDrawio(graph); // unchanged imported source
const fresh = toDrawio(graph, { nativeCarrier: false, compressed: true });
const codec = createDrawioDocumentConverter({ pageId: 'page-one' });
const document = codec.from(xml);
if (document.graph) document.graph.nodes[0].label = 'Updated';
const edited = codec.to(document);
```

Install optional peers `fast-xml-parser` and `fflate`. The package root remains
independent of these peers. `drawioConverter` and `drawioDocumentConverter` provide
default conversion/document APIs. Public option types are `DrawioImportOptions`,
`DrawioExportOptions` and `DrawioDocumentOptions`.

<!-- selected-page mapping and domain restrictions derived from drawio parser and serializer -->

Accepts bare `mxGraphModel`, uncompressed `mxfile`, and base64/raw-DEFLATE/URI-encoded
pages. Multiple pages require explicit `pageId`; otherwise the document retains
all source with `graph: null` and diagnostics. Duplicate page matches reject.
Supplied and decoded XML strings are bounded to 16 × 1024² UTF-16 code
units; base64 payload length has the same limit. Inflated data is bounded to
16 MiB using a fixed output buffer. Projection validates XML, identities, references and parent cycles.

Vertices/groups become Graph nodes. Layers and structural cells remain native
state; structural wire IDs `0`/`1` never become fabricated nodes. `UserObject` and
`object` attributes, raw HTML labels, style strings, relative vertex geometry and
edge label offsets remain available as native state. Ordinary vertex coordinates
are relative to their parent. Fractional relative vertex x/y are retained without
misrepresenting them as absolute coordinates. Edge waypoints map to `points`;
relative edge-label x/y/offsets remain native metadata, never an absolute label
rectangle. Dangling or non-vertex terminals reject projection.

Direction defaults to `directed`; arrowheads are decorative. Explicit `mode`
selects a Graph mode. `{ mode: 'infer-arrows' }` opts into inference, including
reversing a start-only arrow, preserving two arrows as bidirectional and no arrows
as undirected. This is a caller policy, not native draw.io direction semantics.

Fresh XML uses collision-safe node/edge wire IDs and versioned UserObject metadata
for original Graph IDs, data, ports, nullable labels and other Graph-only fields.
Visible native label/geometry/style changes take precedence over their recorded
baselines. `{ metadata: 'native' }` imports private markers as ordinary native
attributes. Deliberate indistinguishable marker collisions require explicit policy;
private extensions do not establish unrestricted external semantic losslessness.

<!-- drawio document preservation and bounded edit contract from createDrawioDocumentConverter -->

Document no-op output preserves **exact source text**, including comments, unknown
XML, unselected pages and compressed payloads, after JSON persistence. Original file encoding lies outside this string API.
Projection is partial. Safe patches update literal node/edge labels through verified XML
attribute spans. HTML/placeholder labels, structural edits, styles, data, geometry
and nullable-label requests reject with diagnostics. XML-invalid characters and
lone surrogates reject. Source comments/custom attributes survive independent Graph
label edits; same-field conflicts reject. Uncompressed edits retain all other string content;
compressed edits recompress only the selected page. Strict `.to` never replays
stale source for unsupported edits. Explicit regeneration via `.getUpdate(document,
{ mode: 'regenerate' })` reports loss and creates a new single-page file.

<!-- native validation boundaries from tests/native/drawio-schema.test.ts, drawio-codec.test.ts and followon-adapters.test.ts -->

Tests validate uncompressed generated XML with actual libxml2 and the pinned
official drawio-mcp XSD, then import models using maxgraph 0.25.0's actual
mxGraph-compatible codec. This proves model import compatibility, not operation of
the draw.io editor/renderer. Independent Node zlib inflation checks compressed
pages. The official generation XSD currently requires a child `mxGraphModel` and
rejects compressed diagram text despite documenting compressed pages; compressed
outer files therefore do not claim validity against that XSD. Their decoded models
have independent codec proof. A 10,000-node bulk-label regression exercises bounded
span editing without repeated full-string reconstruction.
