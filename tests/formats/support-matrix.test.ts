import { describe, expect, it } from 'vitest';
import {
  FORMAT_SUPPORT_MATRIX,
  getFormatSupportEntry,
} from '../../src/format-support';
import { fromCytoscapeJSON, toCytoscapeJSON } from '../../src/formats/cytoscape';
import { fromD3Graph, toD3Graph } from '../../src/formats/d3';
import { fromELK, toELK } from '../../src/formats/elk';
import { fromGEXF, toGEXF } from '../../src/formats/gexf';
import { fromGML, toGML } from '../../src/formats/gml';
import { fromGraphML, toGraphML } from '../../src/formats/graphml';
import { fromJGF, toJGF } from '../../src/formats/jgf';
import { fromXYFlow, toXYFlow } from '../../src/formats/xyflow';
import type { FormatSupportEntry } from '../../src/format-support';
import type { Graph, VisualGraph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const SELECTED_FIXTURE_KEYS = {
  graphKeys: ['initialNodeId', 'data', 'direction', 'style'] as Array<keyof Graph>,
  nodeKeys: [
    'parentId',
    'initialNodeId',
    'label',
    'data',
    'x',
    'y',
    'width',
    'height',
    'shape',
    'color',
    'style',
    'ports',
  ] as Array<keyof Graph['nodes'][number]>,
  edgeKeys: [
    'mode',
    'label',
    'weight',
    'data',
    'x',
    'y',
    'width',
    'height',
    'color',
    'style',
    'sourcePort',
    'targetPort',
    'points',
    'routing',
  ] as Array<keyof Graph['edges'][number]>,
};

const SELECTED_FIXTURE_CHECKS = {
  cytoscape: (graph: Graph) => fromCytoscapeJSON(toCytoscapeJSON(graph)),
  d3: (graph: Graph) => fromD3Graph(toD3Graph(graph)),
  elk: (graph: Graph) => fromELK(toELK(graph as VisualGraph)),
  gexf: (graph: Graph) => fromGEXF(toGEXF(graph)),
  gml: (graph: Graph) => fromGML(toGML(graph)),
  graphml: (graph: Graph) => fromGraphML(toGraphML(graph)),
  jgf: (graph: Graph) => fromJGF(toJGF(graph)),
  xyflow: (graph: Graph) => fromXYFlow(toXYFlow(graph as VisualGraph)),
} satisfies Record<string, (graph: Graph) => Graph>;

describe('format support matrix', () => {
  it('covers every published graph format export', () => {
    const ids = FORMAT_SUPPORT_MATRIX.map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'graphson',
        'dgml',
        'cx2',
        'rdf',
        'adjacency-list',
        'adjacency-matrix',
        'matrix-market',
        'graphviz-json',
        'drawio',
        'pajek',
        'plantuml',
        'mermaid/architecture',
        'mermaid/requirement',
        'mermaid/sankey',
        'mermaid/gitgraph',
        'mermaid/c4',
        'mermaid/usecase',
        'csv',
        'tsv',
        'graphology',
        'graphlib',
        'networkx',
        'cytoscape',
        'd2',
        'd3',
        'dot',
        'edge-list',
        'elk',
        'gexf',
        'gml',
        'graphml',
        'jgf',
        'tgf',
        'xyflow',
        'mermaid/block',
        'mermaid/class',
        'mermaid/er',
        'mermaid/flowchart',
        'mermaid/ishikawa',
        'mermaid/mindmap',
        'mermaid/sequence',
        'mermaid/state',
      ]),
    );
  });

  it('describes d2 mappings without claiming complete syntax preservation', () => {
    const d2 = getFormatSupportEntry('d2');
    expect(d2).toBeDefined();
    expect(d2?.features.ports).toBe('full');
    expect(d2?.features.hierarchy).toBe('full');
    expect(d2?.features.roundTrip).toBe('partial');
    expect(d2?.features.weight).toBe('none');
  });

  it('captures known DOT round-trip limitations', () => {
    const dot = getFormatSupportEntry('dot');

    expect(dot).toBeDefined();
    expect(dot?.features.ports).toBe('partial');
    expect(dot?.features.roundTrip).toBe('partial');
    expect(dot?.notes.join('\n')).toContain('compass');
  });

  it('captures known Mermaid state round-trip limitations', () => {
    const state = getFormatSupportEntry('mermaid/state');

    expect(state).toBeDefined();
    // Diagram-specific mappings do not establish complete preservation.
    expect(state?.features.roundTrip).toBe('partial');
    expect(state?.notes.join('\n')).toContain('data');
    expect(state?.notes.join('\n')).toContain('Isolated');
  });

  it('marks structured adapters with full port fidelity', () => {
    for (const id of ['cytoscape', 'd3', 'gexf', 'gml', 'jgf']) {
      expect(getFormatSupportEntry(id)?.features.ports).toBe('full');
    }
  });

  it('captures structured hierarchy support accurately', () => {
    for (const id of ['cytoscape', 'gexf', 'gml', 'jgf']) {
      expect(getFormatSupportEntry(id)?.features.hierarchy).toBe('full');
    }
  });

  it('captures GraphML dual-dialect import support and remaining limitations', () => {
    const graphml = getFormatSupportEntry('graphml');

    expect(graphml).toBeDefined();
    // Emit is own-dialect (<data> fields, flat structure); import handles
    // both dialects (nested <graph>, native <port>, sourceport/targetport).
    expect(graphml?.features.hierarchy).toBe('full');
    expect(graphml?.features.ports).toBe('full');
    expect(graphml?.features.roundTrip).toBe('partial');
    expect(graphml?.notes.join('\n')).toContain('both dialects');
    expect(graphml?.notes.join('\n')).toContain('nested `<graph>`');
    expect(graphml?.notes.join('\n')).toContain('`<port>`');
    // Multi-graph documents import the first graph only.
    expect(graphml?.notes.join('\n')).toContain('first `<graph>`');
  });

  it('separates Graph, native semantic and source document preservation', () => {
    for (const entry of FORMAT_SUPPORT_MATRIX) {
      expect(entry.preservation, entry.id).toEqual({
        graph: 'partial',
        native: entry.id === 'edge-list' ? 'full' : 'partial',
        document: ['d2', 'graphson', 'dgml', 'cx2', 'rdf'].includes(entry.id) || entry.id.startsWith('mermaid/') ? 'partial' : 'none',
      });
      expect(entry.features.roundTrip, entry.id).toBe(entry.preservation?.graph);
    }
  });

  it('retains compatibility with entries that only provide legacy features', () => {
    const entry: FormatSupportEntry = {
      id: 'custom',
      importPath: 'custom/format',
      features: FORMAT_SUPPORT_MATRIX[0].features,
      notes: [],
    };
    expect(entry.preservation).toBeUndefined();
  });

  it('gives each built-in format a unique identity and an explicit preservation contract', () => {
    expect(new Set(FORMAT_SUPPORT_MATRIX.map((entry) => entry.id)).size).toBe(
      FORMAT_SUPPORT_MATRIX.length,
    );
    expect(FORMAT_SUPPORT_MATRIX.every((entry) => entry.preservation !== undefined)).toBe(true);
  });

  // These checks project selected fields and sort entities. They characterize
  // known mappings, not complete Graph, native format or source conformance.
  it('keeps selected fixture characterizations for structured adapters', () => {
    expect(Object.keys(SELECTED_FIXTURE_CHECKS).sort()).toEqual([
      'cytoscape', 'd3', 'elk', 'gexf', 'gml', 'graphml', 'jgf', 'xyflow',
    ]);
  });

  it.each(Object.entries(SELECTED_FIXTURE_CHECKS))(
    '%s preserves the selected fixture fields (entity order excluded)',
    (_id, roundTrip) => {
      expectFixtureRoundTrip(roundTrip, SELECTED_FIXTURE_KEYS);
    },
  );
});
