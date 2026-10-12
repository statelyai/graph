import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import { createGraph } from '../../src/graph';
import { toGraphvizJSON, fromGraphvizJSON, type GraphvizJSON } from '../../src/formats/graphviz-json';
import { toDrawio, fromDrawio, createDrawioDocumentConverter } from '../../src/formats/drawio';
import { toPajek, fromPajek, pajekDocumentConverter } from '../../src/formats/pajek';
import { getXMLValidation } from './xml-oracle';
import { getIGraphOracle } from './igraph-oracle';
import { getNetworkXOracle } from './networkx-oracle';
const schemaDirectory = new URL('./fixtures/graphviz/schema/', import.meta.url);
const schema = JSON.parse(readFileSync(new URL('graphviz_json_schema.json', schemaDirectory), 'utf8'));
const validate = new Ajv({ strict: false }).compile(schema);
describe('Graphviz output JSON independent schema/engine', () => {
  it('pins unmodified official schema/license bytes', () => {
    const manifest = JSON.parse(readFileSync(new URL('provenance.json', schemaDirectory), 'utf8'));
    for (const file of manifest.files) expect(createHash('sha256').update(readFileSync(new URL(file.file, schemaDirectory))).digest('hex')).toBe(file.sha256);
  });
  it('validates fresh minimal output without treating JSON as a native Graphviz input', () => {
    const graph = createGraph({ nodes: [{ id: 'group' }, { id: 'a', parentId: 'group', label: '' }, { id: 'isolated', label: null }], edges: [{ id: 'e', sourceId: 'a', targetId: 'isolated', weight: 2.5 }] });
    expect(validate(toGraphvizJSON(graph))).toBe(true);
  });
  it('imports actual current dot_json and rendered json engine output with native topology/attributes intact', async () => {
    const engine = await Graphviz.load();
    for (const profile of ['dot_json', 'json'] as const) {
      const source: GraphvizJSON = JSON.parse(engine.layout('digraph G { a [label="A"]; b; isolated; a -> b [label="E",weight=2.5]; a -> b [weight=3]; }', profile, 'dot'));
      expect(validate(source)).toBe(true);
      const graph = fromGraphvizJSON(source);
      expect(graph.nodes).toHaveLength(3); expect(graph.edges).toHaveLength(2); expect(graph.edges.map((edge) => edge.weight)).toEqual([2.5, 3]);
      expect(toGraphvizJSON(graph)).toEqual(source);
    }
  });
  it('uses actual fdp cluster endpoints while distinguishing dot producer behavior', async () => {
    const engine = await Graphviz.load(), input = 'graph G { subgraph cluster_a {a;b;a--b;} subgraph cluster_b {c;d;c--d;} cluster_a -- cluster_b; }';
    const fdp: GraphvizJSON = JSON.parse(engine.layout(input, 'json', 'fdp'));
    expect(validate(fdp)).toBe(true); expect(fdp.edges!.at(-1)).toMatchObject({ tail: 0, head: 1 });
    const graph = fromGraphvizJSON(fdp); expect(graph.edges.at(-1)).toMatchObject({ sourceId: 'graphviz:cluster:0', targetId: 'graphviz:cluster:1' });
    expect(toGraphvizJSON(graph)).toEqual(fdp);
    const minimal = toGraphvizJSON(graph, { regenerate: true }); expect(validate(minimal)).toBe(true);
    expect(minimal.edges!.at(-1)).toMatchObject({ tail: 0, head: 1 });
    const dot: GraphvizJSON = JSON.parse(engine.layout(input, 'json', 'dot'));
    expect(dot.edges!.at(-1)!.tail).toBeGreaterThanOrEqual(dot._subgraph_cnt);
  });
  it('documents weak upstream unknown-property typing while rejecting malformed known fields', () => {
    const source: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, objects: [{ _gvid: 0, name: 'a', label: 42 }], edges: [] };
    expect(validate(source)).toBe(true); // additionalProperties is nested in properties in the published schema.
    expect(() => fromGraphvizJSON(source)).toThrow(/label must be a string/);
  });
});
describe('fresh draw.io generated-file profile through actual libxml2', () => {
  it('validates fresh UserObject carriers, Unicode, empty labels, reserved IDs, hierarchy and waypoints', async () => {
    const graph = createGraph({ nodes: [{ id: '0', label: 'A\rB\nC\tα', x: 1, y: 2, width: 120, height: 60, data: 42 }, { id: '1', label: '', parentId: '0' }], edges: [{ id: '0', sourceId: '0', targetId: '1', label: null, points: [{ x: 10, y: 20 }] }] });
    const source = toDrawio(graph);
    const result = await getXMLValidation(source, 'drawio'); expect(result.errors).toEqual([]); expect(result.valid).toBe(true);
    expect(fromDrawio(source).nodes[0].label).toBe('A\rB\nC\tα');
  });
  it('keeps selected-page edits schema-valid without changing unselected pages', async () => {
    const source = readFileSync(new URL('./fixtures/drawio/pages-uncompressed.drawio', import.meta.url), 'utf8'), converter = createDrawioDocumentConverter({ pageId: 'first' }), document = converter.from(source);
    document.graph!.nodes.find((node) => node.id === 'b')!.label = 'NEW & <literal>';
    const output = converter.to(document);
    expect(output.slice(output.indexOf('<diagram id="second"'))).toBe(source.slice(source.indexOf('<diagram id="second"')));
    expect((await getXMLValidation(output, 'drawio')).valid).toBe(true);
  });
});
describe('Pajek explicit uniform profile through independent C/Python readers', () => {
  it.each(['directed', 'undirected'] as const)('preserves actual %s topology, duplicate labels, isolates, parallel edges and numeric weights in igraph', async (mode) => {
    const graph = createGraph({ mode, nodes: [{ id: '0', label: 'same' }, { id: '1', label: 'same' }, { id: 'isolated', label: null }], edges: [{ id: 'e', sourceId: '0', targetId: '1', weight: 2.5 }, { id: 'parallel', sourceId: '0', targetId: '1', label: '', weight: 0 }] });
    const source = toPajek(graph), native = await getIGraphOracle({ operation: 'pajek', source });
    expect(native.summary!.directed).toBe(mode === 'directed'); expect(native.summary!.nodes).toHaveLength(3); expect(native.summary!.nodes.slice(0, 2).map((node) => node.attributes.name)).toEqual(['same', 'same']);
    expect(native.summary!.edges.map((edge) => [edge.source, edge.target, edge.attributes.weight])).toEqual([[0, 1, 2.5], [0, 1, 0]]);
    expect(fromPajek(source).nodes.map((node) => node.label)).toEqual(['same', 'same', null]);
  });
  it('passes the NetworkX unique-label subset without asking it to certify duplicate identity', async () => {
    const source = toPajek(createGraph({ nodes: [{ id: 'a', label: 'A α' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 2.5, label: 'EDGE' }] }));
    const native = await getNetworkXOracle({ operation: 'pajek', source });
    expect(native.summary!.nodes.map((node) => node.id)).toEqual(['A α', 'B']); expect(native.summary!.edges[0].attributes).toMatchObject({ weight: 2.5, l: 'EDGE' });
  });
  it('patches persisted literal labels without changing actual native topology', async () => {
    const source = toPajek(createGraph({ nodes: [{ id: 'a', label: null }, { id: 'b', label: '' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 1 }] }));
    const document = JSON.parse(JSON.stringify(pajekDocumentConverter.from(source))); document.graph.nodes[0].label = 'NEW α'; document.graph.edges[0].label = 'EDGE';
    const native = await getIGraphOracle({ operation: 'pajek', source: pajekDocumentConverter.to(document) });
    expect(native.summary!.nodes[0].attributes.name).toBe('NEW α'); expect(native.summary!.edges[0]).toMatchObject({ source: 0, target: 1, attributes: { label: 'EDGE', weight: 1 } });
  });
});
