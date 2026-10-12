import { getUserData } from '../../src/formats/xml-preservation';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromDrawio, toDrawio, drawioDocumentConverter, createDrawioDocumentConverter } from '../../src/formats/drawio';
import { getCarrierData } from '../../src/formats/preservation';
const fixture = (name: string) => readFileSync(new URL(`../native/fixtures/drawio/${name}`, import.meta.url), 'utf8');
function getGraph(graph: ReturnType<typeof fromDrawio>) { return { ...graph, data: getCarrierData(graph.data, 'drawio') }; }
const single = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="OLD" vertex="1" parent="1" style="html=0;"/><mxCell id="b" vertex="1" parent="1"/><mxCell id="e" value="EDGE" edge="1" source="a" target="b" parent="1" style="endArrow=none;"><mxGeometry relative="1" x="0.5" y="-20" as="geometry"/></mxCell></root></mxGraphModel>';
describe('draw.io selected-page XML', () => {
  it.each([false, true])('preserves selected Graph fields with compressed=%s and reserved-ID collisions', (compressed) => {
    const graph = createGraph({ id: '', mode: 'undirected', data: { stately: 'USER', __statelyaiNative: { user: true } }, nodes: [{ id: '0', label: null, data: 42, x: 1, y: 2, width: 3, height: 4 }, { id: '1', parentId: '0', label: '', style: { rounded: true } }], edges: [{ id: '0', sourceId: '0', targetId: '1', label: 'A\rB\nC\tD', weight: 2.5, points: [{ x: 10, y: 20 }], data: [null, false] }] });
    const source = toDrawio(graph, { compressed });
    expect(getGraph(fromDrawio(source))).toEqual(graph);
    expect(toDrawio(JSON.parse(JSON.stringify(fromDrawio(source))))).toBe(source);
  });
  it.each(['pages-uncompressed.drawio', 'pages-compressed.drawio'])('requires explicit page selection and preserves all %s source', (name) => {
    const source = fixture(name);
    expect(() => fromDrawio(source)).toThrow(/pageId/);
    expect(drawioDocumentConverter.from(source).graph).toBeNull();
    expect(drawioDocumentConverter.to(JSON.parse(JSON.stringify(drawioDocumentConverter.from(source))))).toBe(source);
    const converter = createDrawioDocumentConverter({ pageId: 'first' }), document = converter.from(source);
    expect(document.graph!.nodes).toHaveLength(3);
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
    expect(fromDrawio(source, { pageId: 'second' }).nodes).toHaveLength(1);
  });
  it('retains layers, raw HTML/custom attributes, grouped geometry and relative edge label offsets', () => {
    const graph = fromDrawio(fixture('pages-uncompressed.drawio'), { pageId: 'first' });
    expect(graph.nodes.map((node) => node.id)).toEqual(['group', 'a', 'b']);
    expect(graph.nodes[1]).toMatchObject({ parentId: 'group', label: '<b>Alpha &amp; α</b>', x: 20, y: 30, data: { user: { vendor: 'KEEP', count: '007' } } });
    expect(graph.edges[0].x).toBeUndefined();
    expect(graph.edges[0].data.labelGeometry).toMatchObject({ x: '0.5', y: '-12', relative: '1' });
    expect(graph.edges[0].points).toEqual([{ x: 250, y: 140 }, { x: 400, y: 140 }]);
  });
  it('defaults to directed mode without inferring decorative arrowheads', () => {
    expect(fromDrawio(single).mode).toBe('directed');
    expect(fromDrawio(single).edges[0].mode).toBe('directed');
    expect(fromDrawio(single, { mode: 'infer-arrows' }).edges[0].mode).toBe('undirected');
    expect(fromDrawio(single, { mode: 'undirected' }).mode).toBe('undirected');
    const backward = single.replace('endArrow=none;', 'startArrow=classic;endArrow=none;');
    expect(fromDrawio(backward, { mode: 'infer-arrows' }).edges[0]).toMatchObject({ sourceId: 'b', targetId: 'a', mode: 'directed' });
  });
  it('patches labels and independent source comments/vendor changes after persistence', () => {
    const document = JSON.parse(JSON.stringify(drawioDocumentConverter.from(single)));
    document.source = document.source.replace('OLD', 'OLD').replace('<root>', '<root><!-- native -->').replace('vertex="1" parent="1" style="html=0;"', 'vertex="1" parent="1" style="html=0;" vendor="KEEP"');
    document.graph.nodes[0].label = 'NEW & <literal>\n'; document.graph.edges[0].label = '';
    const source = drawioDocumentConverter.to(document);
    expect(source).toContain('<!-- native -->'); expect(source).toContain('vendor="KEEP"');
    expect(source).toContain('value="NEW &amp; &lt;literal&gt;&#10;"'); expect(source).toContain('id="e" value=""');
  });
  it('patches only the selected compressed page payload', () => {
    const source = fixture('pages-compressed.drawio'), converter = createDrawioDocumentConverter({ pageId: 'first' }), document = converter.from(source);
    document.graph!.nodes.find((node) => node.id === 'b')!.label = 'SELECTED';
    const output = converter.to(document);
    expect(output.slice(output.indexOf('<diagram id="second"'))).toBe(source.slice(source.indexOf('<diagram id="second"')));
    expect(fromDrawio(output, { pageId: 'first' }).nodes.find((node) => node.id === 'b')!.label).toBe('SELECTED');
  });
  it('keeps native field edits authoritative over private metadata', () => {
    const source = toDrawio(createGraph({ nodes: [{ id: 'a', label: null }] }));
    const edited = source.replace('<UserObject stately=', '<UserObject label="" stately=');
    expect(fromDrawio(edited).nodes[0].label).toBe('');
    const doc = drawioDocumentConverter.from(single); doc.source = single.replace('value="OLD"', 'value=""'); doc.graph!.nodes[0].label = 'GRAPH';
    expect(() => drawioDocumentConverter.to(doc)).toThrow(/conflict/);
  });
  it('rejects invalid XML label edits and ambiguous HTML/placeholder labels', () => {
    for (const label of ['A\u0000B', '\ud800']) { const doc = drawioDocumentConverter.from(single); doc.graph!.nodes[0].label = label; expect(() => drawioDocumentConverter.to(doc)).toThrow(/invalid-native-label/); }
    for (const source of [single.replace('html=0;', 'html=1;'), single.replace('value="OLD"', 'value="OLD" placeholders="1"')]) { const doc = drawioDocumentConverter.from(source); doc.graph!.nodes[0].label = 'GRAPH'; expect(() => drawioDocumentConverter.to(doc)).toThrow(/ambiguous/); }
  });
  it('ignores fake cell identities inside comments/CDATA/vendor subtrees', () => {
    const source = single.replace('<root>', '<root><!-- <mxCell id="a" value="FAKE"/> --><![CDATA[<mxCell id="a"/>]]><vendor xmlns="urn:vendor"><mxCell id="a"/></vendor>');
    const doc = drawioDocumentConverter.from(source); doc.graph!.nodes[0].label = 'REAL';
    expect(drawioDocumentConverter.to(doc)).toContain('id="a" value="REAL"');
  });
  it.each([single.replace('id="b"', 'id="a"'), single.replace('target="b"', 'target="missing"'), single.replace('id="a" value="OLD"', 'id="a" value="&nbsp;"'), single.replace('parent="1" style="html=0;"', 'parent="a" style="html=0;"'), '<mxGraphModel>'])('rejects unsupported or malformed topology/identity/XML', (source) => {
    expect(() => fromDrawio(source)).toThrow();
    expect(drawioDocumentConverter.from(source).graph).toBeNull();
  });
});

it('retains primitive user data alongside independently added native UserObject attributes', () => {
  const document = drawioDocumentConverter.from(toDrawio(createGraph({ nodes: [{ id: 'a', label: 'OLD', data: 42 }] })));
  document.source = document.source.replace('label="OLD"', 'label="OLD" vendor="KEEP"'); document.graph!.nodes[0].label = 'NEW';
  const graph = fromDrawio(drawioDocumentConverter.to(document));
  expect(graph.nodes[0].label).toBe('NEW'); expect(getUserData(graph.nodes[0].data, 'drawio')).toBe(42);
  expect(graph.nodes[0].data._drawio.native.user.vendor).toBe('KEEP');
});
it('patches 10,000 literal labels with verified non-overlapping spans', () => {
  const graph = createGraph({ nodes: Array.from({ length: 10000 }, (_, index) => ({ id: String(index), label: 'OLD' })) });
  const document = drawioDocumentConverter.from(toDrawio(graph));
  for (const node of document.graph!.nodes) node.label = 'NEW';
  const output = drawioDocumentConverter.to(document), restored = fromDrawio(output);
  expect(restored.nodes).toHaveLength(10000); expect(restored.nodes.every((node) => node.label === 'NEW')).toBe(true);
}, 30000);
