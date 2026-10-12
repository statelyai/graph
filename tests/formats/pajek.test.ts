import { getUserData } from '../../src/formats/xml-preservation';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromPajek, toPajek, pajekDocumentConverter } from '../../src/formats/pajek';
import { getCarrierData } from '../../src/formats/preservation';
function getGraph(graph: ReturnType<typeof fromPajek>) { return { ...graph, data: getCarrierData(graph.data, 'pajek') }; }
const native = '% KEEP\n*Network "Native"\n*Vertices 3\n1 "same"\n2 "same"\n3\n*Arcs\n1 2 2.5 l "OLD"\n1 2 3\n3 3 0\n';
describe('bounded Pajek .net profile', () => {
  it('preserves selected Graph fields/data without using labels as identity', () => {
    const graph = createGraph({ id: '', mode: 'undirected', data: [null, { constructor: 'USER' }], initialNodeId: '0', nodes: [{ id: '0', label: null, data: false, x: 1, y: 2 }, { id: '1', label: '', parentId: '0', ports: [{ name: 'p', data: [1] }] }], edges: [{ id: 'pajek:edge:0', sourceId: '0', targetId: '1', targetPort: 'p', label: '', weight: 0, data: 42 }] });
    expect(getGraph(fromPajek(toPajek(graph)))).toEqual(graph);
  });
  it('keeps distinct repeated-label vertices, parallel edges, zero weights and implicit isolates', () => {
    const graph = fromPajek(native);
    expect(graph.nodes.map((node) => [node.id, node.label])).toEqual([['1', 'same'], ['2', 'same'], ['3', null]]);
    expect(graph.edges).toHaveLength(3); expect(graph.edges[0].weight).toBe(2.5); expect(graph.edges[2].weight).toBe(0);
    expect(toPajek(JSON.parse(JSON.stringify(graph)))).toBe(native);
  });
  it('preserves exact comments/order/newlines after document persistence and no-op source changes', () => {
    const source = native.replace(/\n/g, '\r\n');
    const document = JSON.parse(JSON.stringify(pajekDocumentConverter.from(source)));
    document.source = '% NATIVE\r\n' + source;
    expect(pajekDocumentConverter.to(document)).toBe(document.source);
  });
  it('patches literal node/edge labels and retains independent source comments/unknown attributes', () => {
    const document = pajekDocumentConverter.from(native);
    document.source = document.source.replace('1 "same"', '1 "same" 0.1 0.2 ellipse ic Red');
    document.graph!.nodes[0].label = 'CHANGED α'; document.graph!.edges[0].label = 'EDGE';
    const output = pajekDocumentConverter.to(document);
    expect(output).toContain('1 "CHANGED α" 0.1 0.2 ellipse ic Red'); expect(output).toContain('2.5 l "EDGE"'); expect(output).toContain('% KEEP');
  });
  it('adds a literal label for an implicit vertex and a missing edge label', () => {
    const source = '*Vertices 3\n1 "A"\n2\n*Edges\n1 2 1\n';
    const document = pajekDocumentConverter.from(source);
    document.graph!.nodes[2].label = 'ISOLATED'; document.graph!.edges[0].label = '';
    const output = pajekDocumentConverter.to(document);
    expect(output).toContain('3 "ISOLATED"\n*Edges'); expect(output).toContain('1 2 1 l ""');
  });
  it('keeps native label/weight/mode edits authoritative over private carriers', () => {
    const graph = createGraph({ nodes: [{ id: 'a', label: null }, { id: 'b', label: '' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: null }] });
    const source = toPajek(graph).replace('\n1\n', '\n1 ""\n').replace('*Arcs', '*Edges').replace('\n1 2 1\n', '\n1 2 2.5 l ""\n');
    const result = fromPajek(source);
    expect(result.nodes[0].label).toBe(''); expect(result.edges[0]).toMatchObject({ label: '', weight: 2.5, mode: 'undirected' });
    expect(result.mode).toBe('undirected');
  });
  it('reports same-field native/Graph conflicts', () => {
    const document = pajekDocumentConverter.from(native);
    document.source = native.replace('1 "same"', '1 "NATIVE"'); document.graph!.nodes[0].label = 'GRAPH';
    expect(() => pajekDocumentConverter.to(document)).toThrow(/conflict/);
  });
  it('rejects ambiguous foreign edge attribute changes alongside requested edge labels', () => {
    const document = pajekDocumentConverter.from(native);
    document.source = native.replace('1 2 2.5', '1 2 4'); document.graph!.edges[0].label = 'GRAPH';
    expect(() => pajekDocumentConverter.to(document)).toThrow(/ambiguous/);
  });
  it('permits independent new native vertices with a stable existing vertex-label patch', () => {
    const source = '*Vertices 1\n1 "OLD"\n*Edges\n';
    const document = pajekDocumentConverter.from(source); document.source = source.replace('*Vertices 1', '*Vertices 2').replace('*Edges', '2 "ADDED"\n*Edges'); document.graph!.nodes[0].label = 'GRAPH';
    const result = fromPajek(pajekDocumentConverter.to(document)); expect(result.nodes.map((node) => node.label)).toEqual(['GRAPH', 'ADDED']);
  });
  it.each(['*Vertices 2\n*Arcs\n1 2 1\n*Edges\n1 2 1\n', '*Vertices 2\n*Matrix\n0 1\n1 0\n', '*Vertices 2\n*Arcslist\n1 2\n', '*Vertices 2 1\n', '*Vertices 2\n1 "a" [1-2]\n', '*Vertices 1\n1 "a"\n*Edges\n1 2 1\n'])('rejects unsupported/invalid source while retaining exact document bytes', (source) => {
    expect(() => fromPajek(source)).toThrow(); const document = pajekDocumentConverter.from(source); expect(document.graph).toBeNull(); expect(pajekDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
  });
  it.each(['a"b', 'a\nb', '\ud800', 'a\u0000b'])('rejects unrepresentable native visible labels: %j', (label) => { expect(() => toPajek(createGraph({ nodes: [{ id: 'a', label }] }))).toThrow(/label/); });
  it('rejects requested structural edits and genuine mixed/bidirectional output', () => {
    const document = pajekDocumentConverter.from(native); document.graph!.nodes.push({ ...document.graph!.nodes[0], id: 'NEW' }); expect(() => pajekDocumentConverter.to(document)).toThrow(/unsupported/);
    expect(() => toPajek(createGraph({ mode: 'bidirectional', nodes: [{ id: 'a' }] }))).toThrow(/mode/);
  });
});

it('emits only a header capsule outside fixed-count native vertex/edge rows', () => {
  const source = toPajek(createGraph({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }] }));
  expect(source.split('\n').filter((line) => line.startsWith('%'))).toHaveLength(1);
  expect(source).toContain('*Vertices 2\n1 "A"\n2 "B"\n*Arcs\n1 2 1');
  const capsule = JSON.parse(source.split('\n')[0].split('document ')[1]);
  const legacy = `% @statelyai/graph/pajek graph ${JSON.stringify(capsule.graph)}\n*Vertices 2\n% @statelyai/graph/pajek node ${JSON.stringify(capsule.nodes[0].metadata)}\n1 "A"\n% @statelyai/graph/pajek node ${JSON.stringify(capsule.nodes[1].metadata)}\n2 "B"\n*Arcs\n% @statelyai/graph/pajek edge ${JSON.stringify(capsule.edges[0].metadata)}\n1 2 1\n`;
  expect(getGraph(fromPajek(legacy))).toEqual(getGraph(fromPajek(source)));
  expect(() => fromPajek(source.split('\n')[0] + '\n' + source)).toThrow(/ambiguous/);
});
it('retains primitive user data alongside independently added native row attributes', () => {
  const document = pajekDocumentConverter.from(toPajek(createGraph({ nodes: [{ id: 'a', label: 'OLD', data: 42 }] })));
  document.source = document.source.replace('1 "OLD"', '1 "OLD" ic Red'); document.graph!.nodes[0].label = 'NEW';
  const graph = fromPajek(pajekDocumentConverter.to(document));
  expect(graph.nodes[0].label).toBe('NEW'); expect(getUserData(graph.nodes[0].data, 'pajek')).toBe(42);
  expect(graph.nodes[0].data._pajek.native.attributes).toEqual(['ic', 'Red']);
});
