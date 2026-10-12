import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { getEdgeMode } from '../../src/mode';
import type { Graph } from '../../src/types';
import { fromGraphML, toGraphML } from '../../src/formats/graphml';
import { fromGEXF, toGEXF } from '../../src/formats/gexf';
import { fromGML, toGML } from '../../src/formats/gml';
import { fromDOT, toDOT } from '../../src/formats/dot';

// Native inputs are authored independently of our exporters. Assertions check
// their expected meaning before a lossy import could become a false baseline.
function getGraphML(contents: string, keys = ''): string {
  return `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">${keys}
    <graph id="g" edgedefault="directed">${contents}</graph></graphml>`;
}

function getGEXF(edge: string, graphAttributes = 'defaultedgetype="directed"'): string {
  return `<gexf xmlns="http://gexf.net/1.3" version="1.3">
    <graph ${graphAttributes}><nodes><node id="a" label="A"/><node id="b" label="B"/></nodes>
    <edges>${edge}</edges></graph></gexf>`;
}

describe('fidelity regressions: XML and DOT', () => {
  it('GraphML resolves arbitrary key ids through attr.name', () => {
    const graph = fromGraphML(getGraphML(
      '<node id="a"><data key="d0">Alpha</data></node>',
      '<key id="d0" for="node" attr.name="label" attr.type="string"/>',
    ));
    expect(graph.nodes[0].label).toBe('Alpha');
  });

  it('GraphML applies declared key defaults to missing values', () => {
    const graph = fromGraphML(getGraphML(
      '<node id="a"/>',
      '<key id="d0" for="node" attr.name="label" attr.type="string"><default>Default label</default></key>',
    ));
    expect(graph.nodes[0].label).toBe('Default label');
  });

  it('GraphML inherits edge direction from the containing nested graph', () => {
    const graph = fromGraphML(getGraphML(`<node id="group">
      <graph id="inner" edgedefault="undirected"><node id="a"/><node id="b"/>
        <edge id="e" source="a" target="b"/>
      </graph></node>`));
    expect(graph.nodes.find((node) => node.id === 'a')?.parentId).toBe('group');
    expect(getEdgeMode(graph, graph.edges[0])).toBe('undirected');
  });

  it('GEXF imports native edge weight instead of requiring a custom attvalue', () => {
    const graph = fromGEXF(getGEXF('<edge id="e" source="a" target="b" weight="2.5"/>'));
    expect(graph.edges[0].weight).toBe(2.5);
  });

  it('GEXF imports mutual edges as bidirectional', () => {
    const graph = fromGEXF(getGEXF('<edge id="e" source="a" target="b" type="mutual"/>'));
    expect(getEdgeMode(graph, graph.edges[0])).toBe('bidirectional');
  });

  it('GEXF uses the native undirected default when defaultedgetype is absent', () => {
    const graph = fromGEXF(getGEXF('<edge id="e" source="a" target="b"/>', ''));
    expect(graph.mode).toBe('undirected');
    expect(getEdgeMode(graph, graph.edges[0])).toBe('undirected');
  });

  it.each([
    ['GraphML', (graph: Graph) => fromGraphML(toGraphML(graph))],
    ['GEXF', (graph: Graph) => fromGEXF(toGEXF(graph))],
  ] as const)('%s preserves a bidirectional Graph mode', (_name, roundTrip) => {
    const graph = createGraph({
      mode: 'bidirectional',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const restored = roundTrip(graph);
    expect(restored.mode).toBe('bidirectional');
    expect(getEdgeMode(restored, restored.edges[0])).toBe('bidirectional');
  });

  it.each([
    ['GEXF', (graph: Graph) => fromGEXF(toGEXF(graph))],
    ['GML', (graph: Graph) => fromGML(toGML(graph))],
    ['GraphML', (graph: Graph) => fromGraphML(toGraphML(graph))],
  ] as const)('%s preserves factory-default null node and edge labels', (_name, roundTrip) => {
    const original = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const restored = roundTrip(original);
    expect(restored.nodes[0].label).toBeNull();
    expect(restored.edges[0].label).toBeNull();
  });

  it('DOT merges repeated node declarations without resetting earlier attributes', () => {
    const graph = fromDOT('digraph { a [label="Alpha", tooltip="keep"]; a [shape=box]; }');
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: 'a', label: 'Alpha', shape: 'rectangle', data: { dot: { attrs: { tooltip: 'keep' } } },
    });
  });

  it('DOT strict graphs merge repeated edges and their attributes', () => {
    const graph = fromDOT('strict digraph { a -> b [label="first"]; a -> b [color=red]; }');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b', label: 'first', color: 'red' });
    expect(toDOT(graph)).toMatch(/^strict digraph/);
  });

  it('DOT rank constraints retain edges authored inside their subgraph', () => {
    const graph = fromDOT('digraph { { rank=same; a -> b; } }');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b' });
  });

  it('DOT preserves cluster containment on the first round trip', () => {
    const graph = fromDOT('digraph { subgraph cluster_0 { label="Group"; a; b; a -> b; } }');
    const restored = fromDOT(toDOT(graph));
    expect(restored.nodes.find((node) => node.id === 'a')?.parentId).toBe('cluster_0');
    expect(restored.nodes.find((node) => node.id === 'b')?.parentId).toBe('cluster_0');
    expect(restored.nodes.find((node) => node.id === 'cluster_0')?.label).toBe('Group');
  });
});


describe('XML native preservation and edit precedence', () => {
  it('GraphML matches a prefix declared on its root and rejects foreign roots', () => {
    expect(fromGraphML('<g:graphml xmlns:g="http://graphml.graphdrawing.org/xmlns"><g:graph edgedefault="directed"><g:node id="a"/></g:graph></g:graphml>').nodes[0].id).toBe('a');
    expect(() => fromGraphML('<graphml xmlns="urn:foreign"><graph/></graphml>')).toThrow('GraphML:');
  });

  it('GraphML recognizes XML boolean zero and rejects unrepresentable hyperedges', () => {
    const graph = fromGraphML(getGraphML('<node id="a"/><node id="b"/><edge source="a" target="b" directed="0"/>'));
    expect(graph.edges[0].mode).toBe('undirected');
    expect(() => fromGraphML(getGraphML('<node id="a"/><hyperedge><endpoint node="a"/></hyperedge>'))).toThrow('hyperedges');
  });

  it('GraphML retains unknown key declarations and values without discarding primitive data', () => {
    const source = getGraphML('<node id="a"><data key="data">42</data><data key="d0">7</data></node>', '<key id="d0" for="node" attr.name="score" attr.type="int"><default>3</default></key>');
    const graph = fromGraphML(source);
    const output = toGraphML(graph);
    expect(output).toContain('attr.name="score"');
    expect(output).toContain('<default>3</default>');
    expect(output).toContain('<data key="d0">7</data>');
    expect(fromGraphML(output).nodes[0].data).toEqual(graph.nodes[0].data);
  });

  it.each([
    ['GraphML', toGraphML, fromGraphML, '<data key="label">Edited</data>', '<node id="a">'],
    ['GEXF', toGEXF, fromGEXF, ' label="Edited"', '<node id="a"'],
  ] as const)('%s native label edits supersede a private null marker', (_name, to, from, edited, marker) => {
    const graph = createGraph({nodes:[{id:'a'}]});
    const output = to(graph);
    const changed = _name === 'GraphML' ? output.replace(marker, marker + edited) : output.replace(marker,marker + edited);
    expect(from(changed).nodes[0].label).toBe('Edited');
  });

  it('GraphML native direction edits supersede private bidirectional mode', () => {
    const graph = createGraph({nodes:[{id:'a'},{id:'b'}],edges:[{id:'e',sourceId:'a',targetId:'b',mode:'bidirectional'}]});
    const xml = toGraphML(graph).replace('id="e" source="a" target="b"', 'id="e" source="a" target="b" directed="true"');
    expect(fromGraphML(xml).edges[0].mode).toBe('directed');
  });

  it.each(['http://www.gexf.net/1.2draft','http://gexf.net/1.2draft'])('GEXF accepts published legacy namespace %s', (namespace) => {
    const source = `<g:gexf xmlns:g="${namespace}" xmlns:v="${namespace}/viz"><g:graph defaultedgetype="directed"><g:nodes><g:node id="a"><v:position x="3" y="4"/></g:node></g:nodes><g:edges/></g:graph></g:gexf>`;
    expect(fromGEXF(source).nodes[0]).toMatchObject({id:'a',x:3,y:4});
  });

  it('GEXF retains class-scoped custom declarations, defaults and creator metadata', () => {
    const source = '<gexf version="1.3"><meta><creator>Author</creator></meta><graph><attributes class="node"><attribute id="0" title="data" type="string"/></attributes><attributes class="edge"><attribute id="0" title="score" type="int"><default>7</default></attribute></attributes><nodes><node id="a"><attvalues><attvalue for="0" value="42"/></attvalues></node></nodes><edges><edge source="a" target="a"><attvalues><attvalue for="0" value="8"/></attvalues></edge></edges></graph></gexf>';
    const graph = fromGEXF(source);
    expect(graph.nodes[0].data).toBe(42);
    const output = toGEXF(graph);
    expect(output).toContain('<creator>Author</creator>');
    expect(output).toContain('title="score"');
    expect(output).toContain('<default>7</default>');
    expect(output).toContain('value="8"');
  });

  it('GEXF preserves native dynamics, alpha, z and shape on re-export', () => {
    const source = '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3"><graph mode="dynamic" timeformat="double"><nodes><node id="a" start="1"><viz:position x="2" y="3" z="4"/><viz:color hex="#ff0000" a="0.5"/><viz:shape value="diamond"/></node></nodes><edges/></graph></gexf>';
    const output = toGEXF(fromGEXF(source));
    expect(output).toContain('mode="dynamic"');
    expect(output).toContain('timeformat="double"');
    expect(output).toContain('start="1"');
    expect(output).toContain('z="4"');
    expect(output).toContain('a="0.5"');
    expect(output).toContain('<viz:shape value="diamond"');
  });

  it('GEXF retains named Graph colors and independent optional geometry', () => {
    const graph = createGraph({nodes:[{id:'a',color:'red',x:10,width:30}]});
    const restored = fromGEXF(toGEXF(graph));
    expect(restored.nodes[0].color).toBe('red');
    expect(restored.nodes[0].x).toBe(10);
    expect(restored.nodes[0].y).toBeUndefined();
    expect(restored.nodes[0].width).toBe(30);
    expect(restored.nodes[0].height).toBeUndefined();
  });
});

describe('DOT native attribute fidelity', () => {
  it('retains independent border color, fill and style', () => {
    const output = toDOT(fromDOT('digraph { a [color=red fillcolor=blue style="rounded,dashed"]; }'));
    expect(output).toContain('color="red"');
    expect(output).toContain('fillcolor="blue"');
    expect(output).toContain('style="rounded,dashed"');
  });

  it('retains resolved attributes across changing defaults', () => {
    const output = toDOT(fromDOT('digraph { node [fontname=Arial]; a; node [fontname=Courier]; b; }'));
    expect(output).toMatch(/a \[[^\]]*fontname="Arial"/);
    expect(output).toMatch(/b \[[^\]]*fontname="Courier"/);
  });

  it('retains inherited HTML label semantics', () => {
    const output = toDOT(fromDOT('digraph { node [label=<<b>Default</b>>]; a; a -> b; }'));
    expect(output).toMatch(/a \[label=<<b>Default<\/b>>/);
    expect(output).toMatch(/b \[label=<<b>Default<\/b>>/);
  });

  it('retains Graph-only fields on compound nodes and arbitrary data', () => {
    const graph = createGraph<unknown>({data:42,nodes:[{id:'group',initialNodeId:'child',data:false,x:12},{id:'child',parentId:'group',data:{dot:'foreign'}}]});
    const restored = fromDOT(toDOT(graph));
    expect(restored.data).toBe(42);
    expect(restored.nodes.find((node) => node.id === 'group')).toMatchObject({initialNodeId:'child',x:12});
    expect(restored.nodes.find((node) => node.id === 'group')?.data).toBe(false);
    expect(restored.nodes.find((node) => node.id === 'child')?.data).toEqual({dot:'foreign'});
  });
});

describe('DOT compass versus declared ports', () => {
  it('imports native compass-only endpoints without fabricated port references', () => {
    const graph = fromDOT('digraph { a:n -> b:s; }');
    expect(graph.edges[0].sourcePort).toBeUndefined();
    expect(graph.edges[0].targetPort).toBeUndefined();
    expect(graph.edges[0].data).toMatchObject({dot:{sourceCompass:'n',targetCompass:'s'}});
    expect(toDOT(graph)).toContain('a:n -> b:s');
  });

  it('keeps record ports whose names happen to be compass names', () => {
    const graph = fromDOT('digraph { a [shape=record label="<n> North|<out> Output"]; b; a:n -> b; }');
    expect(graph.nodes[0].ports).toContainEqual({name:'n',direction:'inout',data:null});
    expect(graph.edges[0].sourcePort).toBe('n');
  });

  it('keeps HTML port definitions and three-segment compass syntax', () => {
    const graph = fromDOT('digraph { a [label=<<TABLE><TR><TD PORT="p">P</TD></TR></TABLE>>]; a:p:e -> b:w; }');
    expect(graph.nodes[0].ports).toContainEqual({name:'p',direction:'inout',data:null});
    expect(graph.edges[0].sourcePort).toBe('p');
    expect(graph.edges[0].data).toMatchObject({dot:{sourceCompass:'e',targetCompass:'w'}});
  });
});

describe('GraphML extension XML namespaces', () => {
  it('retains namespace declarations for unknown vendor data subtrees', () => {
    const source = '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:y="urn:vendor"><key id="vendor" for="node" yfiles.type="nodegraphics"/><graph edgedefault="directed"><node id="a"><data key="vendor"><y:ShapeNode><y:NodeLabel>Alpha</y:NodeLabel></y:ShapeNode></data></node></graph></graphml>';
    const output = toGraphML(fromGraphML(source));
    expect(output).toContain('xmlns:y="urn:vendor"');
    expect(output).toContain('<y:ShapeNode>');
    expect(output).toContain('<y:NodeLabel>Alpha</y:NodeLabel>');
    expect(fromGraphML(output).nodes[0].data).toEqual(fromGraphML(source).nodes[0].data);
  });
});

describe('GraphML native port data', () => {
  it('retains port descriptions, typed custom values and native nesting', () => {
    const source = '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="score" for="port" attr.name="score" attr.type="int"/><graph edgedefault="directed"><node id="a"><port name="outer"><port name="inner"><desc>Inside</desc><data key="score">7</data></port></port></node></graph></graphml>';
    const graph = fromGraphML(source);
    expect(graph.nodes[0].ports?.find((port) => port.name === 'inner')?.label).toBe('Inside');
    const output = toGraphML(graph);
    expect(output).toContain('<port name="outer"><port name="inner">');
    expect(output).toContain('<data key="score">7</data>');
    expect(fromGraphML(output).nodes[0].ports).toEqual(graph.nodes[0].ports);
  });
});

describe('DOT comma node lists', () => {
  it('expands comma edge endpoint lists as a Cartesian product', () => {
    const graph = fromDOT('digraph { a,b,c -> d,e [label="x,y"]; }');
    expect(graph.edges.map((edge) => [edge.sourceId,edge.targetId,edge.label])).toEqual([
      ['a','d','x,y'],['a','e','x,y'],['b','d','x,y'],['b','e','x,y'],['c','d','x,y'],['c','e','x,y'],
    ]);
  });

  it('keeps quoted commas, HTML labels, comments and attribute commas in their contexts', () => {
    const graph = fromDOT('digraph { "a,b",c [label=<<b>A,B</b>>, color=red]; /* comment,a */ "a,b",c -> d,e; }');
    expect(graph.nodes.find((node) => node.id === 'a,b')?.label).toBe('<b>A,B</b>');
    expect(graph.nodes.find((node) => node.id === 'c')?.label).toBe('<b>A,B</b>');
    expect(graph.edges).toHaveLength(4);
  });
});

describe('XML well-formedness boundary', () => {
  it.each([
    ['GraphML',fromGraphML,'<graphml><graph edgedefault="directed"><node id="a"/></graph>'],
    ['GraphML',fromGraphML,'<graphml><graph edgedefault="directed"><node id="a"/></wrong></graphml>'],
    ['GEXF',fromGEXF,'<gexf><graph><nodes><node id="a"/></nodes></graph>'],
    ['GEXF',fromGEXF,'<gexf><graph><nodes><node id="a"/></nodes></wrong></gexf>'],
  ] as const)('%s rejects truncated or mismatched XML %#', (_name,from,source) => {
    expect(() => from(source)).toThrow('invalid XML');
  });
});

describe('DOT strict endpoint updates', () => {
  it('updates redeclared ports, clears replaced compass and keeps untouched endpoints', () => {
    const graph = fromDOT('strict digraph { a:p:n -> b:q:s [label="first"]; a:r -> b; }');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({sourcePort:'r',targetPort:'q',label:'first'});
    expect((graph.edges[0].data as any).dot.sourceCompass).toBeUndefined();
    expect((graph.edges[0].data as any).dot.targetCompass).toBe('s');
  });
});

describe('GraphML native port edit precedence', () => {
  it('uses live native descriptions, data and geometry over its own portable port extension', () => {
    const graph = createGraph({nodes:[{id:'a',ports:[{name:'p',label:'Original',x:1,data:42}]}]});
    const source = toGraphML(graph).replace('<desc>Original</desc>','<desc>Edited</desc>').replace('<data key="data">42</data>','<data key="data">43</data>').replace('<data key="x">1</data>','<data key="x">2</data>');
    expect(fromGraphML(source).nodes[0].ports?.[0]).toMatchObject({label:'Edited',x:2,data:43});
  });
});

it('GML standard output marks parallel edges for independent native readers', () => {
  const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'first', sourceId: 'a', targetId: 'b' }, { id: 'second', sourceId: 'a', targetId: 'b' }] });
  const source = toGML(graph, { standard: true });
  expect(source).toContain('multigraph 1');
  expect(fromGML(source, { standard: true }).edges.map((edge) => edge.id)).toEqual(['first', 'second']);
  expect(toGML(graph)).not.toContain('multigraph');
  const conflicting = fromGML('graph [ multigraph 0 node [ id 0 ] node [ id 1 ] edge [ source 0 target 1 ] edge [ source 0 target 1 ] ]');
  expect(() => toGML(conflicting, { standard: true })).toThrow(/multigraph hint conflicts/);
});

it('GML emits fresh empty node and edge labels and keeps native missing-label provenance', () => {
  const graph = createGraph({ nodes: [{ id: 'a', label: '' }, { id: 'b', label: null }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: '' }] });
  expect(toGML(graph).match(/label ""/g)).toHaveLength(2);
  const native = 'graph [ node [ id 0 ] node [ id 1 label "" ] edge [ id 2 source 0 target 1 ] ]';
  const imported = JSON.parse(JSON.stringify(fromGML(native)));
  const emitted = toGML(imported, { standard: true });
  expect(emitted.match(/label ""/g)).toHaveLength(1);
  imported.nodes[0].label = 'ADDED';
  expect(toGML(imported)).toContain('label "ADDED"');
  const user = createGraph({ nodes: [{ id: 'a', label: '', data: { gml: { implicitLabel: true } } }] });
  expect(toGML(user)).toContain('label ""');
  expect(fromGML(toGML(user)).nodes[0].data).toEqual(user.nodes[0].data);
});

it('GML standard export rejects non-scalar native labels and IDs but preserves JSON escaped data', () => {
  for (const value of ['\ud800', '\udfff']) {
    expect(() => toGML(createGraph({ nodes: [{ id: 'a', label: value }] }), { standard: true })).toThrow(/Unicode scalar/);
    expect(() => toGML(createGraph({ nodes: [{ id: value }] }), { standard: true })).toThrow(/Unicode scalar/);
    expect(() => toGML(createGraph({ id: value }), { standard: true })).toThrow(/Unicode scalar/);
    expect(() => toGML(createGraph({ nodes: [{ id: 'a' }], edges: [{ id: value, sourceId: 'a', targetId: 'a' }] }), { standard: true })).toThrow(/Unicode scalar/);
  }
  const graph = createGraph({ nodes: [{ id: 'a', label: 'valid 🕸️', data: { text: '\ud800' } }] });
  expect(fromGML(toGML(graph, { standard: true })).nodes[0].data).toEqual(graph.nodes[0].data);
});
