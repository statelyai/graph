import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getIGraphOracle } from './igraph-oracle';

function getFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/pajek/${name}.net`, import.meta.url), 'utf8');
}

describe('actual igraph1.0.0 C-backed Pajek reader', () => {
  it('pins reader version, authored fixtures and actual native output bytes', async () => {
    expect((await getIGraphOracle({ operation: 'version' })).version).toBe('1.0.0');
    const directory = new URL('./fixtures/pajek/', import.meta.url);
    const provenance = JSON.parse(readFileSync(new URL('igraph-provenance.json', directory), 'utf8'));
    for (const file of provenance.files) expect(createHash('sha256').update(readFileSync(new URL(file.file, directory))).digest('hex')).toBe(file.sha256);
  });
  it.each(['uniform', 'duplicate-labels', 'comments', 'mixed'])('reproduces captured %s native semantics', async (name) => {
    const native = await getIGraphOracle({ operation: 'pajek', source: getFixture(name) });
    const captured = JSON.parse(readFileSync(new URL(`./fixtures/pajek/${name}.igraph.json`, import.meta.url), 'utf8'));
    expect(native.summary).toEqual(captured.summary);
    expect(native.warnings).toEqual(captured.warnings);
  });
  it('retains independent vertex identity when labels are equal', async () => {
    const native = await getIGraphOracle({ operation: 'pajek', source: getFixture('duplicate-labels') });
    expect(native.summary).toEqual({ directed: false, graph: {}, nodes: [{ id: 0, attributes: { name: 'same' } }, { id: 1, attributes: { name: 'same' } }], edges: [{ source: 0, target: 1, attributes: { weight: 1 } }] });
  });
  it('reads comments without inventing edges and exposes its mixed-mode limitation', async () => {
    const comments = await getIGraphOracle({ operation: 'pajek', source: getFixture('comments') });
    expect(comments.summary!.edges).toEqual([{ source: 0, target: 1, attributes: { weight: 1 } }]);
    const mixed = await getIGraphOracle({ operation: 'pajek', source: getFixture('mixed') });
    expect(mixed.summary!.directed).toBe(false);
    expect(mixed.summary!.edges.map((edge) => [edge.source, edge.target, edge.attributes.weight])).toEqual([[0, 1, 1], [0, 1, 2]]);
  });
  it('rejects out-of-range vertex references in the actual C parser', async () => {
    await expect(getIGraphOracle({ operation: 'pajek', source: '*Vertices 1\n1 "one"\n*Edges\n1 2 1\n' })).rejects.toThrow(/igraph native oracle failed/);
  });
});
