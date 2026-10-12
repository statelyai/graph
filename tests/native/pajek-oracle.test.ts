import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getNetworkXOracle } from './networkx-oracle';

describe('Pajek future-adapter independent reader boundary', () => {
  it('pins the uniform fixture and native output; reads labels, coordinates, parallel arcs and weights', async () => {
    const directory = new URL('./fixtures/pajek/', import.meta.url);
    const provenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
    for (const file of provenance.files) expect(createHash('sha256').update(readFileSync(new URL(file.file, directory))).digest('hex')).toBe(file.sha256);
    const source = readFileSync(new URL('uniform.net', directory), 'utf8');
    const native = await getNetworkXOracle({ operation: 'pajek', source });
    const captured = JSON.parse(readFileSync(new URL('uniform.native.json', directory), 'utf8'));
    expect(native.summary).toEqual(captured.summary);
    expect(native.summary).toMatchObject({ directed: true, multigraph: true, graph: { name: 'Native fixture' },
      nodes: [{ id: 'Alpha & α', attributes: { id: '1', x: 0.1, y: 0.2, shape: 'ellipse', ic: 'Red' } }, { id: '', attributes: { id: '2' } }, { id: 'isolated' }],
      edges: [{ source: 'Alpha & α', target: '', attributes: { weight: 2.5, l: 'edge' } }, { attributes: { weight: -3 } }, { source: 'Alpha & α', target: 'Alpha & α', attributes: { weight: 0 } }] });
  });
  it('shows why NetworkX alone cannot certify distinct native vertices sharing a label', async () => {
    const native = await getNetworkXOracle({ operation: 'pajek', source: '*Vertices 2\n1 "same"\n2 "same"\n*Edges\n1 2 1\n' });
    expect(native.summary!.nodes).toEqual([{ id: 'same', attributes: { id: '2' } }]);
    expect(native.summary!.edges).toEqual([{ source: 'same', target: 'same', key: 0, attributes: { weight: 1 } }]);
  });
});
