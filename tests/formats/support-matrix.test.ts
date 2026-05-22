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
import { fromJGF, toJGF } from '../../src/formats/jgf';
import { fromXYFlow, toXYFlow } from '../../src/formats/xyflow';
import type { Graph, VisualGraph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const ROUND_TRIP_KEYS = {
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
  ] as Array<keyof Graph['edges'][number]>,
};

const FULL_ROUND_TRIP_CHECKS = {
  cytoscape: (graph: Graph) => fromCytoscapeJSON(toCytoscapeJSON(graph)),
  d3: (graph: Graph) => fromD3Graph(toD3Graph(graph)),
  elk: (graph: Graph) => fromELK(toELK(graph as VisualGraph)),
  gexf: (graph: Graph) => fromGEXF(toGEXF(graph)),
  gml: (graph: Graph) => fromGML(toGML(graph)),
  jgf: (graph: Graph) => fromJGF(toJGF(graph)),
  xyflow: (graph: Graph) => fromXYFlow(toXYFlow(graph as VisualGraph)),
} satisfies Record<string, (graph: Graph) => Graph>;

describe('format support matrix', () => {
  it('covers every published graph format export', () => {
    const ids = FORMAT_SUPPORT_MATRIX.map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'adjacency-list',
        'cytoscape',
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

  it('captures known DOT round-trip limitations', () => {
    const dot = getFormatSupportEntry('dot');

    expect(dot).toBeDefined();
    expect(dot?.features.ports).toBe('partial');
    expect(dot?.features.roundTrip).toBe('partial');
    expect(dot?.notes.join('\n')).toContain('compass');
  });

  it('marks Mermaid state syntax as full round-trip through data metadata', () => {
    const state = getFormatSupportEntry('mermaid/state');

    expect(state).toBeDefined();
    expect(state?.features.roundTrip).toBe('full');
    expect(state?.notes.join('\n')).toContain('data');
  });

  it('marks structured adapters with full port fidelity', () => {
    for (const id of ['cytoscape', 'd3', 'gexf', 'gml', 'graphml', 'jgf']) {
      expect(getFormatSupportEntry(id)?.features.ports).toBe('full');
    }
  });

  it('captures structured hierarchy support accurately', () => {
    for (const id of ['cytoscape', 'gexf', 'gml', 'graphml', 'jgf']) {
      expect(getFormatSupportEntry(id)?.features.hierarchy).toBe('full');
    }
  });

  it('marks lossless metadata adapters as full round-trip', () => {
    for (const id of ['cytoscape', 'd3', 'elk', 'gexf', 'gml', 'jgf', 'xyflow']) {
      expect(getFormatSupportEntry(id)?.features.roundTrip).toBe('full');
    }
  });

  it('has fixture conformance checks for generic full round-trip adapters', () => {
    const genericFullRoundTripIds = FORMAT_SUPPORT_MATRIX.filter(
      (entry) =>
        entry.features.roundTrip === 'full' && !entry.id.startsWith('mermaid/'),
    ).map((entry) => entry.id);

    expect(Object.keys(FULL_ROUND_TRIP_CHECKS).sort()).toEqual(
      genericFullRoundTripIds.sort(),
    );
  });

  it.each(Object.entries(FULL_ROUND_TRIP_CHECKS))(
    '%s full round-trip claim preserves the fully featured fixture',
    (_id, roundTrip) => {
      expectFixtureRoundTrip(roundTrip, ROUND_TRIP_KEYS);
    },
  );
});
