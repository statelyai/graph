import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromNetworkXNodeLink, toNetworkXNodeLink, networkxDocumentConverter, type NetworkXNodeLinkJSON } from '../../src/formats/networkx';
import { getNetworkXOracle } from './networkx-oracle';
import { getCarrierData } from '../../src/formats/preservation';

function getFixture(name: string): NetworkXNodeLinkJSON {
  return JSON.parse(readFileSync(new URL(`./fixtures/networkx/${name}.json`, import.meta.url), 'utf8'));
}

describe('NetworkX3.7 actual Python node-link oracle', () => {
  it('pins the authored fixture and actual Python output bytes', () => {
    const provenance = JSON.parse(readFileSync(new URL('./fixtures/networkx/provenance.json', import.meta.url), 'utf8'));
    for (const file of provenance.files) expect(createHash('sha256').update(readFileSync(new URL(`./fixtures/networkx/${file.file}`, import.meta.url))).digest('hex')).toBe(file.sha256);
  });
  it('reads freshly emitted rich directed multigraph data', async () => {
    const graph = createGraph({ id: 'G', data: { root: [null, true] }, nodes: [
      { id: 'a', label: 'A & α', data: { custom: { keep: 1 } } }, { id: 'b', label: '' }, { id: 'alone', label: null }],
      edges: [{ id: 'first', sourceId: 'a', targetId: 'b', weight: 2.5 }, { id: 'parallel', sourceId: 'a', targetId: 'b', label: 'second' }, { id: 'loop', sourceId: 'a', targetId: 'a', weight: 0 }] });
    const emitted = toNetworkXNodeLink(graph);
    const native = await getNetworkXOracle({ operation: 'node-link', data: emitted });
    expect(native.summary).toMatchObject({ directed: true, multigraph: true, nodes: [
      { id: 'a', attributes: { label: 'A & α' } }, { id: 'b', attributes: { label: '' } }, { id: 'alone' }],
      edges: [{ source: 'a', target: 'b', key: 'first', attributes: { weight: 2.5 } }, { source: 'a', target: 'b', key: 'parallel' }, { source: 'a', target: 'a', key: 'loop', attributes: { weight: 0 } }] });
    const restored = fromNetworkXNodeLink(native.roundTrip as unknown as NetworkXNodeLinkJSON);
    expect({ ...restored, data: getCarrierData(restored.data, 'networkx') }).toEqual(graph);
  });
  it.each(['multidigraph', 'simple-links'])('preserves authored %s native IDs, attributes and endpoint-scoped keys', async (name) => {
    const fixture = getFixture(name);
    const edgeKey = fixture.links ? 'links' : 'edges';
    const before = await getNetworkXOracle({ operation: 'node-link', data: fixture, options: { edges: edgeKey } });
    const captured = JSON.parse(readFileSync(new URL(`./fixtures/networkx/${name}.native.json`, import.meta.url), 'utf8'));
    expect(before.summary).toEqual(captured.summary);
    expect(before.roundTrip).toEqual(captured.roundTrip);
    const projected = fromNetworkXNodeLink(fixture);
    expect(projected.nodes).toHaveLength(fixture.nodes.length);
    expect(projected.edges).toHaveLength((fixture[edgeKey])!.length);
    const after = await getNetworkXOracle({ operation: 'node-link', data: toNetworkXNodeLink(projected, { edgeKey }), options: { edges: edgeKey } });
    expect(after.summary).toEqual(before.summary);
    const document = JSON.parse(JSON.stringify(networkxDocumentConverter.from(fixture)));
    expect(networkxDocumentConverter.to(document)).toEqual(fixture);
  });
  it('keeps reverse endpoint pairs distinct only in directed graphs and retains loops', async () => {
    const fixture: NetworkXNodeLinkJSON = { directed: true, multigraph: true, graph: {}, nodes: [{ id: 'a' }, { id: 'b' }], edges: [
      { source: 'a', target: 'b', key: 0 }, { source: 'b', target: 'a', key: 0 }, { source: 'a', target: 'a', key: 0 }] };
    expect((await getNetworkXOracle({ operation: 'node-link', data: fixture })).summary!.edges).toHaveLength(3);
    expect(fromNetworkXNodeLink(fixture).edges).toHaveLength(3);
    const undirected = { ...fixture, directed: false };
    expect((await getNetworkXOracle({ operation: 'node-link', data: undirected })).summary!.edges).toHaveLength(2);
    expect(() => fromNetworkXNodeLink(undirected)).toThrow(/duplicate/);
  });
  it('rejects Python-equivalent bool/numeric duplicate nodes rather than silently merging', async () => {
    const fixture: NetworkXNodeLinkJSON = { directed: false, multigraph: true, graph: {}, nodes: [{ id: true, first: 1 }, { id: 1, second: 2 }], edges: [] };
    const native = await getNetworkXOracle({ operation: 'node-link', data: fixture });
    expect(native.summary!.nodes).toEqual([{ id: true, attributes: { first: 1, second: 2 } }]);
    expect(() => fromNetworkXNodeLink(fixture)).toThrow(/Python-equivalent/);
  });
  it('rejects equivalent multigraph keys which native Python merges', async () => {
    const fixture: NetworkXNodeLinkJSON = { directed: true, multigraph: true, graph: {}, nodes: [{ id: 'a' }, { id: 'b' }], edges: [
      { source: 'a', target: 'b', key: false, weight: 1 }, { source: 'a', target: 'b', key: 0, weight: 2 }] };
    expect((await getNetworkXOracle({ operation: 'node-link', data: fixture })).summary!.edges).toEqual([{ source: 'a', target: 'b', key: false, attributes: { weight: 2 } }]);
    expect(() => fromNetworkXNodeLink(fixture)).toThrow(/duplicate/);
  });
  it('uses native missing-key allocation including collisions and per-pair dictionaries', async () => {
    const fixture: NetworkXNodeLinkJSON = { directed: false, multigraph: true, graph: {}, nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [
      { source: 'a', target: 'b', key: 1 }, { source: 'b', target: 'a' }, { source: 'a', target: 'c' }] };
    const native = await getNetworkXOracle({ operation: 'node-link', data: fixture });
    expect(native.summary!.edges.map((edge) => edge.key)).toEqual([1, 2, 0]);
    const emitted = toNetworkXNodeLink(fromNetworkXNodeLink(fixture));
    expect((await getNetworkXOracle({ operation: 'node-link', data: emitted })).summary).toEqual(native.summary);
  });
});
