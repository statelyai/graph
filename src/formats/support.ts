export type FormatSupportLevel = 'full' | 'partial' | 'none';

export interface FormatSupportFeatures {
  directed: FormatSupportLevel;
  undirected: FormatSupportLevel;
  hierarchy: FormatSupportLevel;
  ports: FormatSupportLevel;
  visual: FormatSupportLevel;
  style: FormatSupportLevel;
  weight: FormatSupportLevel;
  roundTrip: FormatSupportLevel;
}

export interface FormatSupportEntry {
  id: string;
  importPath: string;
  features: FormatSupportFeatures;
  notes: string[];
}

/**
 * Round-trip support is allowed to use adapter-specific graph, node, and edge
 * `data` metadata when the target format has no native field for a source
 * concept. A `partial` value means the adapter still drops meaningful source
 * information instead of preserving it as metadata.
 */

export const FORMAT_SUPPORT_MATRIX: FormatSupportEntry[] = [
  {
    id: 'adjacency-list',
    importPath: '@statelyai/graph/adjacency-list',
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
    notes: ['Adjacency lists preserve connectivity, but not edge metadata.'],
  },
  {
    id: 'cytoscape',
    importPath: '@statelyai/graph/cytoscape',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
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
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
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
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'none',
      roundTrip: 'full',
    },
    notes: [
      'Containers map to hierarchy; dot vs block declaration form is preserved per node.',
      'sql_table/class fields map to ports; node.field connections round-trip as sourcePort/targetPort.',
      'Per-edge connectors (->, <-, --, <->) map to edge.mode; the authored glyph is preserved in _d2.arrow.',
      'vars/classes/imports are preserved on graph data; comments attach to the following entity (best-effort).',
      'Only flat key/value vars round-trip; nested sub-blocks inside vars are dropped.',
      'd2 has no native edge weight.',
    ],
  },
  {
    id: 'dot',
    importPath: '@statelyai/graph/dot',
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
      'Edge port ids round-trip, but compass points and node port definitions are not mapped.',
      'HTML labels and layout hints beyond `rankdir` are lossy.',
    ],
  },
  {
    id: 'edge-list',
    importPath: '@statelyai/graph/edge-list',
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
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
    },
    notes: [
      'ELK-native layout fields are preserved directly; graph, node, port, and edge metadata round-trip through reserved layout options.',
      'Per-edge `mode` overrides (including bidirectional) round-trip through reserved layout options.',
      'Port ids are emitted as `nodeId__portName` so they are document-unique as ELK requires; original port names round-trip through reserved layout options.',
    ],
  },
  {
    id: 'gexf',
    importPath: '@statelyai/graph/gexf',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
    },
    notes: [
      'Custom attributes preserve graph, node, and edge metadata beyond the standard viz module.',
      'Ports round-trip via custom node/edge attributes.',
      'Per-edge directedness round-trips via the `type` edge attribute; bidirectional maps to directed.',
    ],
  },
  {
    id: 'gml',
    importPath: '@statelyai/graph/gml',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
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
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'full',
    },
    notes: [
      'Emit is own-dialect: a flat structure with hierarchy, ports, and metadata in `<data>` fields; the emitter does not write nested `<graph>` or native `<port>` elements.',
      'Import handles both dialects: own-dialect `<data>` fields plus standard nested `<graph>` hierarchy, native `<port>` elements (imported as direction `inout`), and `sourceport`/`targetport` edge attributes. `<data>` fields take precedence.',
      'Multi-graph documents import the first `<graph>` element only.',
      'Vendor extensions (e.g. yEd visual attributes) are not represented.',
      'Per-edge directedness round-trips via the `directed` edge attribute; bidirectional maps to directed.',
    ],
  },
  {
    id: 'jgf',
    importPath: '@statelyai/graph/jgf',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
    },
    notes: [
      'JGF preserves graph, node, and edge metadata via `metadata` objects.',
      'Ports round-trip through node and edge metadata.',
      'Per-edge `mode` overrides and graph-level bidirectional mode round-trip through `metadata` (JGF `directed` is binary).',
    ],
  },
  {
    id: 'tgf',
    importPath: '@statelyai/graph/tgf',
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
    features: {
      directed: 'full',
      undirected: 'partial',
      hierarchy: 'full',
      ports: 'full',
      visual: 'full',
      style: 'full',
      weight: 'full',
      roundTrip: 'full',
    },
    notes: [
      'xyflow-native fields are preserved directly; graph, node, edge, style, weight, port, and per-edge `mode` metadata round-trip through reserved data fields.',
    ],
  },
  {
    id: 'mermaid/block',
    importPath: '@statelyai/graph/mermaid',
    features: {
      directed: 'full',
      undirected: 'none',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Block edge semantics currently follow flowchart-style behavior.'],
  },
  {
    id: 'mermaid/class',
    importPath: '@statelyai/graph/mermaid',
    features: {
      directed: 'partial',
      undirected: 'partial',
      hierarchy: 'none',
      ports: 'none',
      visual: 'none',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Generic syntax is stored conservatively and not fully parsed.'],
  },
  {
    id: 'mermaid/er',
    importPath: '@statelyai/graph/mermaid',
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
    notes: ['Entity attributes and cardinality are preserved better than layout metadata.'],
  },
  {
    id: 'mermaid/flowchart',
    importPath: '@statelyai/graph/mermaid',
    features: {
      directed: 'full',
      undirected: 'none',
      hierarchy: 'partial',
      ports: 'none',
      visual: 'partial',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: [
      'Index-based `linkStyle` metadata is fragile after graph mutation.',
      'Mermaid init directives are not fully preserved.',
    ],
  },
  {
    id: 'mermaid/ishikawa',
    importPath: '@statelyai/graph/mermaid',
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
    notes: ['Icon syntax is stored conservatively and not fully re-emitted.'],
  },
  {
    id: 'mermaid/sequence',
    importPath: '@statelyai/graph/mermaid',
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
    notes: ['Actor links and menu syntax are not yet supported.'],
  },
  {
    id: 'mermaid/state',
    importPath: '@statelyai/graph/mermaid',
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
