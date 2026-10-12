import { getEditedSource } from '../../src/formats/xml-document';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { graphMLDocumentConverter, fromGraphML, toGraphML } from '../../src/formats/graphml';
import { gexfDocumentConverter, fromGEXF, toGEXF } from '../../src/formats/gexf';
import { dotDocumentConverter, fromDOT, toDOT } from '../../src/formats/dot';
import { gmlDocumentConverter, fromGML, toGML } from '../../src/formats/gml';

const fixtures = [
  { name: 'GraphML', converter: graphMLDocumentConverter, parse: fromGraphML, source: `<?xml version="1.0"?>\n<!-- label="fake" -->\n<g:graphml xmlns:g="http://graphml.graphdrawing.org/xmlns" xmlns:v="urn:vendor"><g:key id="L" for="all" attr.name="label" attr.type="string"/><g:key id="opaque" for="node"/><g:graph id="G" edgedefault="directed"><g:node id="a"><g:data key="L">Old</g:data><g:data key="opaque"><v:label>KEEP</v:label></g:data></g:node><g:node id="b"/><g:edge id="e" source="a" target="b"><g:data key="L">Edge</g:data></g:edge></g:graph></g:graphml>`, old: 'Old', next: 'New & <safe>', encoded: 'New &amp; &lt;safe&gt;', needle: 'KEEP' },
  { name: 'GEXF', converter: gexfDocumentConverter, parse: fromGEXF, source: `<?xml version="1.0"?>\n<!-- label="fake" -->\n<gexf xmlns="http://gexf.net/1.3" version="1.3"><meta><description>KEEP</description></meta><graph defaultedgetype="directed"><nodes><node id='a' label='Old'/><node id='b'/></nodes><edges><edge id="e" source="a" target="b" label="Edge"/></edges></graph></gexf>`, old: 'Old', next: 'New & <safe>', encoded: 'New &amp; &lt;safe&gt;', needle: 'KEEP' },
  { name: 'DOT', converter: dotDocumentConverter, parse: fromDOT, source: `// label="fake"\ndigraph G { a [label="Old", vendor="KEEP"]; b; a -> b [label="Edge"]; }`, old: 'Old', next: 'New "safe"', encoded: 'New \\"safe\\"', needle: 'KEEP' },
  { name: 'GML', converter: gmlDocumentConverter, parse: fromGML, source: `# label "fake"\ngraph [ directed 1 node [ id "a" label "Old" vendor "KEEP" ] node [ id "b" ] edge [ id "e" source "a" target "b" label "Edge" ] ]`, old: 'Old', next: 'New & "safe"', encoded: 'New &amp; &quot;safe&quot;', needle: 'KEEP' },
];

for (const fixture of fixtures) describe(`${fixture.name} native document`, () => {
  it('preserves exact source and comments after JSON persistence', () => {
    const document = fixture.converter.from(fixture.source);
    expect(document.diagnostics.some((item) => item.code.startsWith('projection-'))).toBe(true);
    expect(fixture.converter.to(JSON.parse(JSON.stringify(document)))).toBe(fixture.source);
  });
  it('patches the verified label span while retaining all other bytes', () => {
    const document = fixture.converter.from(fixture.source);
    document.graph!.nodes.find((node) => node.id === 'a')!.label = fixture.next;
    const output = fixture.converter.to(document);
    expect(fixture.parse(output).nodes.find((node) => node.id === 'a')!.label).toBe(fixture.next);
    expect(output).toContain(fixture.needle);
    expect(output).toBe(fixture.source.replace('Old', fixture.encoded));
  });
  it('retains independent native unknown edits during a Graph label edit', () => {
    const document = fixture.converter.from(fixture.source);
    document.source = document.source.replace('KEEP', 'CHANGED');
    document.graph!.nodes.find((node) => node.id === 'a')!.label = 'New';
    const output = fixture.converter.to(document);
    expect(output).toContain('CHANGED');
    expect(fixture.parse(output).nodes.find((node) => node.id === 'a')!.label).toBe('New');
  });
  it('rejects conflicting native and Graph label edits', () => {
    const document = fixture.converter.from(fixture.source);
    document.source = document.source.replace('Old', 'Native');
    document.graph!.nodes.find((node) => node.id === 'a')!.label = 'Graph';
    expect(() => fixture.converter.to(document)).toThrow(/conflict/);
  });
  it('never replays stale source for unsupported structural/data edits', () => {
    const document = fixture.converter.from(fixture.source);
    document.graph!.nodes.find((node) => node.id === 'a')!.data = { arbitrary: true };
    expect(() => fixture.converter.to(document)).toThrow(/unsupported/);
  });
  it('patches edge labels independently', () => {
    const document = fixture.converter.from(fixture.source);
    document.graph!.edges[0].label = 'New edge';
    expect(fixture.parse(fixture.converter.to(document)).edges[0].label).toBe('New edge');
  });
});

it('retains GraphML hyperedges with an unavailable binary projection', () => {
  const source = '<graphml><graph edgedefault="directed"><hyperedge id="h"><endpoint node="a"/></hyperedge></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  expect(document.graph).toBeNull();
  expect(graphMLDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
  expect(() => graphMLDocumentConverter.from(source, { strict: true })).toThrow();
});
it('makes first-graph GraphML projection partial while retaining every graph', () => {
  const source = '<graphml><graph edgedefault="directed"><node id="a"/></graph><graph edgedefault="undirected"><node id="b"/></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  expect(document.diagnostics.some((item) => item.code === 'projection-multiple-graphs')).toBe(true);
  expect(graphMLDocumentConverter.to(document)).toBe(source);
});
it('rejects HTML DOT label changes instead of changing their interpretation', () => {
  const document = dotDocumentConverter.from('digraph { a [label=<<B>Old</B>>]; }');
  document.graph!.nodes[0].label = 'New';
  expect(() => dotDocumentConverter.to(document)).toThrow(/unsupported/);
});
it('rejects XML control characters in new labels', () => {
  const document = gexfDocumentConverter.from(fixtures[1].source);
  document.graph!.nodes[0].label = 'bad\u0001';
  expect(() => gexfDocumentConverter.to(document)).toThrow(/invalid.*label/);
});

it('ignores fake XML identities in comments, doctype, PI and CDATA', () => {
  const source = `<!DOCTYPE graphml [<!ENTITY fake "<node id='a'><data key='L'>Old</data></node>">]><?fake node id="a"?><graphml><key id="L" for="node" attr.name="label" attr.type="string"/><graph edgedefault="directed"><!-- <node id="a"><data key="L">Old</data></node> --><node id="a"><data key="L">Actual</data><data key="opaque"><![CDATA[<node id="a"><data key="L">Old</data></node>]]></data></node></graph></graphml>`;
  const document = graphMLDocumentConverter.from(source);
  expect(document.graph).not.toBeNull();
  document.graph!.nodes[0].label = 'New';
  expect(graphMLDocumentConverter.to(document)).toBe(source.replace('Actual', 'New'));
});
it('does not mistake vendor or data-subtree elements for graph entities', () => {
  const source = `<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:v="urn:vendor"><key id="L" attr.name="label"/><graph edgedefault="directed"><node id="a"><data key="L">Actual</data><data key="opaque"><node id="a"><data key="L">Fake</data></node><v:node id="a"><v:data key="L">Foreign</v:data></v:node></data></node></graph></graphml>`;
  const document = graphMLDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(graphMLDocumentConverter.to(document)).toBe(source.replace('Actual', 'New'));
});
it('retains CDATA labels unchanged but rejects an unverified content replacement', () => {
  const source = '<graphml><graph edgedefault="directed"><node id="a"><data key="label"><![CDATA[<node id="fake"/>]]></data></node></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  expect(graphMLDocumentConverter.to(document)).toBe(source);
  document.graph!.nodes[0].label = 'New';
  expect(() => graphMLDocumentConverter.to(document)).toThrow(/unsupported.*CDATA/);
});
it('rejects non-string GraphML label keys and does not alter native declarations', () => {
  const document = graphMLDocumentConverter.from('<graphml><key id="L" attr.name="label" attr.type="int"/><graph edgedefault="directed"><node id="a"><data key="L">7</data></node></graph></graphml>');
  document.graph!.nodes[0].label = 'New';
  expect(() => graphMLDocumentConverter.to(document)).toThrow(/string type/);
});
it('adds a native GEXF label without replacing other attributes or formatting', () => {
  const source = '<g:gexf xmlns:g="http://www.gexf.net/1.2draft" version="1.2"><g:graph><g:nodes><g:node id="a" /></g:nodes></g:graph></g:gexf>';
  const document = gexfDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(gexfDocumentConverter.to(document)).toBe(source.replace('id="a" />', 'id="a"  label="New"/>'));
});
it('uses the last repeated DOT label declaration and preserves prior statements', () => {
  const source = 'digraph { a [label="First"]; /* a[label="Fake"] */ a [label="Actual"]; a [vendor="KEEP"]; }';
  const document = dotDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(dotDocumentConverter.to(document)).toBe(source.replace('Actual', 'New'));
});
it('adds a local DOT override for an inherited plain label', () => {
  const source = 'digraph { node[label="Default"]; a; b; }';
  const document = dotDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  const output = dotDocumentConverter.to(document);
  expect(output).toBe(source.replace(' a;', ' a [label="New"];'));
  expect(fromDOT(output).nodes[1].label).toBe('Default');
});
it.each(['digraph { a -> b -> c [label="Old"]; }', 'strict digraph { a -> b [label="First"]; a -> b [label="Old"]; }'])('rejects ambiguous DOT edge identity: %s', (source) => {
  const document = dotDocumentConverter.from(source);
  document.graph!.edges[0].label = 'New';
  expect(() => dotDocumentConverter.to(document)).toThrow(/unsupported/);
});
it('rejects inherited HTML DOT label changes', () => {
  for (const source of ['digraph { node[label=<<B>Old</B>>]; a; }']) {
    const document = dotDocumentConverter.from(source);
    document.graph!.nodes[0].label = 'New';
    expect(() => dotDocumentConverter.to(document)).toThrow(/unsupported/);
  }
});
it('resolves GML numeric IDs and versioned original IDs without touching opaque blocks', () => {
  const source = 'graph [ directed 1 node [ id 0 stately "{&quot;format&quot;:&quot;stately&quot;,&quot;version&quot;:1,&quot;originalId&quot;:&quot;a&quot;}" label "Actual" graphics [ vendor "label &quot;Fake&quot;" ] ] ]';
  const document = gmlDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(gmlDocumentConverter.to(document)).toBe(source.replace('Actual', 'New'));
});
it('adds a GML quoted label without changing neighboring comments', () => {
  const source = 'graph [ node [ id 1 # label "Fake"\n ] ]';
  const document = gmlDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(gmlDocumentConverter.to(document)).toBe(source.replace('\n ]', '\n  label "New" ]'));
});
it('preserves multiple GML graphs with an unavailable projection', () => {
  const source = 'graph [ node [ id 1 ] ] # between\ngraph [ node [ id 2 ] ]';
  const document = gmlDocumentConverter.from(source);
  expect(document.graph).toBeNull();
  expect(gmlDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
});
it('never strips deliberately reserved-shaped user data during label edits', () => {
  const source = '<graphml><key id="data"/><graph edgedefault="directed"><node id="a"><data key="label">Old</data><data key="data">{&quot;_graphml&quot;:{&quot;format&quot;:&quot;@statelyai/graph/graphml&quot;,&quot;version&quot;:1,&quot;wrapped&quot;:true,&quot;userData&quot;:17},&quot;keep&quot;:true}</data></node></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  const before = document.graph!.nodes[0].data;
  document.graph!.nodes[0].label = 'New';
  const output = graphMLDocumentConverter.to(document);
  expect(output).toBe(source.replace('Old', 'New'));
  expect(fromGraphML(output).nodes[0].data).toEqual(before);
});

it('preserves valid DOT concatenation with an unavailable projection from the legacy parser', () => {
  const source = 'digraph { a [label="Old" + "continued"]; }';
  const document = dotDocumentConverter.from(source);
  expect(document.graph).toBeNull();
  expect(document.diagnostics.some((item) => item.code === 'projection-unavailable')).toBe(true);
  expect(dotDocumentConverter.to(document)).toBe(source);
});

for (const fixture of fixtures) it(`${fixture.name} accepts native-only edits as authoritative`, () => {
  const document = fixture.converter.from(fixture.source);
  document.source = fixture.source.replace('Old', 'Native').replace('KEEP', 'Vendor').replace('fake', 'COMMENT');
  expect(fixture.converter.to(document)).toBe(document.source);
});
it('merges native GraphML node addition and reordering with a Graph label edit', () => {
  const source = '<graphml><key id="L" attr.name="label"/><graph edgedefault="directed"><node id="a"><data key="L">Old</data></node><node id="b"/></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  document.source = source.replace('<node id="a"><data key="L">Old</data></node><node id="b"/>', '<node id="b"/><!-- new order --><node id="new"/><node id="a"><data key="L">Old</data></node>');
  document.graph!.nodes[0].label = 'New';
  const output = graphMLDocumentConverter.to(document);
  expect(output).toBe(document.source.replace('Old', 'New'));
  expect(fromGraphML(output).nodes.map((node) => node.id)).toEqual(['b', 'new', 'a']);
});
it('merges native GEXF node additions with a Graph label edit', () => {
  const document = gexfDocumentConverter.from(fixtures[1].source);
  document.source = document.source.replace('</nodes>', '<node id="new"/></nodes>');
  document.graph!.nodes[0].label = 'New';
  expect(gexfDocumentConverter.to(document)).toBe(document.source.replace('Old', 'New'));
});
it('merges native DOT node additions with a Graph label edit', () => {
  const document = dotDocumentConverter.from(fixtures[2].source);
  document.source = document.source.replace(' b;', ' new; b;');
  document.graph!.nodes[0].label = 'New';
  expect(dotDocumentConverter.to(document)).toBe(document.source.replace('Old', 'New'));
});
it('merges native GML node additions with a Graph label edit', () => {
  const document = gmlDocumentConverter.from(fixtures[3].source);
  document.source = document.source.replace(' node [ id "b" ]', ' node [ id "new" ] node [ id "b" ]');
  document.graph!.nodes[0].label = 'New';
  expect(gmlDocumentConverter.to(document)).toBe(document.source.replace('Old', 'New'));
});
it('ignores a core-looking graph nested inside an unknown GraphML data subtree', () => {
  const source = '<graphml><graph edgedefault="directed"><node id="a"><data key="label">Old</data><data key="vendor"><graph><node id="a"><data key="label">Fake</data></node></graph></data></node></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  expect(graphMLDocumentConverter.to(document)).toBe(source.replace('Old', 'New'));
});

it('inserts a missing GraphML label through its existing scoped key', () => {
  const source = '<g:graphml xmlns:g="http://graphml.graphdrawing.org/xmlns"><g:key id="L" for="node" attr.name="label" attr.type="string"><g:default>Old</g:default></g:key><g:graph edgedefault="directed"><g:node id="a"/><g:node id="b"/></g:graph></g:graphml>';
  const document = graphMLDocumentConverter.from(source);
  document.graph!.nodes[0].label = 'New';
  const output = graphMLDocumentConverter.to(document);
  expect(output).toBe(source.replace('<g:node id="a"/>', '<g:node id="a"><g:data key="L">New</g:data></g:node>'));
  expect(fromGraphML(output).nodes[1].label).toBe('Old');
});
it('edits actual nested GEXF labels without touching vendor-node lookalikes', () => {
  const source = '<gexf xmlns="http://gexf.net/1.3"><graph><nodes><node id="parent"><nodes><node id="a" label="Old"/></nodes><attvalues><attvalue for="vendor"><node id="a" label="Fake"/></attvalue></attvalues></node></nodes></graph></gexf>';
  const document = gexfDocumentConverter.from(source);
  document.graph!.nodes.find((node) => node.id === 'a')!.label = 'New';
  expect(gexfDocumentConverter.to(document)).toBe(source.replace('Old', 'New'));
});
it.each(fixtures)('$name rejects nullable label changes instead of replaying original source', (fixture) => {
  const document = fixture.converter.from(fixture.source);
  document.graph!.nodes[0].label = null;
  expect(() => fixture.converter.to(document)).toThrow(/unsupported/);
});
it('edits multiple independent native label spans in one output', () => {
  for (const fixture of fixtures) {
    const document = fixture.converter.from(fixture.source);
    document.graph!.nodes[0].label = 'New';
    document.graph!.edges[0].label = 'New edge';
    expect(fixture.converter.to(document)).toBe(fixture.source.replace('Old', 'New').replace('Edge', 'New edge'));
  }
});

const nullLabels = [
  { converter: graphMLDocumentConverter, from: fromGraphML, to: toGraphML, native: (source: string) => source.replace('<node id="a">', '<node id="a"><data key="label"></data>').replace('<edge id="e" source="a" target="b">', '<edge id="e" source="a" target="b"><data key="label"></data>') },
  { converter: gexfDocumentConverter, from: fromGEXF, to: toGEXF, native: (source: string) => source.replace(/<node id="a"(?: label="")?/, '<node id="a" label=""').replace('<edge id="e" source="a" target="b"', '<edge id="e" source="a" target="b" label=""') },
  { converter: dotDocumentConverter, from: fromDOT, to: toDOT, native: (source: string) => source.replace('a [', 'a [label="", ').replace('a -> b [', 'a -> b [label="", ') },
  { converter: gmlDocumentConverter, from: fromGML, to: toGML, native: (source: string) => source.replace('id "a"', 'id "a" label ""').replace('id "e"', 'id "e" label ""') },
];
for (const fixture of nullLabels) {
  it(`${fixture.converter.format} native explicit empty label overrides Graph null metadata`, () => {
    const source = fixture.to(createGraph({ nodes: [{ id: 'a', label: null }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: null }] }));
    expect(fixture.from(source).nodes[0].label).toBeNull();
    expect(fixture.from(source).edges[0].label).toBeNull();
    const imported = fixture.from(fixture.native(source));
    expect(imported.nodes[0].label).toBe('');
    expect(imported.edges[0].label).toBe('');
  });
  it(`${fixture.converter.format} detects native empty versus Graph nonempty conflict`, () => {
    const source = fixture.to(createGraph({ nodes: [{ id: 'a', label: null }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: null }] }));
    const document = fixture.converter.from(source);
    document.source = fixture.native(source);
    document.graph!.nodes[0].label = 'Graph';
    expect(() => fixture.converter.to(document)).toThrow(/conflict/);
  });
}

for (const fixture of nullLabels) it(`${fixture.converter.format} patches a Graph null label to explicit native empty`, () => {
  const source = fixture.to(createGraph({ nodes: [{ id: 'a', label: null }], edges: [] }));
  const document = fixture.converter.from(source);
  document.graph!.nodes[0].label = '';
  expect(fixture.from(fixture.converter.to(document)).nodes[0].label).toBe('');
});
it('DOT native empty inherited defaults override null markers on nodes and edges', () => {
  const source = toDOT(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }] }));
  const graph = fromDOT(source.replace('{', '{ node[label=""]; edge[label=""];'));
  expect(graph.nodes[0].label).toBe('');
  expect(graph.edges[0].label).toBe('');
});
it('GraphML native empty label defaults override null metadata', () => {
  const source = toGraphML(createGraph({ nodes: [{ id: 'a' }] }));
  const graph = fromGraphML(source.replace('<key id="label" for="all" attr.name="label" attr.type="string"/>', '<key id="label" for="all" attr.name="label" attr.type="string"><default></default></key>'));
  expect(graph.nodes[0].label).toBe('');
});
it('DOT compound native empty labels override private null metadata', () => {
  const source = toDOT(createGraph({ nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }] }));
  const graph = fromDOT(source.replace('subgraph parent {', 'subgraph parent { label="";'));
  expect(graph.nodes.find((node) => node.id === 'parent')!.label).toBe('');
});

it('resolves GraphML numeric entity IDs and preserves escaped entity literals', () => {
  const source = '<graphml><key id="L" attr.name="label"/><graph edgedefault="directed"><node id="&#97;"><data key="L">&#79;ld &amp;#65;</data></node></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  expect(document.graph!.nodes[0].id).toBe('a');
  expect(document.graph!.nodes[0].label).toBe('Old &#65;');
  document.graph!.nodes[0].label = 'New &#65;';
  expect(graphMLDocumentConverter.to(document)).toBe(source.replace('&#79;ld &amp;#65;', 'New &amp;#65;'));
});
it('resolves GEXF numeric entity IDs and safely patches attribute line breaks', () => {
  const source = '<gexf xmlns="http://gexf.net/1.3"><graph><nodes><node id="&#97;" label="&#79;ld"/></nodes></graph></gexf>';
  const document = gexfDocumentConverter.from(source);
  expect(document.graph!.nodes[0].id).toBe('a');
  expect(document.graph!.nodes[0].label).toBe('Old');
  document.graph!.nodes[0].label = 'New\nline\tvalue\rend';
  const output = gexfDocumentConverter.to(document);
  expect(output).toBe(source.replace('label="&#79;ld"', 'label="New&#10;line&#9;value&#13;end"'));
  expect(fromGEXF(output).nodes[0].label).toBe('New\nline\tvalue\rend');
});

it('preserves every GEXF graph without fabricating an empty single-graph projection', () => {
  const source = '<gexf xmlns="http://gexf.net/1.3"><graph><nodes><node id="a"/></nodes></graph><graph><nodes><node id="b"/></nodes></graph></gexf>';
  const document = gexfDocumentConverter.from(source);
  expect(document.graph).toBeNull();
  expect(document.diagnostics.some((item) => item.code === 'projection-unavailable')).toBe(true);
  expect(gexfDocumentConverter.to(document)).toBe(source);
});
it('preserves the complete DOT graph stream with an explicit first-graph diagnostic', () => {
  const source = 'digraph First { a; } // middle\ngraph Second { b; }';
  const document = dotDocumentConverter.from(source);
  expect(document.graph!.nodes.map((node) => node.id)).toEqual(['a']);
  expect(document.diagnostics.some((item) => item.code === 'projection-multiple-graphs')).toBe(true);
  expect(dotDocumentConverter.to(document)).toBe(source);
});

it('patches a self-closing GraphML empty label without replacing its attributes', () => {
  const source = '<graphml><key id="L" attr.name="label"/><graph edgedefault="directed"><node id="a"><data key="L"/></node></graph></graphml>';
  const document = graphMLDocumentConverter.from(source);
  expect(document.graph!.nodes[0].label).toBe('');
  document.graph!.nodes[0].label = 'New';
  expect(graphMLDocumentConverter.to(document)).toBe(source.replace('<data key="L"/>', '<data key="L">New</data>'));
});

it('retains missing native DOT default-label state and rejects an ambiguous Graph edit', () => {
  const source = 'digraph { a; }';
  const document = dotDocumentConverter.from(source);
  expect(dotDocumentConverter.to(document)).toBe(source);
  document.graph!.nodes[0].label = 'New';
  expect(() => dotDocumentConverter.to(document)).toThrow(/Missing native DOT labels/);
});

it('DOT document distinguishes missing native labels from explicit empty and detects presence conflicts', () => {
  const document = dotDocumentConverter.from('digraph { a; }');
  expect(document.graph!.nodes[0].label).toBeNull();
  document.source = 'digraph { a [label=""]; }';
  document.graph!.nodes[0].label = 'Graph';
  expect(() => dotDocumentConverter.to(document)).toThrow(/conflict/);
});
it('DOT document preserves deliberate implicitLabel-shaped private user data', () => {
  const source = toDOT(createGraph({ nodes: [{ id: 'a', label: '', data: { dot: { implicitLabel: true } } }] }));
  const document = dotDocumentConverter.from(source);
  expect(document.graph!.nodes[0].label).toBe('');
  expect(document.graph!.nodes[0].data).toEqual({ dot: { implicitLabel: true } });
  expect(dotDocumentConverter.to(document)).toBe(source);
});

it('GML document distinguishes native missing/empty labels and safely inserts literal labels', () => {
  const source = 'graph [ node [ id 0 ] ]';
  const document = gmlDocumentConverter.from(source);
  expect(document.graph!.nodes[0].label).toBeNull();
  document.graph!.nodes[0].label = 'ADDED';
  expect(gmlDocumentConverter.to(document)).toBe('graph [ node [ id 0  label "ADDED" ] ]');
  const conflict = gmlDocumentConverter.from(source);
  conflict.source = 'graph [ node [ id 0 label "" ] ]';
  conflict.graph!.nodes[0].label = 'CONFLICT';
  expect(() => gmlDocumentConverter.to(conflict)).toThrow(/conflict/);
});

it('GML document label edits encode native line whitespace and retain unrelated bytes', () => {
  const source = '# KEEP\ngraph [ node [ id 0 label "a&#10;b" ] node [ id 1 ] edge [ id 2 source 0 target 1 label "OLD" ] ]';
  const document = gmlDocumentConverter.from(source);
  expect(document.graph!.nodes[0].label).toBe('a\nb');
  expect(gmlDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
  document.graph!.nodes[0].label = 'N\rO\nP\tQ';
  document.graph!.edges[0].label = 'E\rF\nG\tH';
  const output = gmlDocumentConverter.to(document);
  expect(output).toBe(source.replace('a&#10;b', 'N&#13;O&#10;P&#9;Q').replace('OLD', 'E&#13;F&#10;G&#9;H'));
  const invalid = gmlDocumentConverter.from(source);
  invalid.graph!.nodes[0].label = '\ud800';
  expect(() => gmlDocumentConverter.to(invalid)).toThrow(/Unicode scalar/);
});

it('chunked span edits preserve equal-offset insertion order and boundaries', () => {
  expect(getEditedSource('abcd', [{ start: 2, end: 2, text: 'A' }, { start: 2, end: 2, text: 'B' }])).toBe('abBAcd');
  expect(getEditedSource('abcd', [{ start: 0, end: 0, text: '<' }, { start: 4, end: 4, text: '>' }, { start: 1, end: 3, text: 'X' }, { start: 1, end: 1, text: 'I' }])).toBe('<aIXd>');
  expect(getEditedSource('', [{ start: 0, end: 0, text: 'A' }, { start: 0, end: 0, text: 'B' }])).toBe('BA');
  expect(() => getEditedSource('abcd', [{ start: 1, end: 3, text: 'X' }, { start: 2, end: 2, text: 'I' }])).toThrow(/overlapping/);
  expect(() => getEditedSource('abcd', [{ start: -1, end: 0, text: 'X' }])).toThrow(/invalid/);
});

it('DOT wire labels and IDs reject NUL/lone surrogates while escaped private JSON data survives', () => {
  for (const value of ['A\u0000B', '\ud800']) {
    expect(() => toDOT(createGraph({ nodes: [{ id: 'a', label: value }] }))).toThrow(/Unicode scalar/);
    expect(() => toDOT(createGraph({ nodes: [{ id: value }] }))).toThrow(/Unicode scalar/);
    const document = dotDocumentConverter.from('digraph { a [label="OLD"]; }'); document.graph!.nodes[0].label = value;
    expect(() => dotDocumentConverter.to(document)).toThrow(/invalid-native-label/);
  }
  const source = toDOT(createGraph({ nodes: [{ id: 'a', label: 'A', data: { value: 'A\u0000B', surrogate: '\ud800' } }] }));
  expect(source).not.toContain('\u0000'); expect(fromDOT(source).nodes[0].data).toEqual({ value: 'A\u0000B', surrogate: '\ud800' });
});
