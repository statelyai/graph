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
      hierarchy: 'partial',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Uses Cytoscape JSON element data with partial layout/style fidelity.',
      'Ports round-trip through element data as `ports`, `sourcePort`, and `targetPort`.',
    ],
  },
  {
    id: 'd3',
    importPath: '@statelyai/graph/d3',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'none',
      ports: 'full',
      visual: 'partial',
      style: 'none',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Targets force-graph structures, not compound graph metadata.',
      'Ports round-trip through node/link objects.',
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
      'Port syntax (`:port:compass`) is not fully mapped.',
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
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Optimized for layout exchange with ELK rather than exact styling parity.'],
  },
  {
    id: 'gexf',
    importPath: '@statelyai/graph/gexf',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'none',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'Attribute and viz extensions round-trip partially.',
      'Ports round-trip via custom node/edge attributes.',
    ],
  },
  {
    id: 'gml',
    importPath: '@statelyai/graph/gml',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'none',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'GML support focuses on common graph/node/edge attributes.',
      'Ports round-trip through JSON-stringified node metadata and edge fields.',
    ],
  },
  {
    id: 'graphml',
    importPath: '@statelyai/graph/graphml',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'none',
      ports: 'full',
      visual: 'partial',
      style: 'partial',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'GraphML attribute fidelity is good, but not every extension is represented.',
      'Ports round-trip through node and edge `<data>` fields.',
    ],
  },
  {
    id: 'jgf',
    importPath: '@statelyai/graph/jgf',
    features: {
      directed: 'full',
      undirected: 'full',
      hierarchy: 'none',
      ports: 'full',
      visual: 'none',
      style: 'none',
      weight: 'full',
      roundTrip: 'partial',
    },
    notes: [
      'JGF preserves core graph structure and data, but not layout primitives.',
      'Ports round-trip through node and edge metadata.',
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
      hierarchy: 'none',
      ports: 'full',
      visual: 'full',
      style: 'partial',
      weight: 'none',
      roundTrip: 'partial',
    },
    notes: ['Ports map cleanly to handles, but styling remains adapter-specific.'],
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
    notes: ['State notes are stored, but not fully round-trippable as separate graph entities.'],
  },
];

export function getFormatSupportEntry(id: string): FormatSupportEntry | undefined {
  return FORMAT_SUPPORT_MATRIX.find((entry) => entry.id === id);
}
