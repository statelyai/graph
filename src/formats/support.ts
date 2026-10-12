/** `full` covers the stated contract; `partial` covers a subset; `none` is unsupported. */
export type FormatSupportLevel = 'full' | 'partial' | 'none';

/**
 * Distinct bare-Graph converter preservation contracts. Native document envelopes
 * separately retain exact source on no-op export within their validated JSON domain.
 * These describe existing behavior, not a
 * promise that every native construct is representable by the Graph model.
 */
export interface FormatPreservationCapabilities {
  /** Graph -> format -> Graph: all JSON-serializable fields, presence and entity order. */
  graph: FormatSupportLevel;
  /** Native format -> Graph -> format: native topology, attributes and semantics. */
  native: FormatSupportLevel;
  /** Source-only details: comments, declaration order, spelling and whitespace. */
  document: FormatSupportLevel;
}

export interface FormatSupportFeatures {
  directed: FormatSupportLevel;
  undirected: FormatSupportLevel;
  hierarchy: FormatSupportLevel;
  ports: FormatSupportLevel;
  visual: FormatSupportLevel;
  style: FormatSupportLevel;
  weight: FormatSupportLevel;
  /** Legacy Graph round-trip assessment; use `preservation` for distinct contracts. */
  roundTrip: FormatSupportLevel;
}

export interface FormatSupportEntry {
  id: string;
  importPath: string;
  features: FormatSupportFeatures;
  /** Optional for compatibility with third-party entries; populated for all built-in formats. */
  preservation?: FormatPreservationCapabilities;
  notes: string[];
}

/**
 * Feature support describes mapped Graph concepts. Adapter-specific metadata
 * may carry concepts without a native field, but that does not establish native
 * format conformance or document preservation. Selected fixture tests exercise
 * only their asserted fields; no adapter currently preserves unrestricted Graphs.
 */

export const FORMAT_SUPPORT_MATRIX: FormatSupportEntry[] = [
  {
    id: "graphson",
    importPath: "@statelyai/graph/graphson",
    preservation: { graph: "partial", native: "partial", document: "partial" },
    features: {
      directed: "full",
      undirected: "none",
      hierarchy: "none",
      ports: "none",
      visual: "none",
      style: "none",
      weight: "partial",
      roundTrip: "partial",
    },
    notes: [
      "Explicit GraphSON3 typed tinker:graph object profile, backed by TinkerIoRegistryV3. Directed identities and raw typed properties retain Int64/BigInteger/BigDecimal wrappers, multi/meta-properties and typed maps/sets. Fresh Graph data uses documented JSON-string properties and a Graph-only string sidecar; unsupported modes/IDs/labels reject. Source-exact documents and bounded label/property patches are distinct from complete TinkerPop type-system coverage.",
    ],
  },
  {
    id: "dgml",
    importPath: "@statelyai/graph/dgml",
    preservation: { graph: "partial", native: "partial", document: "partial" },
    features: {
      directed: "full",
      undirected: "none",
      hierarchy: "partial",
      ports: "none",
      visual: "none",
      style: "partial",
      weight: "none",
      roundTrip: "partial",
    },
    notes: [
      "DGML groups/Contains hierarchy and directed links use positional native IDs dgml_link_N; fresh export is strict unless edgeIds:positional explicitly accepts identity loss. Implicit endpoint provenance and signed64 lexical magnitudes are retained. The published Microsoft XSD verifies selected profiles but rejects dynamic custom property attributes; no Windows renderer conformance claim. Documents retain exact source with bounded native edits.",
    ],
  },
  {
    id: "cx2",
    importPath: "@statelyai/graph/cx2",
    preservation: { graph: "partial", native: "partial", document: "partial" },
    features: {
      directed: "full",
      undirected: "none",
      hierarchy: "none",
      ports: "none",
      visual: "partial",
      style: "none",
      weight: "none",
      roundTrip: "partial",
    },
    notes: [
      "Scoped NDEx CX2 uses safe canonical numeric identities, typed declarations/defaults/aliases, directed multigraphs and complete x/y coordinates. Visual/custom aspects remain opaque. Null typed attributes and late declarations reject projection; actual NDEx3.12 defaults/null omission are characterized. Documents retain exact source and bounded native labels/properties.",
    ],
  },
  {
    id: "rdf",
    importPath: "@statelyai/graph/rdf",
    preservation: { graph: "partial", native: "partial", document: "partial" },
    features: {
      directed: "full",
      undirected: "none",
      hierarchy: "none",
      ports: "none",
      visual: "none",
      style: "none",
      weight: "none",
      roundTrip: "partial",
    },
    notes: [
      "Explicit RDF1.1 dataset maps subject/object terms to nodes, predicates to directed edges and graph names to edge data; lexical forms, datatypes, language case and scoped blank identity remain intact without coercion/reasoning. DTO core is dependency-free; optional n3 syntax supports N-Triples/N-Quads/Turtle/TriG. JSON-LD/RDF1.2/executable reasoning are deferred. Exact-source documents and strict supported patches do not imply arbitrary Graph encoding.",
    ],
  },
  {
    id: 'adjacency-matrix', importPath: '@statelyai/graph/adjacency-matrix',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Numeric adjacency matrices require an explicit aggregation policy for parallels and preserve selected Graph fields through a sidecar. Matrix values cannot independently encode identities, direction, ports or native document metadata."],
  },
  {
    id: 'matrix-market', importPath: '@statelyai/graph/matrix-market',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Matrix Market uses square coordinate/array real/integer/pattern profiles and explicit Graph metadata sidecars; complex/skew/malformed inputs reject. Aggregation and symmetry policies are explicit; numeric matrices do not independently retain arbitrary graph semantics."],
  },
  {
    id: 'graphviz-json', importPath: '@statelyai/graph/graphviz-json',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'partial', ports: 'partial', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Consumes Graphviz JSON objects/_gvid endpoints and rendered layout attributes. Captured layout is preserved for unedited native imports; structural regeneration is explicit and discards stale rendering commands. This is a scoped rendered-layout JSON profile. Graphviz provides JSON output rather than a native JSON input reader; fresh structural JSON has no native-reader conformance claim."],
  },
  {
    id: 'drawio', importPath: '@statelyai/graph/drawio',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'full', ports: 'partial', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Maps mxGraph cells, layers, hierarchy, styles and routing in selected draw.io pages. Arrow decorations are separate from graph direction; mode interpretation is explicit. Compressed raw-DEFLATE pages require optional fflate, and HTML labels remain raw source values."],
  },
  {
    id: 'pajek', importPath: '@statelyai/graph/pajek',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Scoped Pajek vertices/arcs/edges preserve names, uniform modes, weights and selected metadata. Hierarchy, ports and other Graph-only fields use private comment metadata, rather than native Pajek features. Unknown native attributes remain opaque; incompatible mixed/bidirectional graphs and executable/unprojected sections reject."],
  },
  {
    id: 'plantuml', importPath: '@statelyai/graph/plantuml',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'partial', ports: 'none', visual: 'partial', style: 'partial', weight: 'partial', roundTrip: 'partial' },
    notes: ["Scoped PlantUML component/class declarations, hierarchy, members and relationships map to Graph. Executable includes/preprocessors and other diagram languages reject; semantic coverage remains partial. Exact document source retention is separate from projection."],
  },
  {
    id: 'mermaid/architecture', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'full', ports: 'full', visual: 'partial', style: 'partial', weight: 'none', roundTrip: 'partial' },
    notes: ["Architecture services/groups/junctions map hierarchy, icons and L/R/T/B connection-side ports; canonical modes govern arrows. Unknown grammar rejects projection while documents preserve exact source; verified declaration-label patches are bounded."],
  },
  {
    id: 'mermaid/requirement', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'none', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'partial', weight: 'none', roundTrip: 'partial' },
    notes: ["Requirement types, business IDs, text, risk, verification, typed relationships and selected styles/classes are mapped. Native empty strings require omission; empty identities reject. Verified body-text patches preserve comments; other native semantics remain partial."],
  },
  {
    id: 'mermaid/sankey', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'none', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'none', weight: 'full', roundTrip: 'partial' },
    notes: ["Mermaid12.1 Sankey accepts printable ASCII names only and trims outer whitespace, even within quoted fields. Weights map native values; missing export weights default to one. Unicode, isolates and incompatible topology reject projection/output; documents retain unsupported source exactly."],
  },
  {
    id: 'mermaid/gitgraph', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'none', hierarchy: 'none', ports: 'none', visual: 'partial', style: 'partial', weight: 'none', roundTrip: 'partial' },
    notes: ["GitGraph projects ordered branch/checkout/commit/merge/cherry-pick actions into a child-to-parent commit DAG. Anonymous IDs normalize; mainBranch controls native configuration. Inconsistent action/DAG edits reject; document Graph patches are unsupported."],
  },
  {
    id: 'mermaid/c4', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'none', hierarchy: 'full', ports: 'none', visual: 'partial', style: 'partial', weight: 'none', roundTrip: 'partial' },
    notes: ["Scoped C4 Context/Container/Component/Dynamic/Deployment macros, boundaries, typed entities, technologies, descriptions and relation arguments are mapped. Unsupported renderer/update macros reject projection; verified declaration-label patches retain source."],
  },
  {
    id: 'mermaid/usecase', importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: { directed: 'full', undirected: 'partial', hierarchy: 'partial', ports: 'none', visual: 'partial', style: 'partial', weight: 'none', roundTrip: 'partial' },
    notes: ["Mermaid12 UseCase actors, one-level system boundaries, include/extend/generalization, association markers/lengths, notes, JSON tables and selected metadata/styles/classes map to Graph. Notes normalize after regular entities; verified declaration-label patches are bounded."],
  },

  {
    id: 'csv',
    importPath: '@statelyai/graph/csv',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'full', hierarchy: 'full', ports: 'full', visual: 'full', style: 'full', weight: 'full', roundTrip: 'partial' },
    notes: ["Explicit node/edge tables retain isolates; configurable typed columns and default JSON cells preserve null, missing and empty values. The Graph-specific schema/root/extra fields are a partial profile, not a universal CSV graph standard. Exact document no-op preserves unknown columns; bounded cell edits retain untouched text."],
  },
  {
    id: 'tsv',
    importPath: '@statelyai/graph/csv',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'full', hierarchy: 'full', ports: 'full', visual: 'full', style: 'full', weight: 'full', roundTrip: 'partial' },
    notes: ["Uses the CSV adapter with a tab delimiter and explicit node/edge tables. Custom schemas and nativeCarrier:false can omit Graph fields; document edits are bounded to mapped existing cells."],
  },
  {
    id: 'graphology',
    importPath: '@statelyai/graph/graphology',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'full', hierarchy: 'partial', ports: 'full', visual: 'full', style: 'full', weight: 'full', roundTrip: 'partial' },
    notes: ["Graphology export JSON supports mixed, directed and undirected graphs and parallel edges. Graph-specific fields use attribute metadata; native reserved options and constructor-sensitive keys have explicit boundaries."],
  },
  {
    id: 'graphlib',
    importPath: '@statelyai/graph/graphlib',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'full', hierarchy: 'full', ports: 'full', visual: 'full', style: 'full', weight: 'full', roundTrip: 'partial' },
    notes: ["Graphlib JSON maps compound hierarchy and named parallel edges. Native direction is uniform; mixed/bidirectional graphs require explicit conversion policy or are rejected. Graph-specific fields use attribute metadata."],
  },
  {
    id: 'networkx',
    importPath: '@statelyai/graph/networkx',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: { directed: 'full', undirected: 'full', hierarchy: 'partial', ports: 'full', visual: 'full', style: 'full', weight: 'full', roundTrip: 'partial' },
    notes: ["NetworkX 3.7 node-link JSON defaults to edges; links requires an explicit legacy option. Typed native IDs and multigraph keys are retained. Native direction is uniform; Graph-specific fields use metadata."],
  },

  {
    id: 'adjacency-list',
    importPath: '@statelyai/graph/adjacency-list',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'none',
      ports: 'none',
      visual: 'none',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Adjacency lists preserve connectivity with collision-safe endpoint tuples and prototype-safe keys; identity, parallel-edge multiplicity and arbitrary edge metadata remain unsupported.'],
  },
  {
    id: 'cytoscape',
    importPath: '@statelyai/graph/cytoscape',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Uses Cytoscape JSON element data with graph, node, and edge metadata stored in element data.',
      'Ports round-trip through element data as `ports`, `sourcePort`, and `targetPort`.',
      'Per-edge `mode` overrides (including bidirectional) round-trip through element data.',
    ],
  },
  {
    id: 'd3',
    importPath: '@statelyai/graph/d3',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Targets force-graph structures, but graph, node, and edge metadata can be preserved on the loose JSON shape.',
      'Ports round-trip through node/link objects.',
      'Per-edge `mode` overrides (including bidirectional) round-trip through link objects.',
    ],
  },
  {
    id: 'd2',
    importPath: '@statelyai/graph/d2',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: [
      'Containers map to hierarchy; authored key paths/declaration hints are retained where compatible with live Graph edits.',
      'sql_table/class fields map to ports; node.field connections round-trip as sourcePort/targetPort.',
      'Per-edge connectors (->, <-, --, <->) map to edge.mode; the authored glyph is preserved in edge.data.arrow.',
      'Recursive vars/classes and scoped import kind/order are preserved as source metadata; substitutions/imports remain opaque, and boards/globs are retained for inspection rather than projected as nodes.',
      'Quoted key identity, ancestor/indexed-edge references, chain attributes, structured common attributes and arrowheads are retained. Effective canonical modes override stale connector hints; comments may be reformatted.',
      'd2 has no native edge weight.',
    ],
  },
  {
    id: 'dot',
    importPath: '@statelyai/graph/dot',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'partial',
      ports: 'partial',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: [
      'Edge port ids, compass points and supported record/HTML label port definitions are retained; unrestricted DOT grammar and native port semantics remain partial.',
      'Repeated declarations, strict edges, rank-group contents, native clusters, HTML labels and inherited attributes retain supported semantics. Comments and source declaration order remain unsupported.',
    ],
  },
  {
    id: 'edge-list',
    importPath: '@statelyai/graph/edge-list',
    preservation: { graph: 'partial', native: 'full', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'none',
      ports: 'none',
      visual: 'none',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Edge lists preserve endpoints only.'],
  },
  {
    id: 'elk',
    importPath: '@statelyai/graph/elk',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Native ELK labels, sections, options and primitive edges are retained alongside mapped Graph fields; hyperedges are rejected at the Graph boundary rather than truncated.',
      'Per-edge `mode` overrides (including bidirectional) round-trip through reserved layout options.',
      'Port IDs use collision-free document-unique allocation; original port names round-trip through reserved metadata.',
    ],
  },
  {
    id: 'gexf',
    importPath: '@statelyai/graph/gexf',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Custom attributes preserve graph, node, and edge metadata beyond the standard viz module.',
      'Ports round-trip via custom node/edge attributes.',
      'Native weight, undirected defaults and mutual bidirectional edges are imported/emitted. Scoped attributes, selected viz data and opaque temporal metadata are retained; custom Graph extensions are not an unrestricted XSD-conformance guarantee.',
    ],
  },
  {
    id: 'gml',
    importPath: '@statelyai/graph/gml',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'GML stores graph, node, and edge metadata directly or as JSON-stringified fields.',
      'Ports round-trip through JSON-stringified node metadata and edge fields.',
      'Per-edge `mode` overrides and graph-level bidirectional mode round-trip through a dialect `mode` key (GML `directed` is binary).',
    ],
  },
  {
    id: 'graphml',
    importPath: '@statelyai/graph/graphml',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Emit is own-dialect: a flat structure with hierarchy, ports, and metadata in `<data>` fields; the emitter does not write nested `<graph>` or native `<port>` elements.',
      'Import handles both dialects: own-dialect `<data>` fields plus standard nested `<graph>` hierarchy, native `<port>` elements (imported as direction `inout`), and `sourceport`/`targetport` edge attributes. `<data>` fields take precedence.',
      'Multi-graph documents import the first `<graph>` element only; hyperedges fail explicitly because Graph cannot faithfully represent their endpoints.',
      'Scoped key IDs/names/types/defaults, prefixed namespaces, nested direction and native port metadata are imported. Unknown vendor data is retained opaquely; renderer-specific semantics are not interpreted.',
      'Per-edge directedness uses the native boolean edge attribute; Graph bidirectional mode and optional-field presence use private metadata while visible native edits take precedence.',
    ],
  },
  {
    id: 'jgf',
    importPath: '@statelyai/graph/jgf',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Supports JGF v1 node arrays and explicit v2 node dictionaries; legacy dialect input remains readable. Native relation/directedness and foreign metadata are retained with versioned Graph metadata.',
      'Ports round-trip through node and edge metadata.',
      'Per-edge `mode` overrides and graph-level bidirectional mode round-trip through `metadata` (JGF `directed` is binary).',
    ],
  },
  {
    id: 'tgf',
    importPath: '@statelyai/graph/tgf',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'none',
      ports: 'none',
      visual: 'none',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['TGF is intentionally minimal and loses metadata beyond ids and labels.'],
  },
  {
    id: 'xyflow',
    importPath: '@statelyai/graph/xyflow',
    preservation: { graph: 'partial', native: 'partial', document: 'none' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Native xyflow viewport/UI fields and foreign reserved-key data are retained through versioned metadata; unambiguous renderer-visible edits take precedence over stored Graph snapshots.',
    ],
  },
  {
    id: 'mermaid/block',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Block quoted labels, shapes, spans, nested columns and direct styles are retained. Supported connectors use canonical modes; unsupported spacing/directive syntax is retained for inspection.'],
  },
  {
    id: 'mermaid/class',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'partial',
      undirected: 'partial',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'none',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Class namespaces, aliases, notes, styles, lollipop interfaces and two-sided relationships are retained. Generic/member syntax remains conservative and is not a complete UML semantic model.'],
  },
  {
    id: 'mermaid/er',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'partial',
      undirected: 'partial',
      hierarchy: 'none',
      ports: 'none',
      visual: 'none',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['ER isolated entities, aliases, direction, multiple attribute keys/comments and supported cardinalities are retained; complete styling/renderer metadata remains unsupported.'],
  },
  {
    id: 'mermaid/flowchart',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: [
      'Flowchart styles, expanded shape/image/icon properties, explicit edge IDs, long connectors and declaration overrides are retained; linkStyle indexes are recomputed from live edges.',
      'Canonical labels/shapes/modes and live stroke edits override stale source hints. Comments, opaque frontmatter and JSON directives are retained, with reformatted source placement.',
    ],
  },
  {
    id: 'mermaid/ishikawa',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'none',
      hierarchy: 'full',
      ports: 'none',
      visual: 'none',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Indentation is preserved as hierarchy; renderer-specific fishbone layout is not represented.'],
  },
  {
    id: 'mermaid/mindmap',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'partial',
      undirected: 'none',
      hierarchy: 'full',
      ports: 'none',
      visual: 'partial',
      style: 'none',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Mindmap named shapes retain authored IDs; icon/class lines decorate their node, and escaping is symmetric. Arbitrary non-tree edges and generated-ID identity are not native source concepts.'],
  },
  {
    id: 'mermaid/sequence',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'none',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'none',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Sequence notes/lifecycle use ordered live-entity references and stable note IDs; missing references fail explicitly. Official participant configuration, participant order and numbering parameters are retained; actor links/menus remain unsupported.'],
  },
  {
    id: 'mermaid/state',
    importPath: '@statelyai/graph/mermaid',
    preservation: { graph: 'partial', native: 'partial', document: 'partial' },
    features: {
      directed: 'full',
      undirected: 'none',
      hierarchy: 'full',
      ports: 'none',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: [
      'State-specific syntax such as notes, classes, descriptions, directions, hierarchy, and parallel regions round-trips through node and graph data.',
      'Isolated plain states emit as bare state lines, and node labels emit via the `state "label" as id` description form — a distinct label is lost when a description is also present.',
      '`graph.initialNodeId` round-trips as a top-level `[*] -->` transition.',
    ],
  },
];

export function getFormatSupportEntry(id: string): FormatSupportEntry | undefined {
  return FORMAT_SUPPORT_MATRIX.find((entry) => entry.id === id);
}
