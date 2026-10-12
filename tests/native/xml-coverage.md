# XML/JGF/Graphviz/Python native validation scope

Schemas are pinned under `fixtures/` with original URLs, retrieval dates, SHA256,
licenses and every local resolver rewrite. Schema bytes are unmodified; only
`schemaLocation` URLs are rewritten in memory. libxml2 runs with `--nonet`.

| Profile | Independent oracle | Proven |
| --- | --- | --- |
| GraphML 1.0 | xmllint-wasm 5.3.0 / libxml2 2.13.8; all three normative dependencies | Standard exports, ports/nesting, scoped data/defaults, boolean direction, Unicode labels/BMP IDs, identity failures, invalid XML, missing references |
| GEXF 1.2draft | Same; all six core/data/dynamics/hierarchy/phylogeny/viz files | Published www namespace and native static input |
| GEXF 1.3 | Same; core/dynamics/viz files | Standard root carrier, native visual fields, weight/mutual/default direction, class-scoped declarations, descriptions, null/empty labels, numeric character references, invalid weights/XML |
| JGF v1 | Official pinned draft-04 schema; Ajv draft04 plugin 1.0.0 / Ajv 8.20.0 | Standard array exports, nullable metadata/directed defaults, native v1 round-trip |
| JGF v2.1 | Official pinned draft-07 schema; Ajv 8.20.0 | Standard keyed-node exports, metadata, edge direction, conversion from v1, sparse import canonical export, unavailable hyperedge projection |
| DOT | @hpcc-js/wasm-graphviz 1.22.0 / Graphviz 15.0.0 | Emitted topology, parallel/isolated nodes, Unicode, modes/arrows, strict merges, ports/compass, native defaults, ranks/clusters, attributes, explicit empty labels |
| GML standard | Pinned Python NetworkX 3.7 (`parse_gml(label=None)`), portable native CI | Fresh numeric IDs, entity/Unicode labels, native missing/empty label presence, isolated nodes, numeric weights, parallel multigraph output and malformed blocks |
| NetworkX node-link JSON | Pinned Python NetworkX 3.7 `node_link_graph`/`node_link_data`, portable native CI | Current edges/legacy links, scalar identities, arbitrary attributes, isolated nodes, loops/parallel edges, endpoint-scoped keys and missing-key allocation; native bool/numeric identity collapse rejected by adapter |

## Explicit discrepancies and limits

- Legacy default GraphML `id=""` fails NMTOKEN. The opt-in standard profile omits it.
- Supplementary-plane GraphML IDs fail this XSD/libxml2 profile; export rejects them.
- Published GraphML descendant key/keyref constraints produce ambiguous matches for
  a nested-edge fixture with physically unique IDs. The fixture remains a negative
  oracle case; the flat standard export validates. No schema semantic edits.
- Legacy default GEXF custom graph attributes fail XSD. Standard profile uses a
  discriminated root-only description carrier and preserves user descriptions.
- The GEXF 1.3 public `/viz` example disagrees with the published XSD's core visual
  namespace. Both inputs import, but the standard profile follows the pinned XSD.
- Undefined HTML entities fail libxml2 even though the convenience parser enables
  its HTML-entity option to decode numeric XML references. Import is not runtime XSD validation.
- Official JGF v2 nodes-only/empty graph alternatives overlap `oneOf`; adding
  `edges: []` makes the standard binary profile unambiguous. Legacy hybrid output
  intentionally fails both official schemas; explicit versions are tested valid.
- Graphviz default `\\N` and literal empty labels differ. Native provenance retains
  that distinction; document edits to absent/default-ID labels reject, with native
  source edits available. DOT weights remain native attributes unless stored in a
  Graph extension; complete Graphviz grammar/semantics are not claimed.
- XSD validation does not execute temporal semantics, prove arbitrary foreign
  extensions, or establish 100% Graph/native semantic round-tripping. Document
  source preservation is separately exact; supported edits remain bounded.
- NetworkX also accepts quoted string GML IDs; that reader extension does not
  establish conformance to the integer-ID GML specification. GML `null` labels
  require the library's private presence extension; native GML has quoted strings.
- Python node-link accepts broader identities and silently merges duplicate
  Python-equivalent nodes/keys or creates undeclared endpoints. The adapter's
  explicit scalar-ID profile rejects cases that would collapse identity or topology.
- The Python helper also exposes Pajek for future fixture work. NetworkX Pajek
  parsing is a limited interoperability oracle, not a complete native validator:
  it uses labels as node identity and can collapse distinct equal-label vertices.
- Pinned igraph 1.0.0 provides an additional C-backed Pajek `.net` reader. Actual
  duplicate-label vertices retain independent numeric identity, comments parse,
  and uniform weighted/parallel/isolated cases are captured. Mixed sections lose
  individual edge direction by selecting a global mode; project/temporal formats
  remain outside this oracle's documented subset.
- Draw.io preparation pins its Apache-2.0 generated-file XSD and fixtures. Actual
  maxgraph 0.25.0 `ModelXmlSerializer.import` provides mxGraph model compatibility
  proof for layers/groups/UserObject/HTML/style/geometry/waypoints; this is not
  the draw.io renderer. Compressed page XML is independently inflated with Node
  zlib before model import. The unmodified published XSD rejects compressed text
  pages despite describing them; its validated profile is uncompressed generation.

Primary sources: https://graphml.graphdrawing.org/specification.html,
https://gexf.net/schema.html, https://gexf.net/viz.html,
https://github.com/jsongraph/json-graph-specification,
https://graphviz.org/docs/outputs/json/.
