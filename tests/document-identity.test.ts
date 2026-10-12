import type { GraphDocumentConverter } from '../src/formats/document';
import { d3DocumentConverter } from '../src/formats/d3';
import { cytoscapeDocumentConverter } from '../src/formats/cytoscape';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { dotDocumentConverter, toDOT } from '../src/formats/dot';
import { graphMLDocumentConverter } from '../src/formats/graphml';
import { gexfDocumentConverter } from '../src/formats/gexf';
import { gmlDocumentConverter } from '../src/formats/gml';
import { tgfDocumentConverter } from '../src/formats/tgf';
import { graphvizJSONDocumentConverter, toGraphvizJSON, type GraphvizJSON } from '../src/formats/graphviz-json';

const dot = 'digraph {a;b;a->b[label="Same",Marker="original"];}';
const tgf = 'a A\nb B\n#\na b Same\n';
const gv: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, objects: [{ _gvid: 0, name: 'a' }, { _gvid: 1, name: 'b' }], edges: [{ _gvid: 0, tail: 0, head: 1, label: 'Same', Marker: 'original' }] };
const xmlCases = [
  { name: 'GraphML', codec: graphMLDocumentConverter, edge: '<edge source="a" target="b"><data key="label">Same</data><data key="Marker">original</data></edge>', wrap: (edge: string) => '<graphml><key id="label" attr.name="label"/><key id="Marker" attr.name="Marker"/><graph edgedefault="directed"><node id="a"/><node id="b"/>' + edge + '</graph></graphml>', getID: (edge: string, id: string) => edge.replace('<edge ', `<edge id="${id}" `) },
  { name: 'GEXF', codec: gexfDocumentConverter, edge: '<edge source="a" target="b" label="Same" Marker="original"/>', wrap: (edge: string) => '<gexf><graph defaultedgetype="directed"><nodes><node id="a"/><node id="b"/></nodes><edges>' + edge + '</edges></graph></gexf>', getID: (edge: string, id: string) => edge.replace('<edge ', `<edge id="${id}" `) },
  { name: 'GML', codec: gmlDocumentConverter, edge: 'edge [ source "a" target "b" label "Same" Marker "original" ]', wrap: (edge: string) => 'graph [ node [ id "a" ] node [ id "b" ] ' + edge + ' ]', getID: (edge: string, id: string) => edge.replace('edge [', `edge [ id "${id}"`) },
];
function getAmbiguity(codec: any, baseline: any, current: any) {
  const document = codec.from(baseline); document.source = current; document.graph.edges[0].label = 'GraphEdit';
  const result = codec.getUpdate(document);
  expect(result.ok).toBe(false); if (!result.ok) expect(result.diagnostics.some((item: any) => item.code === 'ambiguous-native-identity' && item.path?.includes('/edges/'))).toBe(true);
  expect(() => codec.to(document)).toThrow(/identity|ambiguous/i);
}
describe('generated edge identities across source edits', () => {
  it('DOT rejects an inserted same-endpoint/label edge with different opaque attributes', () => getAmbiguity(dotDocumentConverter, dot, dot.replace('a->b', 'a->b[label="Same",Marker="inserted"];a->b')));
  it('TGF rejects a whitespace-distinguished inserted duplicate', () => getAmbiguity(tgfDocumentConverter, tgf, tgf.replace('a b Same', '\ta\tb\tSame\na b Same')));
  it('Graphviz rejects valid current _gvid ordinals that no longer identify the baseline edge', () => getAmbiguity(graphvizJSONDocumentConverter, gv, { ...gv, edges: [{ ...gv.edges![0], Marker: 'inserted' }, { ...gv.edges![0], _gvid: 1 }] }));
  for (const fixture of xmlCases) it(`${fixture.name} rejects a new explicit ID colliding with a baseline-generated ID`, () => {
    const baseline = fixture.wrap(fixture.edge), id = fixture.codec.from(baseline).graph!.edges[0].id;
    getAmbiguity(fixture.codec, baseline, fixture.wrap(fixture.getID(fixture.edge.replace('original', 'inserted'), id) + fixture.edge));
  });
  it('rejects same-cardinality reordered DOT and Graphviz records', () => {
    const second = 'a->b[label="Same",Marker="second"];';
    getAmbiguity(dotDocumentConverter, dot.replace('}', second + '}'), dot.replace('a->b[label="Same",Marker="original"];', second).replace('}', 'a->b[label="Same",Marker="original"];}'));
    const first = { ...gv, edges: [gv.edges![0], { ...gv.edges![0], _gvid: 1, Marker: 'second' }] };
    getAmbiguity(graphvizJSONDocumentConverter, first, { ...gv, edges: [{ ...first.edges[1], _gvid: 0 }, { ...first.edges[0], _gvid: 1 }] });
  });
  it('rejects removed/reordered TGF records with otherwise identical mapped values', () => {
    const baseline = tgf + '\ta\tb\tSame\n';
    getAmbiguity(tgfDocumentConverter, baseline, tgf.replace('a b Same', '\ta\tb\tSame'));
    getAmbiguity(tgfDocumentConverter, baseline, tgf.replace('a b Same', '\ta\tb\tSame\na b Same'));
  });
  it('allows source-only insertions and stable node edits despite ambiguous edge sequences', () => {
    const cases: Array<[any, any, any]> = [[dotDocumentConverter, dot, dot.replace('a->b', 'a->b[label="Same",Marker="inserted"];a->b')], [tgfDocumentConverter, tgf, tgf + 'a b Same\n'], [graphvizJSONDocumentConverter, gv, { ...gv, edges: [...gv.edges!, { ...gv.edges![0], _gvid: 1 }] }]];
    for (const [codec, baseline, current] of cases) { const document = codec.from(baseline); document.source = current; expect(codec.to(document)).toEqual(current); }
    const node = tgfDocumentConverter.from(tgf); node.source = tgf + 'a b Same\n'; node.graph!.nodes[0].label = 'NodeEdit'; expect(tgfDocumentConverter.to(node)).toContain('a NodeEdit');
  });
  it('allows changes outside unchanged unkeyed edge records', () => {
    const d = dotDocumentConverter.from(dot); d.source = '// Native comment\n' + dot; d.graph!.edges[0].label = 'GraphEdit'; expect(dotDocumentConverter.to(d)).toContain('label="GraphEdit"');
    const t = tgfDocumentConverter.from(tgf); t.source = tgf.replace('a A', 'a Native'); t.graph!.edges[0].label = 'GraphEdit'; expect(tgfDocumentConverter.to(t)).toContain('a Native');
    const j = graphvizJSONDocumentConverter.from(gv); j.source.vendor = 'Native'; j.graph!.edges[0].label = 'GraphEdit'; expect(graphvizJSONDocumentConverter.to(j).vendor).toBe('Native');
  });
});
for (const fixture of xmlCases) describe(`${fixture.name} independently declared native identity`, () => {
  it('keeps explicit stable edge edits targeted after insertion/reorder and independent native data edits', () => {
    const baseline = fixture.wrap(fixture.getID(fixture.edge, 'original')), document = fixture.codec.from(baseline);
    const original = fixture.getID(fixture.edge.replace('Marker="original"', 'Marker="Native"').replace('Marker "original"', 'Marker "Native"').replace('>original<', '>Native<'), 'original');
    document.source = fixture.wrap(fixture.getID(fixture.edge.replace('original', 'inserted'), 'inserted') + original); document.graph!.edges[0].label = 'GraphEdit';
    const output = fixture.codec.to(document); expect(output).toContain('GraphEdit'); expect(output).toContain('inserted'); expect(output).toContain('Native');
    expect(fixture.codec.from(output).graph!.edges.find((edge) => edge.id === 'original')!.label).toBe('GraphEdit'); expect(fixture.codec.from(output).graph!.edges.find((edge) => edge.id === 'inserted')!.label).toBe('Same');
  });
  it('preserves source-only collision edits without attempting a Graph patch', () => {
    const baseline = fixture.wrap(fixture.edge), document = fixture.codec.from(baseline), id = document.graph!.edges[0].id;
    document.source = fixture.wrap(fixture.getID(fixture.edge.replace('original', 'inserted'), id) + fixture.edge); expect(fixture.codec.to(document)).toBe(document.source);
  });
});
it('DOT private IDs retain logical edges after foreign insertion', () => {
  const baseline = toDOT(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'original', sourceId: 'a', targetId: 'b', label: 'Same' }] })), document = dotDocumentConverter.from(baseline);
  document.source = baseline.replace('a -> b', 'a -> b [label="Same",Marker="inserted"]; a -> b'); document.graph!.edges[0].label = 'GraphEdit';
  const graph = dotDocumentConverter.from(dotDocumentConverter.to(document)).graph!; expect(graph.edges.find((edge) => edge.id === 'original')!.label).toBe('GraphEdit'); expect(graph.edges[0].label).toBe('Same');
});
it('Graphviz verified private IDs survive pure _gvid renumbering and retain the original target', () => {
  const baseline = toGraphvizJSON(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'original', sourceId: 'a', targetId: 'b', label: 'Same' }] })), document = graphvizJSONDocumentConverter.from(baseline);
  document.source.edges = [{ _gvid: 0, tail: 0, head: 1, label: 'Same', Marker: 'inserted' }, { ...baseline.edges![0], _gvid: 1 }]; document.graph!.edges[0].label = 'GraphEdit';
  const output = graphvizJSONDocumentConverter.to(document); expect(output.edges![0].label).toBe('Same'); expect(output.edges![1].label).toBe('GraphEdit');
});
it('does not treat a private header without a verified entity ID as durable identity', () => {
  const marker = JSON.stringify({ format: 'stately', version: 1 }).replace(/"/g, '\\"');
  const baseline = dot.replace('Marker="original"', `Marker="original",_stately="${marker}"`);
  getAmbiguity(dotDocumentConverter, baseline, baseline.replace('a->b', 'a->b[label="Same",Marker="inserted"];a->b'));
});
it('GraphML baseline identity cannot come from another graph or namespace', () => {
  const fixture = xmlCases[0], baseline = fixture.wrap(fixture.edge).replace('</graphml>', '<graph edgedefault="directed"><node id="other"/><edge id="a-b-0" source="other" target="other"/></graph><v:edge xmlns:v="urn:vendor" id="a-b-0"/></graphml>');
  getAmbiguity(fixture.codec, baseline, baseline.replace(fixture.edge, fixture.getID(fixture.edge.replace('original', 'inserted'), 'a-b-0') + fixture.edge));
});

const structuredCases: Array<{ name: string; codec: GraphDocumentConverter<any>; getSource(edges: any[]): any; getEdge(marker: string, id?: string): any }> = [
  { name: 'D3', codec: d3DocumentConverter, getSource: (edges: any[]) => ({ nodes: [{ id: 'a' }, { id: 'b' }], links: edges }), getEdge: (marker: string, id?: string) => ({ source: 'a', target: 'b', label: 'Same', Marker: marker, ...(id && { id }) }) },
  { name: 'Cytoscape', codec: cytoscapeDocumentConverter, getSource: (edges: any[]) => ({ elements: { nodes: [{ data: { id: 'a' } }, { data: { id: 'b' } }], edges } }), getEdge: (marker: string, id?: string) => ({ data: { source: 'a', target: 'b', label: 'Same', Marker: marker, ...(id && { id }) } }) },
];
for (const fixture of structuredCases) describe(`${fixture.name} declared/generated edge lineage`, () => {
  it('rejects newly explicit IDs colliding with a generated baseline edge', () => {
    const baseline = fixture.getSource([fixture.getEdge('original')]); getAmbiguity(fixture.codec, baseline, fixture.getSource([fixture.getEdge('inserted', 'e0'), fixture.getEdge('original')]));
  });
  it('rejects idless source reordering even when endpoint and label fields are unchanged', () => {
    getAmbiguity(fixture.codec, fixture.getSource([fixture.getEdge('original'), fixture.getEdge('second')]), fixture.getSource([fixture.getEdge('second'), fixture.getEdge('original')]));
  });
  it('allows unchanged idless records and stable declared IDs across native insertion/data updates', () => {
    const unchanged = fixture.codec.from(fixture.getSource([fixture.getEdge('original')])); unchanged.graph!.edges[0].label = 'GraphEdit'; expect(fixture.codec.from(fixture.codec.to(unchanged)).graph!.edges[0].label).toBe('GraphEdit');
    const baseline = fixture.getSource([fixture.getEdge('original', 'original')]), document = fixture.codec.from(baseline);
    document.source = fixture.getSource([fixture.getEdge('inserted', 'inserted'), fixture.getEdge('Native', 'original')]); document.graph!.edges[0].label = 'GraphEdit';
    const graph = fixture.codec.from(fixture.codec.to(document)).graph!; expect(graph.edges.find((edge) => edge.id === 'original')!.label).toBe('GraphEdit'); expect(graph.edges.find((edge) => edge.id === 'inserted')!.label).toBe('Same');
  });
  it('retains source-only updates without applying generated edge edits', () => {
    const document = fixture.codec.from(fixture.getSource([fixture.getEdge('original')])); document.source = fixture.getSource([fixture.getEdge('inserted', 'e0'), fixture.getEdge('original')]); expect(fixture.codec.to(document)).toEqual(document.source);
  });
});

it('rejects stale/duplicate DOT private declarations rather than trusting an earlier marker', () => {
  const encoded = JSON.stringify({ format: 'stately', version: 1, id: 'e0' }).replace(/"/g, '\\"');
  const baseline = dot.replace('Marker="original"', `Marker="original",_stately="${encoded}",_stately="invalid"`);
  getAmbiguity(dotDocumentConverter, baseline, baseline.replace('a->b', 'a->b[label="Same",Marker="inserted"];a->b'));
  const original = dot.replace('Marker="original"', `Marker="original",_stately="${encoded}"`), duplicate = original.replace('}', `a->b[label="Same",_stately="${encoded}"];}`), document = dotDocumentConverter.from(duplicate);
  expect(document.graph).toBeNull(); expect(document.diagnostics.some((item) => item.code === 'projection-unavailable')).toBe(true);
});
it('rejects duplicate or header-only Graphviz private identities', () => {
  const baseline = toGraphvizJSON(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'original', sourceId: 'a', targetId: 'b', label: 'Same' }] }));
  const duplicate = graphvizJSONDocumentConverter.from(baseline); duplicate.source.edges = [{ ...baseline.edges![0], _gvid: 0 }, { ...baseline.edges![0], _gvid: 1 }]; duplicate.graph!.edges[0].label = 'GraphEdit'; expect(() => graphvizJSONDocumentConverter.to(duplicate)).toThrow();
  const header: GraphvizJSON = { ...gv, edges: [{ ...gv.edges![0], _stately: JSON.stringify({ kind: '@statelyai/graph', format: 'graphviz-json.edge', version: 2, original: {}, mapped: {} }) }] };
  getAmbiguity(graphvizJSONDocumentConverter, header, { ...header, edges: [{ ...gv.edges![0], Marker: 'inserted' }, { ...header.edges![0], _gvid: 1 }] });
  const conflicting = JSON.parse(JSON.stringify(baseline)) as GraphvizJSON; conflicting.edges![0]._stately_1 = conflicting.edges![0]._stately;
  const document = graphvizJSONDocumentConverter.from(conflicting); document.source.edges = [{ ...gv.edges![0], Marker: 'inserted' }, { ...conflicting.edges![0], _gvid: 1 }]; document.graph!.edges[0].label = 'GraphEdit'; expect(() => graphvizJSONDocumentConverter.to(document)).toThrow();
});
it('GML private originalId remains stable while repeated invalid carriers cannot authorize a generated ID', () => {
  const fixture = xmlCases[2], marker = '{"format":"stately","version":1,"originalId":"original"}'.replace(/"/g, '&quot;');
  const original = fixture.edge.replace('edge [', `edge [ stately "${marker}"`), document = gmlDocumentConverter.from(fixture.wrap(original));
  document.source = fixture.wrap(fixture.getID(fixture.edge.replace('original', 'inserted'), 'inserted') + original); document.graph!.edges[0].label = 'GraphEdit'; expect(gmlDocumentConverter.from(gmlDocumentConverter.to(document)).graph!.edges.find((edge) => edge.id === 'original')!.label).toBe('GraphEdit');
  const invalid = fixture.edge.replace('edge [', 'edge [ stately "{&quot;format&quot;:&quot;stately&quot;,&quot;version&quot;:1,&quot;originalId&quot;:&quot;e0&quot;}" stately "invalid"');
  const collision = gmlDocumentConverter.from(fixture.wrap(invalid)); collision.source = fixture.wrap(fixture.getID(fixture.edge.replace('original', 'inserted'), 'e0') + invalid); collision.graph!.edges[0].label = 'GraphEdit';
  const result = gmlDocumentConverter.getUpdate(collision); expect(result.ok).toBe(false); if (!result.ok) expect(result.diagnostics.some((item) => item.code === 'invalid-projection' && item.message.includes('Duplicate edge IDs'))).toBe(true);
});
for (const fixture of xmlCases) it(`${fixture.name} stable node labels remain editable after edge identity collisions`, () => {
  const plain = fixture.wrap(fixture.edge), baseline = fixture.name === 'GraphML' ? plain.replace('<node id="a"/>', '<node id="a"><data key="label">Before</data></node>') : plain;
  const document = fixture.codec.from(baseline), generated = document.graph!.edges[0].id;
  document.source = baseline.replace(fixture.edge, fixture.getID(fixture.edge.replace('original', 'inserted'), generated) + fixture.edge); document.graph!.nodes[0].label = 'NodeEdit';
  const output = fixture.codec.to(document); expect(fixture.codec.from(output).graph!.nodes[0].label).toBe('NodeEdit');
});
