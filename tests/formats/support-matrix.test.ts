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
    expect(dot?.notes.join('\n')).toContain('Port syntax');
  });

  it('captures known Mermaid state limitations', () => {
    const state = getFormatSupportEntry('mermaid/state');

    expect(state).toBeDefined();
    expect(state?.features.roundTrip).toBe('partial');
    expect(state?.notes.join('\n')).toContain('notes');
  });
});
