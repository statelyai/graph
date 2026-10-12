import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromGraphML, toGraphML } from '../../src/formats/graphml';
import { fromGEXF, toGEXF } from '../../src/formats/gexf';
import { getXMLValidation } from './xml-oracle';

describe('official XML schemas through libxml2', () => {
  it('compiles GraphML 1.0 including normative redefine and XLink imports', async () => {
    const source = '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph edgedefault="directed"><node id="a"/></graph></graphml>';
    const result = await getXMLValidation(source, 'graphml/1.0');
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
  it.each(['1.3', '1.2draft'] as const)('compiles published GEXF %s core/dynamics/viz schemas', async (version) => {
    const ns = version === '1.3' ? 'http://gexf.net/1.3' : 'http://www.gexf.net/1.2draft';
    const source = `<gexf xmlns="${ns}" version="${version === '1.3' ? version : '1.2'}"><graph defaultedgetype="directed"><nodes><node id="a" label="A"/></nodes><edges/></graph></gexf>`;
    const result = await getXMLValidation(source, `gexf/${version}`);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(fromGEXF(source).nodes[0].label).toBe('A');
  });
  it('documents legacy empty GraphML graph ID schema violation independently', async () => {
    const result = await getXMLValidation(toGraphML(createGraph({ nodes: [{ id: 'a' }] })), 'graphml/1.0');
    expect(result.valid).toBe(false);
    expect(result.rawOutput).toContain('NMTOKEN');
  });
  it('documents legacy GEXF graph attributes outside its published schema', async () => {
    const result = await getXMLValidation(toGEXF(createGraph({ nodes: [{ id: 'a' }] })), 'gexf/1.3');
    expect(result.valid).toBe(false);
    expect(result.rawOutput).toContain('not allowed');
  });
  it('rejects undeclared HTML entities even when the convenience parser accepts them', async () => {
    const source = '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph edgedefault="directed"><node id="a"><data key="label">&nbsp;</data></node></graph></graphml>';
    expect(fromGraphML(source).nodes[0].label).toBe('\u00a0');
    const result = await getXMLValidation(source, 'graphml/1.0');
    expect(result.valid).toBe(false);
    expect(result.rawOutput).toContain('Entity');
  });
});

it('validates opt-in GraphML output without silently normalizing IDs or labels', async () => {
  const graph = createGraph({ nodes: [{ id: 'a', parentId: null, initialNodeId: null, label: 'A\rB', ports: [{ name: 'p', data: { control: '\u0001' } }] }, { id: 'b', parentId: null, initialNodeId: null, label: '' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', sourcePort: 'p', label: null, weight: 2 }] });
  const source = toGraphML(graph, { standard: true });
  const result = await getXMLValidation(source, 'graphml/1.0');
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
  expect(fromGraphML(source)).toEqual(graph);
});
it.each(['', 'a b', 'a\nb', 'a\u0001b'])('GraphML standard profile rejects an unrepresentable node ID: %j', (id) => {
  const graph = createGraph({ nodes: [{ id: 'valid' }] });
  graph.nodes[0].id = id;
  expect(() => toGraphML(graph, { standard: true })).toThrow(/NMTOKEN/);
});
it('GraphML standard profile rejects invalid XML characters in visible labels', () => {
  expect(() => toGraphML(createGraph({ nodes: [{ id: 'a', label: 'bad\u0001' }] }), { standard: true })).toThrow(/invalid XML/);
});

it('validates GEXF standard output and preserves Graph-only root fields through a schema-valid description', async () => {
  const graph = createGraph({ id: 'network 🕸️', mode: 'bidirectional', data: { note: '\u0001' }, direction: 'right', style: { color: 'red' }, initialNodeId: 'a',
    nodes: [{ id: 'a', parentId: null, initialNodeId: null, label: null, x: 2, y: 3, width: 20, height: 10, color: 'arbitrary-color', data: 42 }, { id: 'b', parentId: null, initialNodeId: null, label: '' }],
    edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: '', mode: 'bidirectional', weight: 2.5 }] });
  const source = toGEXF(graph, { standard: true });
  const result = await getXMLValidation(source, 'gexf/1.3');
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
  expect(fromGEXF(source, { standard: true })).toEqual(graph);
});
it('retains native descriptions separately from GEXF standard root metadata', async () => {
  const source = '<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><creator>External</creator><description>USER DESCRIPTION</description></meta><graph><nodes><node id="a"/></nodes><edges/></graph></gexf>';
  const graph = fromGEXF(source);
  graph.id = 'graph-only';
  const output = toGEXF(graph, { standard: true });
  const result = await getXMLValidation(output, 'gexf/1.3');
  expect(result.errors).toEqual([]);
  expect(output).toContain('<description>USER DESCRIPTION</description>');
  const imported = fromGEXF(output, { standard: true });
  expect(imported.id).toBe('graph-only');
  expect(imported.data._gexf.meta.description).toBe('USER DESCRIPTION');
});
it('preserves valid standard GEXF core visualization and native edits', async () => {
  const source = '<gexf xmlns="http://gexf.net/1.3" version="1.3"><graph><nodes><node id="a"><position x="2" y="3"/><color r="1" g="2" b="3"/><size value="4"/></node></nodes><edges/></graph></gexf>';
  const result = await getXMLValidation(source, 'gexf/1.3');
  expect(result.errors).toEqual([]);
  expect(fromGEXF(source).nodes[0]).toMatchObject({ x: 2, y: 3, width: 4, height: 4, color: '#010203' });
});

it('validates native GraphML namespace scopes, labels, nested defaults and ports independently', async () => {
  const source = readFileSync(new URL('./fixtures/graphml/cases/scopes-ports.graphml', import.meta.url), 'utf8');
  const validation = await getXMLValidation(source, 'graphml/1.0');
  expect(validation.errors).toEqual([]);
  const graph = fromGraphML(source);
  expect(graph.nodes.find((node) => node.id === 'a')).toMatchObject({ parentId: null, label: 'A α', ports: [{ name: 'p' }, { name: 'child' }] });
  expect(graph.nodes.find((node) => node.id === 'isolated')!.label).toBe('');
  expect(graph.edges.find((edge) => edge.id === 'nestedEdge')).toMatchObject({ sourcePort: 'p', mode: 'undirected' });
  const output = toGraphML(graph, { standard: true });
  const revalidation = await getXMLValidation(output, 'graphml/1.0');
  expect(revalidation.errors).toEqual([]);
});
it('validates native GEXF defaults, weight, mutual direction, scoped declarations and visualization', async () => {
  const source = readFileSync(new URL('./fixtures/gexf/cases/scopes-mutual.gexf', import.meta.url), 'utf8');
  const validation = await getXMLValidation(source, 'gexf/1.3');
  expect(validation.errors).toEqual([]);
  const graph = fromGEXF(source);
  expect(graph.mode).toBe('undirected');
  expect(graph.nodes.find((node) => node.id === 'a')).toMatchObject({ label: 'A α', color: '#010203', x: 2, y: 3 });
  expect(graph.nodes.find((node) => node.id === 'b')!.label).toBe('');
  expect(graph.edges[0]).toMatchObject({ weight: 2.5, mode: 'bidirectional' });
  expect(graph.nodes[0].data._gexf.native).toMatchObject({ alpha: '0.5', z: '4' });
  const output = toGEXF(graph, { standard: true });
  const revalidation = await getXMLValidation(output, 'gexf/1.3');
  expect(revalidation.errors).toEqual([]);
  expect(fromGEXF(output, { standard: true })).toEqual(graph);
});
it('rejects malformed XML, undefined node references and invalid native weight through real validators', async () => {
  const malformed = await getXMLValidation('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph edgedefault="directed"></wrong>', 'graphml/1.0');
  expect(malformed.valid).toBe(false);
  const missing = await getXMLValidation('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph edgedefault="directed"><edge source="missing" target="absent"/></graph></graphml>', 'graphml/1.0');
  expect(missing.valid).toBe(false);
  expect(missing.rawOutput).toContain('key');
  const weight = await getXMLValidation('<gexf xmlns="http://gexf.net/1.3" version="1.3"><graph><nodes><node id="a"/></nodes><edges><edge source="a" target="a" weight="invalid"/></edges></graph></gexf>', 'gexf/1.3');
  expect(weight.valid).toBe(false);
  expect(weight.rawOutput).toContain('weight');
});
it('documents official GEXF1.3 viz-namespace example/schema mismatch without changing the schema', async () => {
  const source = '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3"><graph><nodes><node id="a"><viz:position x="2" y="3"/></node></nodes><edges/></graph></gexf>';
  const validation = await getXMLValidation(source, 'gexf/1.3');
  expect(validation.valid).toBe(false);
  expect(validation.rawOutput).toContain('position');
});
it('GEXF standard root carrier never overrides explicitly edited native root fields', () => {
  const graph = createGraph({ id: 'carrier-id', data: 42, initialNodeId: 'a', nodes: [{ id: 'a' }] });
  const source = toGEXF(graph, { standard: true }).replace('<graph defaultedgetype="directed"', '<graph id="native-id" data="43" initialNodeId="edited" defaultedgetype="undirected"');
  const imported = fromGEXF(source, { standard: true });
  expect(imported).toMatchObject({ id: 'native-id', data: 43, initialNodeId: 'edited', mode: 'undirected' });
});

it('records the published GraphML nested keyref/libxml2 scope ambiguity without duplicate physical IDs', async () => {
  const source = readFileSync(new URL('./fixtures/graphml/cases/nested-keyrefs.graphml', import.meta.url), 'utf8');
  expect(source.match(/<g:node id="a"/g)).toHaveLength(1);
  expect(source.match(/<g:node id="b"/g)).toHaveLength(1);
  const result = await getXMLValidation(source, 'graphml/1.0');
  expect(result.valid).toBe(false);
  expect(result.rawOutput).toContain('More than one match');
  const graph = fromGraphML(source);
  expect(graph.nodes.find((node) => node.id === 'a')!.parentId).toBe('parent');
  expect(graph.edges.find((edge) => edge.id === 'nestedEdge')!.mode).toBe('undirected');
  const flattened = await getXMLValidation(toGraphML(graph, { standard: true }), 'graphml/1.0');
  expect(flattened.errors).toEqual([]);
});
it('rejects supplementary-plane GraphML IDs that the published XSD validator cannot accept', async () => {
  const source = '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><graph edgedefault="directed"><node id="😀"/></graph></graphml>';
  expect((await getXMLValidation(source, 'graphml/1.0')).valid).toBe(false);
  expect(() => toGraphML(createGraph({ nodes: [{ id: '😀' }] }), { standard: true })).toThrow(/NMTOKEN/);
});
it('retains numeric-looking GEXF metadata text through native standard export', async () => {
  const source = '<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description>001</description></meta><graph><nodes/><edges/></graph></gexf>';
  const graph = fromGEXF(source);
  expect(graph.data._gexf.meta.description).toBe('001');
  const output = toGEXF(graph, { standard: true });
  expect(output).toContain('<description>001</description>');
  expect((await getXMLValidation(output, 'gexf/1.3')).valid).toBe(true);
});
it('rejects duplicate GraphML IDs, unresolved endpoints, invalid ports and nonfinite native values explicitly', () => {
  const graph = createGraph({ nodes: [{ id: 'a', ports: [{ name: 'p' }] }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', sourcePort: 'p' }] });
  const duplicate = JSON.parse(JSON.stringify(graph)); duplicate.nodes[1].id = 'a';
  expect(() => toGraphML(duplicate, { standard: true })).toThrow(/duplicate/);
  const unresolved = JSON.parse(JSON.stringify(graph)); unresolved.edges[0].targetId = 'missing';
  expect(() => toGraphML(unresolved, { standard: true })).toThrow(/unresolved/);
  const port = JSON.parse(JSON.stringify(graph)); port.nodes[0].ports[0].name = 'invalid port';
  expect(() => toGraphML(port, { standard: true })).toThrow(/NMTOKEN/);
  graph.edges[0].weight = Number.NaN;
  expect(() => toGraphML(graph, { standard: true })).toThrow(/nonfinite/);
});

it('GEXF standard output preserves native attribute whitespace via numeric references', async () => {
  const graph = createGraph({ nodes: [{ id: 'a\nb', label: '\tNew\nline\r', parentId: null, initialNodeId: null }], edges: [] });
  const source = toGEXF(graph, { standard: true });
  expect(source).toContain('id="a&#10;b"');
  expect((await getXMLValidation(source, 'gexf/1.3')).errors).toEqual([]);
  expect(fromGEXF(source, { standard: true })).toEqual(graph);
});
it('GEXF standard export rejects invalid visible XML characters instead of normalizing them', () => {
  expect(() => toGEXF(createGraph({ nodes: [{ id: 'a', label: 'bad\u0001' }] }), { standard: true })).toThrow(/invalid XML/);
});
it('GEXF standard root metadata rejects reserved-description collisions and ambiguous native carriers', () => {
  const marker = JSON.stringify({ format: '@statelyai/graph/gexf-root', version: 1, root: { id: 'foreign' } }).replace(/"/g, '&quot;');
  const source = `<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description>${marker}</description></meta><graph><nodes/><edges/></graph></gexf>`;
  const graph = fromGEXF(source);
  expect(() => toGEXF(graph, { standard: true })).toThrow(/carrier collision/);
  expect(graph.data._gexf.meta.description).toContain('foreign');
  const ambiguous = source.replace('</meta>', `<description>${marker}</description></meta>`);
  expect(() => fromGEXF(ambiguous, { standard: true })).toThrow(/ambiguous/);
});
it('GEXF carrier interpretation is explicit, preserving malformed marker-shaped descriptions as native text', () => {
  const marker = '{&quot;format&quot;:&quot;@statelyai/graph/gexf-root&quot;,&quot;version&quot;:1,&quot;root&quot;:[]}';
  const source = `<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description>${marker}</description></meta><graph><nodes/><edges/></graph></gexf>`;
  const graph = fromGEXF(source, { standard: true });
  expect(graph.data._gexf.meta.description).toContain('[]');
  expect(graph.id).toBe('');
});
it('GraphML standard output validates nonempty graph IDs, both endpoint ports and BMP Unicode IDs', async () => {
  const graph = createGraph({ id: 'native', nodes: [{ id: 'α', ports: [{ name: 'p' }], label: '' }, { id: '汉字', ports: [{ name: 'q' }] }], edges: [{ id: 'e', sourceId: 'α', targetId: '汉字', sourcePort: 'p', targetPort: 'q' }] });
  const source = toGraphML(graph, { standard: true });
  expect((await getXMLValidation(source, 'graphml/1.0')).errors).toEqual([]);
  expect(fromGraphML(source).edges[0]).toMatchObject({ sourceId: 'α', targetId: '汉字', sourcePort: 'p', targetPort: 'q' });
});

it('preserves an explicit empty GEXF user description beside the standard root carrier', async () => {
  const source = '<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description/></meta><graph><nodes/><edges/></graph></gexf>';
  const graph = fromGEXF(source);
  const output = toGEXF(graph, { standard: true });
  expect((await getXMLValidation(output, 'gexf/1.3')).errors).toEqual([]);
  expect(fromGEXF(output, { standard: true }).data._gexf.meta.description).toBe('');
});
it('reads an explicitly selected GEXF root carrier with a local namespace declaration', async () => {
  const marker = JSON.stringify({ format: '@statelyai/graph/gexf-root', version: 1, root: { id: 'native-metadata-id', initialNodeId: null, data: false } }).replace(/"/g, '&quot;');
  const source = `<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description xmlns:g="http://gexf.net/1.3">${marker}</description></meta><graph><nodes/><edges/></graph></gexf>`;
  expect((await getXMLValidation(source, 'gexf/1.3')).errors).toEqual([]);
  expect(fromGEXF(source, { standard: true })).toMatchObject({ id: 'native-metadata-id', data: false });
  expect(fromGEXF(source).id).toBe('');
});
