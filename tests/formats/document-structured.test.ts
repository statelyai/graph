import { describe, expect, it } from 'vitest';
import { createVisualGraph } from '../../src/graph';
import { cytoscapeDocumentConverter, toCytoscapeJSON } from '../../src/formats/cytoscape';
import { d3DocumentConverter, toD3Graph } from '../../src/formats/d3';
import { elkDocumentConverter, toELK } from '../../src/formats/elk';
import { xyflowDocumentConverter, toXYFlow } from '../../src/formats/xyflow';
import { jgfDocumentConverter, toJGF } from '../../src/formats/jgf';
import { adjacencyListDocumentConverter } from '../../src/formats/adjacency-list';
import { edgeListDocumentConverter } from '../../src/formats/edge-list';
import { tgfDocumentConverter } from '../../src/formats/tgf';

function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const cases: Array<[string, any, any]> = [
  ['cytoscape flat', cytoscapeDocumentConverter, { zoom: 2, elements: [{ data: { id: 'a', label: 'A', __statelyai: { foreign: true } } }, { data: { id: 'e', source: 'a', target: 'b' }, custom: 1 }, { data: { id: 'b' } }] }],
  ['D3', d3DocumentConverter, { data: { __statelyaiNative: { foreign: true } }, nodes: [{ id: 'a', label: 'A', fx: null }], links: [], custom: [1, 2] }],
  ['ELK hyperedge', elkDocumentConverter, { id: 'root', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e', sources: ['a', 'b'], targets: ['c'], custom: 'hyper' }] }],
  ['xyflow', xyflowDocumentConverter, { nodes: [{ id: 'a', position: { x: 1, y: 2 }, data: { label: 'A', __statelyai: { foreign: true } }, selected: true }], edges: [], viewport: { x: 2, y: 3, zoom: 4 } }],
  ['JGF v1', jgfDocumentConverter, { graph: { nodes: [{ id: 'a', label: 'A', metadata: { __statelyai: { foreign: true } } }], edges: [], metadata: { author: 'Ada' } } }],
  ['JGF v2', jgfDocumentConverter, { graph: { id: 'g', nodes: { '10': { label: 'Ten' }, '2': { label: 'Two' } }, edges: [], custom: true } }],
  ['JGF hybrid', jgfDocumentConverter, { graph: { id: '', nodes: [{ id: 'a' }], edges: [], metadata: { data: { legacy: true } } } }],
  ['adjacency', adjacencyListDocumentConverter, { a: ['b', 'b'], b: ['a'], extra: [] }],
  ['edge list', edgeListDocumentConverter, [['a', 'b'], ['a', 'b'], ['b', 'a']]],
  ['TGF', tgfDocumentConverter, '  a\tA\r\nb B\r\n # \r\n a\t b   edge\r\n'],
];

describe('structured native document source preservation', () => {
  it.each(cases)('%s preserves complete native source after JSON persistence', (_name, converter, source) => {
    const document = converter.from(source);
    expect(converter.to(document)).toEqual(source);
    expect(converter.to(getPersisted(document))).toEqual(source);
  });
  it('retains ELK hyperedge source without fabricating a binary Graph', () => {
    const document = elkDocumentConverter.from(cases[2][2]);
    expect(document.graph).toBeNull();
    expect(document.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('strict verified structured native edits', () => {
  it('patches flat Cytoscape labels while retaining interleaved elements and reserved fields', () => {
    const document = getPersisted(cytoscapeDocumentConverter.from(cases[0][2]));
    document.graph!.nodes[0].label = 'Changed';
    (document.source.elements as any[])[0].custom = 'source edit';
    const source: any = cytoscapeDocumentConverter.to(document);
    expect(source.elements.map((element: any) => element.data.id)).toEqual(['a', 'e', 'b']);
    expect(source.elements[0]).toEqual({ data: { id: 'a', label: 'Changed', __statelyai: { foreign: true } }, custom: 'source edit' });
  });
  it('patches D3 label and geometry while retaining fixed/velocity properties', () => {
    const source = { nodes: [{ id: 'a', label: 'Before', x: 1, fx: null, vx: 3, custom: true }], links: [] };
    const document = getPersisted(d3DocumentConverter.from(source));
    document.graph!.nodes[0].label = 'After'; document.graph!.nodes[0].x = 4;
    expect(d3DocumentConverter.to(document)).toEqual({ nodes: [{ id: 'a', label: 'After', x: 4, fx: null, vx: 3, custom: true }], links: [] });
  });
  it('patches native JGF v2 metadata and labels without changing its dictionary shape', () => {
    const source = { graph: { id: 'g', nodes: { a: { label: 'Before', metadata: { __statelyai: { foreign: true }, score: 1 } } }, edges: [], custom: true } };
    const document = getPersisted(jgfDocumentConverter.from(source));
    document.graph!.nodes[0].label = 'After'; document.graph!.nodes[0].data.score = 2;
    expect(jgfDocumentConverter.to(document)).toEqual({ graph: { ...source.graph, nodes: { a: { label: 'After', metadata: { __statelyai: { foreign: true }, score: 2 } } } } });
  });
  it('patches renderer labels and positions without losing viewport or foreign data', () => {
    const document = getPersisted(xyflowDocumentConverter.from(cases[3][2]));
    document.graph!.nodes[0].label = 'After'; document.graph!.nodes[0].x = 9;
    const source: any = xyflowDocumentConverter.to(document);
    expect(source.nodes[0]).toEqual({ id: 'a', position: { x: 9, y: 2 }, data: { label: 'After', __statelyai: { foreign: true } }, selected: true });
    expect(source.viewport).toEqual({ x: 2, y: 3, zoom: 4 });
  });
  it('patches original ELK first section while retaining unknown fields and extra sections', () => {
    const second = { id: 's2', startPoint: { x: 3, y: 4 }, endPoint: { x: 5, y: 6 }, custom: 'keep' };
    const source = { id: 'root', children: [{ id: 'a', labels: [{ text: 'Before', custom: 1 }, { text: 'secondary' }] }, { id: 'b' }], edges: [{ id: 'e', sources: ['a'], targets: ['b'], sections: [{ id: 's1', startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 }, outgoingSections: ['s2'] }, second] }] };
    const document = getPersisted(elkDocumentConverter.from(source));
    document.graph!.nodes[0].label = 'After'; document.graph!.edges[0].points![0].x = 8;
    const result: any = elkDocumentConverter.to(document);
    expect(result.children[0].labels).toEqual([{ text: 'After', custom: 1 }, { text: 'secondary' }]);
    expect(result.edges[0].sections[0]).toMatchObject({ id: 's1', startPoint: { x: 8, y: 2 }, outgoingSections: ['s2'] });
    expect(result.edges[0].sections[1]).toEqual(second);
  });
  it('patches TGF labels while retaining CRLF and native prefix spacing', () => {
    const document = getPersisted(tgfDocumentConverter.from(cases[9][2]));
    document.graph!.nodes[0].label = 'After'; document.graph!.edges[0].label = 'changed';
    expect(tgfDocumentConverter.to(document)).toBe('  a\tAfter\r\nb B\r\n # \r\n a\t b   changed\r\n');
  });
  it.each(cases.filter(([name]) => name !== 'ELK hyperedge'))('%s rejects structural or unrepresentable changes', (_name, converter, source) => {
    const document = getPersisted(converter.from(source));
    document.graph.nodes[0].id = 'replacement';
    expect(() => converter.to(document)).toThrow();
  });
  it.each([[adjacencyListDocumentConverter, { a: [] }], [edgeListDocumentConverter, [['a', 'b']]]] as const)('minimal formats reject label edits', (converter: any, source: any) => {
    const document = getPersisted(converter.from(source)); document.graph.nodes[0].label = 'Unsupported';
    expect(() => converter.to(document)).toThrow();
  });
  it('rejects same-field native and Graph edits instead of picking stale source', () => {
    const document = getPersisted(d3DocumentConverter.from({ nodes: [{ id: 'a', label: 'Before' }], links: [] }));
    document.source.nodes[0].label = 'Source'; document.graph!.nodes[0].label = 'Graph';
    expect(() => d3DocumentConverter.to(document)).toThrow();
  });
  it('keeps native edits authoritative when the Graph projection is untouched', () => {
    const document = getPersisted(d3DocumentConverter.from({ nodes: [{ id: 'a', label: 'Before' }], links: [] }));
    document.source.nodes[0].label = 'Source';
    expect(d3DocumentConverter.to(document).nodes[0].label).toBe('Source');
  });
});


describe('structured document edit boundary', () => {
  it('never silently discards edits to actual xyflow user labels', () => {
    const source = toXYFlow(createVisualGraph({ nodes: [{ id: 'a', label: 'Visible', data: { label: 'user' } }] }));
    const document = getPersisted(xyflowDocumentConverter.from(source));
    expect(document.graph!.nodes[0].data.label).toBe('user');
    document.graph!.nodes[0].data.label = 'changed user';
    const result = xyflowDocumentConverter.getUpdate(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-edit')).toBe(true);
    expect(() => xyflowDocumentConverter.to(document)).toThrow();
  });
  it('patches original primitive ELK geometry without changing native edge representation', () => {
    const source = { id: 'root', children: [{ id: 'a', ports: [{ id: 'p', x: 1, custom: true }] }, { id: 'b' }], edges: [{ id: 'e', source: 'a', sourcePort: 'p', target: 'b', sourcePoint: { x: 1, y: 2 }, targetPoint: { x: 3, y: 4 }, custom: 1 }] };
    const document = getPersisted(elkDocumentConverter.from(source));
    document.graph!.nodes[0].ports![0].x = 9; document.graph!.edges[0].points![0].x = 8;
    const result: any = elkDocumentConverter.to(document);
    expect(result.children[0].ports[0]).toEqual({ id: 'p', x: 9, custom: true });
    expect(result.edges[0]).toMatchObject({ source: 'a', sourcePort: 'p', target: 'b', sourcePoint: { x: 8, y: 2 }, custom: 1 });
    expect(result.edges[0]).not.toHaveProperty('sources');
  });
  it('patches Cytoscape weight, style and user data without overwriting reserved metadata', () => {
    const source = { elements: { nodes: [{ data: { id: 'a', score: 1, __statelyai: { foreign: true } } }, { data: { id: 'b' } }], edges: [{ data: { id: 'e', source: 'a', target: 'b', weight: 2, style: { stroke: 'red' } }, selected: true }] } };
    const document = getPersisted(cytoscapeDocumentConverter.from(source));
    document.graph!.nodes[0].data.score = 3; document.graph!.edges[0].weight = 4; document.graph!.edges[0].style = { stroke: 'blue' };
    const result: any = cytoscapeDocumentConverter.to(document);
    expect(result.elements.nodes[0].data).toEqual({ id: 'a', score: 3, __statelyai: { foreign: true } });
    expect(result.elements.edges[0]).toEqual({ data: { id: 'e', source: 'a', target: 'b', weight: 4, style: { stroke: 'blue' } }, selected: true });
  });
  it('retains source schema and unknown fields while editing JGF directedness and relation', () => {
    const source = { graph: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', source: 'a', target: 'b', relation: 'old', directed: false, metadata: { __statelyai: { foreign: true }, score: 1 } }] } };
    const document = getPersisted(jgfDocumentConverter.from(source));
    document.graph!.edges[0].mode = 'directed'; document.graph!.edges[0].data.relation = 'new';
    const result: any = jgfDocumentConverter.to(document);
    expect(result.graph.edges[0]).toEqual({ ...source.graph.edges[0], relation: 'new', directed: true });
  });
  it('retains valid-looking foreign carrier payloads while editing native D3 labels', () => {
    const data = { __statelyaiNative: { kind: '@statelyai/graph/native', version: 1, format: 'd3', data: 'foreign', native: { nodes: [], links: [] }, baseline: { id: '', mode: 'directed', initialNodeId: null, data: 1, nodes: [], edges: [] } } };
    const source = { data, nodes: [{ id: 'a', label: 'Before' }], links: [] };
    const document = getPersisted(d3DocumentConverter.from(source));
    expect(document.graph!.data).toEqual(data);
    document.graph!.nodes[0].label = 'After';
    expect(d3DocumentConverter.to(document)).toEqual({ ...source, nodes: [{ id: 'a', label: 'After' }] });
  });
});


describe('generated source user-data provenance', () => {
  it.each([
    ['d3', d3DocumentConverter, toD3Graph],
    ['cytoscape', cytoscapeDocumentConverter, toCytoscapeJSON],
    ['elk', elkDocumentConverter, toELK],
    ['xyflow', xyflowDocumentConverter, toXYFlow],
    ['jgf', jgfDocumentConverter, toJGF],
  ] as Array<[string, any, any]>)('%s preserves actual user data that resembles an import carrier', (format, converter, emit) => {
    const data = { __statelyaiNative: { kind: '@statelyai/graph/native', version: 1, format, data: 'foreign', native: { nodes: [], links: [] }, baseline: { id: '', mode: 'directed', initialNodeId: null, data: 1, nodes: [], edges: [] } }, foo: 1 };
    const source = emit(createVisualGraph({ data, nodes: [{ id: 'a', label: 'Before', data }] }));
    const document = getPersisted(converter.from(source));
    expect(document.graph.data).toEqual(data);
    expect(document.graph.nodes[0].data).toEqual(data);
    expect(converter.to(document)).toEqual(source);
    document.graph.nodes[0].label = 'After';
    const result = converter.getUpdate(document);
    expect(result.ok).toBe(true);
    if (result.ok) expect(converter.from(result.source).graph.data).toEqual(data);
  });
});


describe('fresh native structure and requested fields', () => {
  it('retains native node reordering and additions while patching a stable-ID label', () => {
    const document = getPersisted(d3DocumentConverter.from({ nodes: [{ id: 'a', label: 'Before', custom: 1 }, { id: 'b' }], links: [] }));
    document.source.nodes.reverse(); document.source.nodes.push({ id: 'c', custom: 3 });
    document.graph!.nodes[0].label = 'After';
    expect(d3DocumentConverter.to(document)).toEqual({ nodes: [{ id: 'b' }, { id: 'a', label: 'After', custom: 1 }, { id: 'c', custom: 3 }], links: [] });
  });
});


describe('explicit native carrier export override', () => {
  it.each([
    ['d3', d3DocumentConverter, toD3Graph], ['cytoscape', cytoscapeDocumentConverter, toCytoscapeJSON],
    ['elk', elkDocumentConverter, toELK], ['xyflow', xyflowDocumentConverter, toXYFlow], ['jgf', jgfDocumentConverter, toJGF],
  ] as Array<[string, any, any]>)('%s preserves a user payload matching the full carrier discriminator', (format, converter, emit) => {
    const data = { __statelyaiNative: { kind: '@statelyai/graph/native', provenance: 'native-import', version: 1, format, data: 'foreign', native: { nodes: [], links: [] }, baseline: { id: '', mode: 'directed', initialNodeId: null, data: 1, nodes: [], edges: [] } }, foo: 1 };
    const source = emit(createVisualGraph({ data, nodes: [{ id: 'a', label: 'Before', data }] }), { nativeCarrier: false });
    const document = getPersisted(converter.from(source));
    expect(document.graph.data).toEqual(data);
    expect(document.graph.nodes[0].data).toEqual(data);
    expect(converter.to(document)).toEqual(source);
    document.graph.nodes[0].label = 'After';
    expect(converter.getUpdate(document).ok).toBe(true);
  });
});


describe('D3 JSON endpoint identity boundary', () => {
  it.each(['x', 'label'] as const)('rejects %s edits that could leave identity-sensitive embedded endpoints stale', (field) => {
    const a = { id: 'a', x: 1, label: 'Before', foreign: { keep: true } }, b = { id: 'b' };
    const document = getPersisted(d3DocumentConverter.from({ nodes: [a, b], links: [{ source: a, target: b }] }));
    expect(d3DocumentConverter.to(document)).toEqual({ nodes: [a, b], links: [{ source: a, target: b }] });
    if (field === 'x') document.graph!.nodes[0].x = 4; else document.graph!.nodes[0].label = 'After';
    const result = d3DocumentConverter.getUpdate(document);
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.diagnostics[0].code).toBe('unsupported-edit'); expect(result.diagnostics[0].message).toContain('alias identity'); }
    expect(document.source).toEqual({ nodes: [a, b], links: [{ source: a, target: b }] });
  });
  it('patches independent node fields when object endpoints contain only explicit IDs', () => {
    const source = { nodes: [{ id: 'a', label: 'Before' }, { id: 'b' }], links: [{ source: { id: 'a' }, target: { id: 'b' }, custom: 1 }] };
    const document = getPersisted(d3DocumentConverter.from(source)); document.graph!.nodes[0].label = 'After';
    expect(d3DocumentConverter.to(document)).toEqual({ ...source, nodes: [{ id: 'a', label: 'After' }, { id: 'b' }] });
  });
});
