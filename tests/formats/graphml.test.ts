import { describe, it, expect } from 'vitest';
import { toGraphML, fromGraphML } from '../../src/formats/graphml';
import type { Graph } from '../../src/types';
import { getFullyFeaturedGraphFixture } from '../fixtures';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  mode: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { color: 'red' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: 42 },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: { weight: 1 } },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: { version: 1 },
};

describe('GraphML', () => {
  it('toGraphML() produces valid XML', () => {
    const xml = toGraphML(sampleGraph);
    expect(xml).toContain('<graphml');
    expect(xml).toContain('edgedefault="directed"');
    expect(xml).toContain('id="a"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
  });

  it('round-trips through toGraphML/fromGraphML', () => {
    const xml = toGraphML(sampleGraph);
    const parsed = fromGraphML(xml);

    expect(parsed.id).toBe('test');
    expect(parsed.mode).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);

    // Check node data
    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ color: 'red' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    // Check edge data
    const edge1 = parsed.edges.find((e) => e.id === 'e1');
    expect(edge1?.label).toBe('connects');
    expect(edge1?.data).toEqual({ weight: 1 });

    // Check graph data
    expect(parsed.data).toEqual({ version: 1 });
  });

  it('round-trips a fully featured graph without serialization drift', () => {
    expectFixtureRoundTrip((graph) => fromGraphML(toGraphML(graph)), {
      graphKeys: ['initialNodeId', 'data', 'direction', 'style'],
      nodeKeys: [
        'parentId',
        'initialNodeId',
        'label',
        'data',
        'x',
        'y',
        'width',
        'height',
        'shape',
        'color',
        'style',
        'ports',
      ],
      edgeKeys: [
        'label',
        'weight',
        'data',
        'x',
        'y',
        'width',
        'height',
        'color',
        'style',
        'sourcePort',
        'targetPort',
      ],
    });
  });

  it('handles undirected graphs', () => {
    const g: Graph = {
      ...sampleGraph,
      mode: 'undirected',
    };
    const xml = toGraphML(g);
    expect(xml).toContain('edgedefault="undirected"');
    const parsed = fromGraphML(xml);
    expect(parsed.mode).toBe('undirected');
  });

  it('throws on non-string input', () => {
    expect(() => fromGraphML(null as any)).toThrow('GraphML: expected a string');
  });

  it('throws on invalid XML', () => {
    expect(() => fromGraphML('not xml <><><')).toThrow('GraphML:');
  });

  it('throws on XML without <graphml> root', () => {
    expect(() => fromGraphML('<root><child/></root>')).toThrow('GraphML: missing <graphml> root element');
  });

  it('throws on <graphml> without <graph>', () => {
    expect(() => fromGraphML('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="k"/></graphml>')).toThrow('GraphML: missing <graph> element');
  });

  it('handles empty graph', () => {
    const xml = '<graphml><graph id="g" edgedefault="directed"></graph></graphml>';
    const graph = fromGraphML(xml);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.id).toBe('g');
  });

  it('synthesizes unique ids for edges without an id attribute', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="n0"/>',
      '    <node id="n1"/>',
      '    <node id="n2"/>',
      '    <edge source="n0" target="n1"/>',
      '    <edge source="n1" target="n2"/>',
      '    <edge source="n0" target="n2"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.edges).toHaveLength(3);
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain('undefined');
  });

  it('synthesized edge ids do not collide with explicit edge ids', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="a"/>',
      '    <node id="b"/>',
      // The id-less edge at index 0 would synthesize `a-b-0`, which an
      // explicit id later in the document already claims.
      '    <edge source="a" target="b"/>',
      '    <edge id="a-b-0" source="a" target="b"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.edges).toHaveLength(2);
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('a-b-0');
  });

  it('imports standard-GraphML nested <graph> hierarchy (two levels)', () => {
    // yEd-style: subgraphs nest as <node><graph>...</graph></node>.
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="outer">',
      '      <graph id="outer:" edgedefault="directed">',
      '        <node id="middle">',
      '          <graph id="middle:" edgedefault="directed">',
      '            <node id="inner"/>',
      '          </graph>',
      '        </node>',
      '        <edge id="nested-e" source="middle" target="inner"/>',
      '      </graph>',
      '    </node>',
      '    <node id="top"/>',
      '    <edge id="top-e" source="top" target="inner"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      'inner',
      'middle',
      'outer',
      'top',
    ]);
    expect(graph.nodes.find((n) => n.id === 'outer')?.parentId).toBe(null);
    expect(graph.nodes.find((n) => n.id === 'middle')?.parentId).toBe('outer');
    expect(graph.nodes.find((n) => n.id === 'inner')?.parentId).toBe('middle');
    expect(graph.nodes.find((n) => n.id === 'top')?.parentId).toBe(null);
    // Edges inside nested <graph> elements are document-global.
    expect(graph.edges.map((e) => e.id).sort()).toEqual(['nested-e', 'top-e']);
    const nested = graph.edges.find((e) => e.id === 'nested-e');
    expect(nested?.sourceId).toBe('middle');
    expect(nested?.targetId).toBe('inner');
  });

  it('own-dialect <data key="parentId"> takes precedence over structural nesting', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="outer">',
      '      <graph id="outer:" edgedefault="directed">',
      '        <node id="child"><data key="parentId">other</data></node>',
      '      </graph>',
      '    </node>',
      '    <node id="other"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.nodes.find((n) => n.id === 'child')?.parentId).toBe('other');
  });

  it('imports native <port> elements, flattening nested ports', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="n0">',
      '      <port name="a">',
      '        <port name="a.b"/>',
      '      </port>',
      '      <port name="c"/>',
      '    </node>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.nodes[0].ports).toEqual([
      { name: 'a', direction: 'inout', data: null },
      { name: 'a.b', direction: 'inout', data: null },
      { name: 'c', direction: 'inout', data: null },
    ]);
  });

  it('own-dialect <data key="ports"> takes precedence over native <port> elements', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="n0">',
      '      <data key="ports">[{"name":"dialect","direction":"out","data":null}]</data>',
      '      <port name="native"/>',
      '    </node>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.nodes[0].ports).toEqual([
      { name: 'dialect', direction: 'out', data: null },
    ]);
  });

  it('imports standard sourceport/targetport edge attributes', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="a"><port name="out"/></node>',
      '    <node id="b"><port name="in"/></node>',
      '    <edge id="e1" source="a" target="b" sourceport="out" targetport="in"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.edges[0].sourcePort).toBe('out');
    expect(graph.edges[0].targetPort).toBe('in');
  });

  it('own-dialect <data key="sourcePort"> takes precedence over sourceport attribute', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="a"/>',
      '    <node id="b"/>',
      '    <edge id="e1" source="a" target="b" sourceport="attr" targetport="attr">',
      '      <data key="sourcePort">dialect</data>',
      '      <data key="targetPort">dialect</data>',
      '    </edge>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.edges[0].sourcePort).toBe('dialect');
    expect(graph.edges[0].targetPort).toBe('dialect');
  });

  it('imports the first graph from a multi-graph document', () => {
    const xml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="first" edgedefault="directed">',
      '    <node id="a"/>',
      '    <node id="b"/>',
      '    <edge id="e1" source="a" target="b"/>',
      '  </graph>',
      '  <graph id="second" edgedefault="undirected">',
      '    <node id="x"/>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    const graph = fromGraphML(xml);
    expect(graph.id).toBe('first');
    expect(graph.mode).toBe('directed');
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(graph.edges).toHaveLength(1);
  });

  it('throws on non-numeric values for numeric <data> keys', () => {
    const nodeXml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="n1"><data key="x">abc</data></node>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    expect(() => fromGraphML(nodeXml)).toThrow(
      'GraphML: <data key="x"> value "abc" on node "n1" is not a number. Fix the value or remove the attribute.',
    );

    const edgeXml = [
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <graph id="G" edgedefault="directed">',
      '    <node id="a"/>',
      '    <node id="b"/>',
      '    <edge id="e1" source="a" target="b"><data key="weight">heavy</data></edge>',
      '  </graph>',
      '</graphml>',
    ].join('\n');
    expect(() => fromGraphML(edgeXml)).toThrow(
      'GraphML: <data key="weight"> value "heavy" on edge "e1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('preserves label text exactly (no number coercion or whitespace trimming)', () => {
    const g: Graph = {
      id: 'g',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: '1.50', data: undefined },
        { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '007', data: undefined },
        { type: 'node', id: 'c', parentId: null, initialNodeId: null, label: '  hi  ', data: undefined },
      ],
      edges: [
        { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: '2.0', data: undefined },
      ],
      data: undefined,
    };
    const out = fromGraphML(toGraphML(g));
    expect(out.nodes.map((n) => n.label)).toEqual(['1.50', '007', '  hi  ']);
    expect(out.edges[0].label).toBe('2.0');
  });
});
