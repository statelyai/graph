import { describe, it, expect } from 'vitest';
import { toGEXF, fromGEXF } from '../../src/formats/gexf';
import type { Graph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  mode: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { color: 'red' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: undefined },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: { weight: 1 } },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: undefined,
};

describe('GEXF', () => {
  it('toGEXF() produces valid GEXF XML', () => {
    const xml = toGEXF(sampleGraph);
    expect(xml).toContain('<gexf');
    expect(xml).toContain('defaultedgetype="directed"');
    expect(xml).toContain('id="a"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
    expect(xml).toContain('pid="a"');
  });

  it('round-trips graph structure', () => {
    const xml = toGEXF(sampleGraph);
    const parsed = fromGEXF(xml);

    expect(parsed.mode).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ color: 'red' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    const edge1 = parsed.edges.find((e) => e.id === 'e1');
    expect(edge1?.label).toBe('connects');
    expect(edge1?.data).toEqual({ weight: 1 });
  });

  it('handles undirected graphs', () => {
    const xml = toGEXF({ ...sampleGraph, mode: 'undirected' });
    expect(xml).toContain('defaultedgetype="undirected"');
    const parsed = fromGEXF(xml);
    expect(parsed.mode).toBe('undirected');
  });

  it('preserves visual properties', () => {
    const g: Graph = {
      ...sampleGraph,
      nodes: [
        {
          type: 'node', id: 'a', parentId: null, initialNodeId: null,
          label: 'A', data: undefined,
          x: 100, y: 200, color: '#ff0000',
        },
      ],
      edges: [],
    };
    const xml = toGEXF(g);
    const parsed = fromGEXF(xml);
    expect(parsed.nodes[0].x).toBe(100);
    expect(parsed.nodes[0].y).toBe(200);
    expect(parsed.nodes[0].color).toBe('#ff0000');
  });

  it('throws on non-string input', () => {
    expect(() => fromGEXF(null as any)).toThrow('GEXF: expected a string');
  });

  it('throws on invalid XML', () => {
    expect(() => fromGEXF('not xml at all <><><')).toThrow('GEXF:');
  });

  it('throws on XML without <gexf> root', () => {
    expect(() => fromGEXF('<root><child/></root>')).toThrow('GEXF: missing <gexf> root element');
  });

  it('throws on <gexf> without <graph>', () => {
    expect(() => fromGEXF('<gexf><meta/></gexf>')).toThrow('GEXF: missing <graph> element');
  });

  it('handles empty graph', () => {
    const xml = '<gexf><graph defaultedgetype="directed"></graph></gexf>';
    const graph = fromGEXF(xml);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.mode).toBe('directed');
  });

  it('throws on non-numeric node position/size values', () => {
    const posXml = [
      '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz">',
      '  <graph defaultedgetype="directed">',
      '    <nodes>',
      '      <node id="n1" label=""><viz:position x="abc" y="0"/></node>',
      '    </nodes>',
      '    <edges/>',
      '  </graph>',
      '</gexf>',
    ].join('\n');
    expect(() => fromGEXF(posXml)).toThrow(
      'GEXF: <viz:position> x value "abc" on node "n1" is not a number. Fix the value or remove the attribute.',
    );

    const sizeXml = [
      '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz">',
      '  <graph defaultedgetype="directed">',
      '    <nodes>',
      '      <node id="n1" label=""><viz:size value="big"/></node>',
      '    </nodes>',
      '    <edges/>',
      '  </graph>',
      '</gexf>',
    ].join('\n');
    expect(() => fromGEXF(sizeXml)).toThrow(
      'GEXF: <viz:size> value "big" on node "n1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('throws on non-numeric node width/height attvalues', () => {
    const xml = [
      '<gexf xmlns="http://gexf.net/1.3">',
      '  <graph defaultedgetype="directed">',
      '    <attributes class="node">',
      '      <attribute id="a_width" title="width" type="double"/>',
      '    </attributes>',
      '    <nodes>',
      '      <node id="n1" label="">',
      '        <attvalues><attvalue for="a_width" value="wide"/></attvalues>',
      '      </node>',
      '    </nodes>',
      '    <edges/>',
      '  </graph>',
      '</gexf>',
    ].join('\n');
    expect(() => fromGEXF(xml)).toThrow(
      'GEXF: width attribute value "wide" on node "n1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('throws on non-numeric edge weight/position attvalues', () => {
    const xml = [
      '<gexf xmlns="http://gexf.net/1.3">',
      '  <graph defaultedgetype="directed">',
      '    <attributes class="edge">',
      '      <attribute id="a_edgeWeight" title="weight" type="double"/>',
      '    </attributes>',
      '    <nodes>',
      '      <node id="a" label=""/>',
      '      <node id="b" label=""/>',
      '    </nodes>',
      '    <edges>',
      '      <edge id="e1" source="a" target="b">',
      '        <attvalues><attvalue for="a_edgeWeight" value="heavy"/></attvalues>',
      '      </edge>',
      '    </edges>',
      '  </graph>',
      '</gexf>',
    ].join('\n');
    expect(() => fromGEXF(xml)).toThrow(
      'GEXF: weight attribute value "heavy" on edge "e1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('round-trips ports and edge port references', () => {
    expectFixtureRoundTrip((graph) => fromGEXF(toGEXF(graph)), {
      graphKeys: ['initialNodeId', 'data', 'direction'],
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
});

describe('GEXF label fidelity', () => {
  it('preserves empty-string labels instead of substituting the node id', () => {
    const g: Graph = {
      id: 'g',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: '', data: undefined },
      ],
      edges: [],
      data: undefined,
    };
    const out = fromGEXF(toGEXF(g));
    expect(out.nodes[0].label).toBe('');
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
        { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: '  spaced  ', data: undefined },
      ],
      data: undefined,
    };
    const out = fromGEXF(toGEXF(g));
    expect(out.nodes.map((n) => n.label)).toEqual(['1.50', '007', '  hi  ']);
    expect(out.edges[0].label).toBe('  spaced  ');
  });
});
