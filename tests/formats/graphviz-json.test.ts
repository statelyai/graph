import { getUserData } from '../../src/formats/xml-preservation';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromGraphvizJSON, toGraphvizJSON, graphvizJSONDocumentConverter, type GraphvizJSON } from '../../src/formats/graphviz-json';
import { getCarrierData } from '../../src/formats/preservation';
function getGraph(graph: ReturnType<typeof fromGraphvizJSON>) { return { ...graph, data: getCarrierData(graph.data, 'graphviz-json') }; }
function getFixture(name: string): GraphvizJSON { return JSON.parse(readFileSync(new URL(`../native/fixtures/graphviz/${name}.json`, import.meta.url), 'utf8')); }
describe('Graphviz JSON output profile', () => {
  it('preserves selected Graph fields through JSON-native string carriers', () => {
    const graph = createGraph({ id: 'G', data: [null, { _stately: 'USER' }], nodes: [{ id: 'parent', label: null, data: 42 }, { id: 'leaf', parentId: 'parent', label: '', x: 1, y: 2, width: 3, height: 4, style: { fill: 'red' } }], edges: [{ id: 'edge', sourceId: 'leaf', targetId: 'parent', label: 'A\nB', weight: 2.5, data: false }] });
    const source = JSON.parse(JSON.stringify(toGraphvizJSON(graph)));
    expect(getGraph(fromGraphvizJSON(source))).toEqual(graph);
    expect(source._subgraph_cnt).toBe(1);
    expect(typeof source.objects[0]._stately).toBe('string');
  });
  it.each(['strict-ports', 'clusters-ranks', 'parallel-undirected'])('retains all actual generated %s JSON and drawing operations', (name) => {
    const source = getFixture(name);
    expect(toGraphvizJSON(JSON.parse(JSON.stringify(fromGraphvizJSON(source))))).toEqual(source);
    expect(graphvizJSONDocumentConverter.to(JSON.parse(JSON.stringify(graphvizJSONDocumentConverter.from(source))))).toEqual(source);
  });
  it('requires explicit geometry conversion and uses point units, flipped Y and top-left corners', () => {
    const source: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, bb: '0,0,100,200', objects: [{ _gvid: 0, name: 'a', pos: '50,150', width: '1', height: '0.5' }], edges: [] };
    expect(fromGraphvizJSON(source).nodes[0].x).toBeUndefined();
    expect(fromGraphvizJSON(source, { geometry: 'points' }).nodes[0]).toMatchObject({ x: 14, y: 32, width: 72, height: 36 });
  });
  it('rejects stale layout/drawing edits and permits explicit regeneration', () => {
    const graph = fromGraphvizJSON(getFixture('strict-ports'));
    graph.nodes[0].label = 'CHANGED';
    expect(() => toGraphvizJSON(graph)).toThrow(/stale/);
    const fresh = toGraphvizJSON(graph, { regenerate: true });
    expect(fresh.objects![0]._draw_).toBeUndefined();
    expect(fresh.objects![0].label).toBe('CHANGED');
  });
  it('patches unlaid literal labels while retaining independent source attributes', () => {
    const source: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, objects: [{ _gvid: 0, name: 'a', label: 'Old', vendor: 'KEEP' }], edges: [] };
    const document = graphvizJSONDocumentConverter.from(source);
    document.source.objects![0].vendor = 'NATIVE'; document.graph!.nodes[0].label = 'NEW';
    expect(graphvizJSONDocumentConverter.to(document).objects![0]).toMatchObject({ label: 'NEW', vendor: 'NATIVE' });
    const conflict = graphvizJSONDocumentConverter.from(source);
    conflict.source.objects![0].label = ''; conflict.graph!.nodes[0].label = 'GRAPH';
    expect(() => graphvizJSONDocumentConverter.to(conflict)).toThrow(/conflict/);
  });
  it.each([ (source: GraphvizJSON) => { source.objects![0]._gvid = 2; }, (source: GraphvizJSON) => { source.edges![0].head = 99; }, (source: GraphvizJSON) => { source._subgraph_cnt = 3; } ])('rejects malformed native index references', (edit) => {
    const source: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, objects: [{ _gvid: 0, name: 'a' }], edges: [{ _gvid: 0, tail: 0, head: 0 }] };
    edit(source); expect(() => fromGraphvizJSON(source)).toThrow(/Graphviz JSON/);
    expect(graphvizJSONDocumentConverter.from(source).graph).toBeNull();
  });
  it('rejects cyclic subgraphs and requested structural changes', () => {
    expect(() => fromGraphvizJSON({ name: 'G', directed: true, strict: false, _subgraph_cnt: 2, objects: [{ _gvid: 0, name: 'cluster_a', subgraphs: [1] }, { _gvid: 1, name: 'cluster_b', subgraphs: [0] }] })).toThrow(/cyclic/);
    const source = toGraphvizJSON(createGraph({ nodes: [{ id: 'a' }] }));
    const graph = fromGraphvizJSON(source); graph.nodes.push({ ...graph.nodes[0], id: 'new' });
    expect(() => toGraphvizJSON(graph)).toThrow(/structural/);
  });
});

it('retains primitive user data alongside independently added native attributes', () => {
  const source = toGraphvizJSON(createGraph({ nodes: [{ id: 'a', label: 'OLD', data: 42 }] }));
  const document = graphvizJSONDocumentConverter.from(source);
  document.source.objects![0].vendor = 'KEEP'; document.graph!.nodes[0].label = 'NEW';
  const graph = fromGraphvizJSON(graphvizJSONDocumentConverter.to(document));
  expect(graph.nodes[0].label).toBe('NEW'); expect(getUserData(graph.nodes[0].data, 'graphviz-json')).toBe(42);
  expect(graph.nodes[0].data['_graphviz-json'].native.vendor).toBe('KEEP');
});
it('rejects duplicate strict edges, malformed attribute types and invalid membership domains', () => {
  const source: GraphvizJSON = { name: 'G', directed: true, strict: true, _subgraph_cnt: 0, objects: [{ _gvid: 0, name: 'a' }], edges: [{ _gvid: 0, tail: 0, head: 0 }, { _gvid: 1, tail: 0, head: 0 }] };
  expect(() => fromGraphvizJSON(source)).toThrow(/strict/);
  for (const field of [{ weight: 'NaN' }, { width: 'x' }, { pos: 'garbage' }, { bb: '1,2,3' }, { _draw_: {} }, { label: false }, { nodes: [0] }]) {
    expect(() => fromGraphvizJSON({ ...source, strict: false, edges: [], objects: [{ ...source.objects![0], ...field }] })).toThrow(/Graphviz JSON/);
  }
});

it('rejects stale root-only layout bounds during literal label edits', () => {
  const source: GraphvizJSON = { name: 'G', directed: true, strict: false, _subgraph_cnt: 0, bb: '0 0 100 100', objects: [{ _gvid: 0, name: 'a', label: 'OLD' }] };
  const graph = fromGraphvizJSON(source); graph.nodes[0].label = 'NEW';
  expect(() => toGraphvizJSON(graph)).toThrow(/stale/);
});
