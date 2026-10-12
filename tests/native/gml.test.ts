import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromGML, toGML, gmlDocumentConverter } from '../../src/formats/gml';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getNetworkXOracle } from './networkx-oracle';

describe('GML standard output through actual NetworkX3.7', () => {
  it('pins authored input and the actual independent reader output', () => {
    const provenance = JSON.parse(readFileSync(new URL('./fixtures/gml/provenance.json', import.meta.url), 'utf8'));
    for (const file of provenance.files) expect(createHash('sha256').update(readFileSync(new URL(`./fixtures/gml/${file.file}`, import.meta.url))).digest('hex')).toBe(file.sha256);
  });
  it('uses the exact configured independent reader version', async () => {
    expect((await getNetworkXOracle({ operation: 'version' })).version).toBe('3.7');
  });
  it('parses fresh numeric identity, labels/entities, isolated nodes, weights and Graph data', async () => {
    const graph = createGraph({ id: 'network', data: { custom: 'KEEP' },
      nodes: [{ id: 'a', label: 'A & α "quoted"', data: 42 }, { id: 'b', label: '' }, { id: 'isolated', label: null }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: '', weight: 2.5 }] });
    const native = await getNetworkXOracle({ operation: 'gml', source: toGML(graph, { standard: true }) });
    expect(native.summary).toMatchObject({ directed: true, multigraph: false, graph: { data: '{"custom":"KEEP"}' },
      nodes: [{ id: 0, attributes: { label: 'A & α "quoted"', data: '42' } }, { id: 1 }, { id: 2 }],
      edges: [{ source: 0, target: 1, attributes: { label: '', weight: 2.5 } }] });
    expect(native.summary!.nodes[1].attributes.label).toBe('');
    expect(native.summary!.nodes[2].attributes.label).toBeUndefined();
  });
  it('preserves native missing label presence separately from explicit empty values', async () => {
    const source = readFileSync(new URL('./fixtures/gml/native.gml', import.meta.url), 'utf8');
    const before = await getNetworkXOracle({ operation: 'gml', source });
    expect(before.summary).toEqual(JSON.parse(readFileSync(new URL('./fixtures/gml/native.native.json', import.meta.url), 'utf8')).summary);
    const graph = fromGML(source, { standard: true });
    const after = await getNetworkXOracle({ operation: 'gml', source: toGML(graph, { standard: true }) });
    expect(after.summary!.nodes.map((node) => node.attributes.label)).toEqual(before.summary!.nodes.map((node) => node.attributes.label));
    expect(after.summary!.edges.map((edge) => edge.attributes.label)).toEqual(before.summary!.edges.map((edge) => edge.attributes.label));
    graph.nodes[2].label = 'ADDED';
    expect((await getNetworkXOracle({ operation: 'gml', source: toGML(graph, { standard: true }) })).summary!.nodes[2].attributes.label).toBe('ADDED');
  });
  it('parses parallel edges in the explicit multigraph profile', async () => {
    const graph = createGraph({ mode: 'undirected', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'isolated' }],
      edges: [{ id: 'first', sourceId: 'a', targetId: 'b', weight: 1 }, { id: 'second', sourceId: 'b', targetId: 'a', weight: 2 }] });
    const native = await getNetworkXOracle({ operation: 'gml', source: toGML(graph, { standard: true }) });
    expect(native.summary).toMatchObject({ directed: false, multigraph: true });
    expect(native.summary!.nodes).toHaveLength(3);
    expect(native.summary!.edges.map((edge) => edge.attributes.weight)).toEqual([1, 2]);
  });
  it('accepts the legacy string identity extension but rejects malformed blocks independently', async () => {
    const graph = createGraph({ nodes: [{ id: 'a' }] });
    expect((await getNetworkXOracle({ operation: 'gml', source: toGML(graph) })).summary!.nodes[0].id).toBe('a');
    await expect(getNetworkXOracle({ operation: 'gml', source: 'graph [ node [ id 0 ]' })).rejects.toThrow();
  });
});

it('GML preserves exact CR LF TAB node and edge labels in the independent line reader', async () => {
  const label = 'A\rB\nC\tD';
  const graph = createGraph({ nodes: [{ id: 'a', label }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label }] });
  const native = await getNetworkXOracle({ operation: 'gml', source: toGML(graph, { standard: true }) });
  expect(native.summary!.nodes[0].attributes.label).toBe(label);
  expect(native.summary!.edges[0].attributes.label).toBe(label);
});

it('GML persisted document label edits remain exact in the independent native reader', async () => {
  const source = '# KEEP\ngraph [ directed 1 node [ id 0 label "A&#10;B" ] node [ id 1 ] edge [ id 2 source 0 target 1 label "OLD" ] ]';
  const document = JSON.parse(JSON.stringify(gmlDocumentConverter.from(source)));
  expect(gmlDocumentConverter.to(document)).toBe(source);
  document.graph.nodes[0].label = 'N\rO\nP\tQ';
  document.graph.edges[0].label = 'E\rF\nG\tH';
  const output = gmlDocumentConverter.to(document);
  const native = await getNetworkXOracle({ operation: 'gml', source: output });
  expect(native.summary!.nodes[0].attributes.label).toBe('N\rO\nP\tQ');
  expect(native.summary!.edges[0].attributes.label).toBe('E\rF\nG\tH');
  expect(output).toContain('# KEEP\n');
});
