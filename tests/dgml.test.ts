import { expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { fromDGML, toDGML, dgmlDocumentConverter } from '../src/formats/dgml';
const ns = 'http://schemas.microsoft.com/vs/2009/dgml';
const source = `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="g" Group="Expanded"/><Node Id="a" Label="" Category="Thing" Count="2"/></Nodes><Links><Link Source="g" Target="a" Category="Contains"/><Link Source="a" Target="implicit" Label="Go"/><Link Source="a" Target="a"/></Links><Categories><Category Id="Thing"/></Categories><Properties><Property Id="Count" DataType="System.Int32"/></Properties></DirectedGraph>`;
it('maps categories, typed properties, containment and inferred endpoints distinctly', () => {
  const graph = fromDGML(source);
  expect(
    graph.nodes.map((n) => [n.id, n.label, n.parentId, n.data.declared])
  ).toEqual([
    ['g', 'g', null, true],
    ['a', '', 'g', true],
    ['implicit', 'implicit', null, false],
  ]);
  expect(graph.nodes[1].data.properties).toEqual({ Count: 2 });
  expect(graph.edges).toHaveLength(2);
  expect(toDGML(JSON.parse(JSON.stringify(graph)))).toBe(source);
});
it('retains comment/namespace/unknown XML on strict document label and property edits', () => {
  const xml = source
    .replace('<Nodes>', '<!-- retained --><Nodes>')
    .replace(
      'Category="Thing" Count=',
      'Category="Thing" Custom="opaque" Count='
    );
  const doc = dgmlDocumentConverter.from(xml);
  expect(dgmlDocumentConverter.to(JSON.parse(JSON.stringify(doc)))).toBe(xml);
  doc.graph!.nodes[1].label = '東京 " &\r\n';
  doc.graph!.nodes[1].data.properties!.Count = 3;
  const patched = dgmlDocumentConverter.to(doc);
  expect(patched).toContain('<!-- retained -->');
  expect(patched).toContain('Custom="opaque"');
  expect(fromDGML(patched).nodes[1]).toMatchObject({
    label: '東京 " &\r\n',
    data: { properties: { Count: 3 } },
  });
});
it('rejects implicit label and structural edits', () => {
  const doc = dgmlDocumentConverter.from(source);
  doc.graph!.nodes[2].label = 'Changed';
  expect(() => dgmlDocumentConverter.to(doc)).toThrow(/implicit/);
  const other = dgmlDocumentConverter.from(source);
  other.graph!.edges.pop();
  expect(() => dgmlDocumentConverter.to(other)).toThrow();
});
it('fresh output emits valid native declarations without silently losing Graph fields', () => {
  const graph = createGraph({
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', parentId: 'a', label: 'B' },
    ],
    edges: [{ id: 'e', sourceId: 'b', targetId: 'b', label: 'Loop' }],
  });
  const parsed = fromDGML(toDGML(graph, { edgeIds: 'positional' }));
  expect(parsed.nodes[1].parentId).toBe('a');
  expect(parsed.edges[0].label).toBe('Loop');
  graph.edges[0].mode = 'undirected';
  expect(() => toDGML(graph, { nativeCarrier: false })).toThrow(/directed/);
});
it.each(['<Node Id="a"/><Node Id="a"/>', '<Node Id="a" Group="Invalid"/>'])(
  'rejects malformed/duplicate node declaration %s',
  (nodes) =>
    expect(() =>
      fromDGML(
        `<DirectedGraph xmlns="${ns}"><Nodes>${nodes}</Nodes></DirectedGraph>`
      )
    ).toThrow()
);
it('rejects cycles/multiple containment and invalid property types', () => {
  for (const links of [
    '<Link Source="a" Target="b" Category="Contains"/><Link Source="b" Target="a" Category="Contains"/>',
    '<Link Source="a" Target="c" Category="Contains"/><Link Source="b" Target="c" Category="Contains"/>',
  ])
    expect(() =>
      fromDGML(
        `<DirectedGraph xmlns="${ns}"><Links>${links}</Links></DirectedGraph>`
      )
    ).toThrow(/containment/);
  expect(() => fromDGML(source.replace('Count="2"', 'Count="heavy"'))).toThrow(
    /property/
  );
});

it('requires explicit positional link identity loss, accounting for Contains link indices', () => {
  const graph = createGraph({
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', parentId: 'a' },
    ],
    edges: [{ id: 'custom', sourceId: 'a', targetId: 'b' }],
  });
  expect(() => toDGML(graph)).toThrow(/positional/);
  const projected = fromDGML(toDGML(graph, { edgeIds: 'positional' }));
  expect(projected.edges[0].id).toBe('dgml_link_1');
  graph.edges[0].id = 'dgml_link_1';
  expect(fromDGML(toDGML(graph)).edges[0].id).toBe('dgml_link_1');
});
it('retains exact signed Int64 lexical values and rejects out-of-range magnitudes', () => {
  const xml = source
    .replace('Count="2"', 'Count="9223372036854775807"')
    .replace('System.Int32', 'System.Int64');
  const graph = fromDGML(xml);
  expect(graph.nodes[1].data.properties!.Count).toBe('9223372036854775807');
  const doc = dgmlDocumentConverter.from(xml);
  doc.graph!.nodes[1].data.properties!.Count = '-9223372036854775808';
  expect(
    fromDGML(dgmlDocumentConverter.to(doc)).nodes[1].data.properties!.Count
  ).toBe('-9223372036854775808');
  expect(() =>
    fromDGML(xml.replace('9223372036854775807', '9223372036854775808'))
  ).toThrow(/range/);
});
it('does not project namespace-shadowed or nested foreign Node/Link lookalikes', () => {
  const xml = `<d:DirectedGraph xmlns:d="${ns}"><d:Nodes><d:Node Id="a"/><d:Node xmlns:d="urn:foreign" Id="ignored"/></d:Nodes><Extension xmlns="urn:vendor"><Node Id="fake"/><Link Source="fake" Target="fake"/></Extension></d:DirectedGraph>`;
  expect(fromDGML(xml).nodes.map((n) => n.id)).toEqual(['a']);
});
it.each([
  { vendor: 42 },
  { attributes: { xmlns: 'bad' } },
  { attributes: { 'bad key': 'value' } },
  { attributes: { 'v:unbound': 'value' } },
])('rejects unrepresentable fresh root data %j', (data) => {
  const graph = createGraph({ data, nodes: [{ id: 'a', label: 'A' }] });
  expect(() => toDGML(graph as any)).toThrow();
});
it('recognizes Contains membership supplied as native child Category', () => {
  const xml = `<DirectedGraph xmlns="${ns}"><Links><Link Source="p" Target="c" Category="Other"><Category Ref="Contains"/></Link></Links></DirectedGraph>`;
  const graph = fromDGML(xml);
  expect(graph.nodes[1].parentId).toBe('p');
  expect(graph.edges).toEqual([]);
});

it('native labels stay authoritative over stale carrier-backed Graph fields', () => {
  const graph = fromDGML(source);
  (graph.data as any).__statelyaiNative.native = source.replace(
    'Label=""',
    'Label="Native"'
  );
  expect(fromDGML(toDGML(graph)).nodes[1].label).toBe('Native');
  graph.nodes[1].label = 'Graph';
  expect(() => toDGML(graph)).toThrow(/conflict/);
});
it('rejects unrepresentable node/edge data and protected property names on fresh export', () => {
  const graph = createGraph({
    nodes: [{ id: 'a', label: 'A', data: { vendor: 42 } }],
  });
  expect(() => toDGML(graph as any)).toThrow(/data key/);
});
it('retains source edits to opaque native fields independently of requested label edits', () => {
  const doc = dgmlDocumentConverter.from(source);
  doc.source = source.replace(
    'Category="Thing" Count=',
    'Category="Thing" Extra="native" Count='
  );
  doc.graph!.nodes[1].label = 'Graph';
  const out = dgmlDocumentConverter.to(doc);
  expect(out).toContain('Extra="native"');
  expect(fromDGML(out).nodes[1].label).toBe('Graph');
});
it('handles 10k declared topology and bulk label edits iteratively', () => {
  const xml = `<DirectedGraph xmlns="${ns}"><Nodes>${Array.from(
    { length: 10000 },
    (_, i) => `<Node Id="n${i}" Label="Before"/>`
  ).join('')}</Nodes></DirectedGraph>`;
  const document = dgmlDocumentConverter.from(xml);
  for (const node of document.graph!.nodes) node.label = `After ${node.id}`;
  const out = dgmlDocumentConverter.to(document);
  const graph = fromDGML(out);
  expect(graph.nodes).toHaveLength(10000);
  expect(graph.nodes[9999].label).toBe('After n9999');
}, 30000);

it.each([
  ['System.String', '', ''],
  ['System.Boolean', 'TRUE', true],
  ['System.Boolean', 'false', false],
  ['System.Int32', '-2147483648', -2147483648],
  ['System.Int64', '-9223372036854775808', '-9223372036854775808'],
  ['System.Double', '2.5e2', 250],
] as Array<[string, string, any]>)(
  'maps explicit CLR %s property values exactly (%s)',
  (type, value, expected) => {
    const xml = source
      .replace('Count="2"', `Count="${value}"`)
      .replace('System.Int32', type);
    expect(fromDGML(xml).nodes[1].data.properties!.Count).toEqual(expected);
  }
);
it('keeps unsupported and untyped declared property values as lexical strings', () => {
  const xml = `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a" Background="#fff" Bounds="1,2,3,4"/></Nodes><Properties><Property Id="Background" DataType="System.Windows.Media.Brush"/><Property Id="Bounds"/></Properties></DirectedGraph>`;
  const graph = fromDGML(xml);
  expect(graph.nodes[0].data.properties).toEqual({
    Background: '#fff',
    Bounds: '1,2,3,4',
  });
  expect(toDGML(graph)).toBe(xml);
});
it.each([
  '<Wrong/>',
  '<DirectedGraph/>',
  `<DirectedGraph xmlns="${ns}"><Nodes/><Nodes/></DirectedGraph>`,
  `<DirectedGraph xmlns="${ns}"><Nodes><Node/></Nodes></DirectedGraph>`,
  `<DirectedGraph xmlns="${ns}"><Links><Link Source="a"/></Links></DirectedGraph>`,
  `<DirectedGraph xmlns="${ns}"><Properties><Property Id="X"/><Property Id="X"/></Properties></DirectedGraph>`,
  `<!DOCTYPE DirectedGraph><DirectedGraph xmlns="${ns}"/>`,
])('rejects malformed/scoped XML %#', (xml) =>
  expect(() => fromDGML(xml)).toThrow()
);
it('allows literal Unicode/empty identities, declared group modes and XML-safe escaping', () => {
  const graph = createGraph({ nodes: [{ id: 'valid', label: '' }] });
  graph.nodes[0].id = '';
  const parsed = fromDGML(toDGML(graph));
  expect(parsed.nodes[0].id).toBe('');
  expect(parsed.nodes[0].label).toBe('');
  for (const label of ['bad\u0000', 'bad\ud800']) {
    graph.nodes[0].label = label;
    expect(() => toDGML(graph)).toThrow(/XML/);
  }
  graph.nodes[0].id = '東京 & "';
  graph.nodes[0].label = '😀';
  expect(fromDGML(toDGML(graph)).nodes[0].id).toBe(graph.nodes[0].id);
});
it('rejects unsupported typed property mutations, null labels and metadata-baseline tampering', () => {
  for (const edit of [
    (g: any) => (g.nodes[1].data.properties.Count = '2'),
    (g: any) => delete g.nodes[1].data.properties.Count,
    (g: any) => (g.nodes[1].data.attributes.Custom = 'added'),
    (g: any) => (g.nodes[1].label = null),
  ]) {
    const doc = dgmlDocumentConverter.from(source);
    edit(doc.graph);
    expect(() => dgmlDocumentConverter.to(doc)).toThrow();
  }
  const graph = fromDGML(source);
  (graph.data as any).__statelyaiNative.baseline.nodes[0].label = 'Forged';
  expect(() => toDGML(graph)).toThrow(/provenance/);
});

it('uses native XML attribute normalization while preserving character references', () => {
  const xml = `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a" Label="A\r\nB\tC&#10;D&#13;E"/></Nodes></DirectedGraph>`;
  expect(fromDGML(xml).nodes[0].label).toBe('A B C\nD\rE');
  expect(toDGML(fromDGML(xml))).toBe(xml);
});
it.each(['&nbsp;', '&#0;', '&#55296;', '&#1114112;'])(
  'rejects invalid XML label references: %s',
  (label) => {
    expect(() =>
      fromDGML(
        `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a" Label="${label}"/></Nodes></DirectedGraph>`
      )
    ).toThrow();
  }
);

it('does not convert an ordinary edge into containment or overwrite mapped fields with property values', () => {
  const graph = createGraph({
    data: { properties: [{ Id: 'Label', DataType: 'System.String' }] },
    nodes: [
      { id: 'a', label: 'A', data: { properties: { Label: 'Hidden' } } },
      { id: 'b', label: 'B' },
    ],
    edges: [{ id: 'dgml_link_0', sourceId: 'a', targetId: 'b' }],
  });
  expect(() => toDGML(graph)).toThrow(/protected/);
  (graph.nodes[0].data as any) = {};
  graph.edges[0].data = { categories: ['Contains'] };
  expect(() => toDGML(graph)).toThrow(/Contains/);
});
it('XML entity names are case sensitive', () => {
  expect(() =>
    fromDGML(
      `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a" Label="&AMP;"/></Nodes></DirectedGraph>`
    )
  ).toThrow(/entity/);
});

it.each(['insert', 'remove', 'reorder'])(
  'rejects ambiguous positional edge patches after native Link %s',
  (operation) => {
    const original = `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a"/><Node Id="b"/></Nodes><Links><Link Source="a" Target="b" Label="Same" Marker="first"/><Link Source="a" Target="b" Label="Same" Marker="second"/></Links></DirectedGraph>`;
    const doc = dgmlDocumentConverter.from(original);
    const first = '<Link Source="a" Target="b" Label="Same" Marker="first"/>',
      second = '<Link Source="a" Target="b" Label="Same" Marker="second"/>';
    if (operation === 'insert')
      doc.source = original.replace(
        first,
        '<Link Source="a" Target="b" Label="Same" Marker="inserted"/>' + first
      );
    else if (operation === 'remove') doc.source = original.replace(first, '');
    else doc.source = original.replace(first + second, second + first);
    doc.graph!.edges[0].label = 'Graph edit';
    expect(() => dgmlDocumentConverter.to(doc)).toThrow(
      /Link|positional|ambiguous/
    );
  }
);
it('native Link insertion stays authoritative without edge edits and does not prevent stable node-ID patches', () => {
  const original = `<DirectedGraph xmlns="${ns}"><Nodes><Node Id="a" Label="Before"/><Node Id="b"/></Nodes><Links><Link Source="a" Target="b" Label="Same" Marker="original"/></Links></DirectedGraph>`;
  const source = original.replace(
    '<Links>',
    '<Links><Link Source="a" Target="b" Label="Same" Marker="inserted"/>'
  );
  const doc = dgmlDocumentConverter.from(original);
  doc.source = source;
  expect(dgmlDocumentConverter.to(doc)).toBe(source);
  doc.graph!.nodes[0].label = 'Node edit';
  const output = dgmlDocumentConverter.to(doc);
  expect(output).toContain('Label="Node edit"');
  expect(output).toContain('Label="Same" Marker="inserted"');
  expect(output).toContain('Label="Same" Marker="original"');
});
