import { describe, expect, it } from 'vitest';
import {
  FORMAT_SUPPORT_MATRIX,
  getFormatSupportEntry,
} from '../../src/format-support';

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

  it('captures known Mermaid state limitations', () => {
    const state = getFormatSupportEntry('mermaid/state');

    expect(state).toBeDefined();
    expect(state?.features.roundTrip).toBe('partial');
    expect(state?.notes.join('\n')).toContain('notes');
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
    for (const id of ['cytoscape', 'd3', 'gexf', 'gml', 'jgf']) {
      expect(getFormatSupportEntry(id)?.features.roundTrip).toBe('full');
    }
  });
});
