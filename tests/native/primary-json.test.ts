import { describe, it, expect } from 'vitest';
import Graphology from 'graphology';
import { json } from '@dagrejs/graphlib';
import { createGraph } from '../../src/graph';
import { toGraphologyJSON, fromGraphologyJSON, graphologyDocumentConverter } from '../../src/formats/graphology';
import { toGraphlibJSON, fromGraphlibJSON, graphlibDocumentConverter } from '../../src/formats/graphlib';
import { toNetworkXNodeLink, fromNetworkXNodeLink } from '../../src/formats/networkx';
import { getCarrierData } from '../../src/formats/preservation';
import { getNetworkXOracle } from './networkx-oracle';

function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
describe('Graphology adapter independent native reader', () => {
  it('observes mixed modes, parallel multiplicity, self-loop, isolates and full data values', () => {
    const graph = createGraph<any, any, any>({ mode: 'undirected', data: 42, nodes: [{ id: 'a', label: '', data: [1, null] }, { id: 'b', data: null }, { id: 'isolated' }, { id: 'empty' }], edges: [{ id: 'd', sourceId: 'a', targetId: 'b', mode: 'directed' }, { id: 'u', sourceId: 'b', targetId: 'a' }, { id: 'p', sourceId: 'a', targetId: 'b' }, { id: 'loop', sourceId: 'empty', targetId: 'empty' }] });
    graph.nodes[3].id = ''; graph.edges[3].sourceId = ''; graph.edges[3].targetId = '';
    const source = toGraphologyJSON(graph); const native = Graphology.from(getPersisted(source));
    expect(native.type).toBe('mixed'); expect(native.order).toBe(4); expect(native.size).toBe(4);
    expect(native.directedEdges('a', 'b')).toEqual(['d']); expect(native.undirectedEdges('a', 'b')).toEqual(['p', 'u']);
    expect(native.degree('isolated')).toBe(0); expect(native.hasEdge('', '')).toBe(true);
    expect(native.getNodeAttribute('a', 'label')).toBe(''); expect(native.getNodeAttribute('a', 'data')).toEqual([1, null]); expect(native.getAttribute('data')).toBe(42);
    native.setNodeAttribute('a', 'label', 'Actual edit'); native.setNodeAttribute('a', 'unknown', { preserved: true });
    const exported = native.export(); const graphEdit = fromGraphologyJSON(exported); graphEdit.nodes[0].x = 10;
    const second = Graphology.from(toGraphologyJSON(getPersisted(graphEdit)));
    expect(second.getNodeAttribute('a', 'label')).toBe('Actual edit'); expect(second.getNodeAttribute('a', 'unknown')).toEqual({ preserved: true }); expect(second.getNodeAttribute('a', 'x')).toBe(10);
  });
  it('validates source-authored metadata changes and document patches through the actual reader', () => {
    const native = new Graphology({ type: 'mixed', multi: true }); native.addNode('a', { label: 'A', vendor: 42 }); native.addNode('b'); native.addUndirectedEdgeWithKey('e', 'a', 'b', { weight: 1 });
    const document = getPersisted(graphologyDocumentConverter.from(native.export())); document.source.nodes.reverse(); document.source.nodes.push({ key: 'added' }); document.graph!.nodes[0].label = 'Changed'; document.graph!.edges[0].weight = 2;
    const reader = Graphology.from(graphologyDocumentConverter.to(document)); expect(reader.nodes()).toEqual(['b', 'a', 'added']); expect(reader.getNodeAttribute('a', 'label')).toBe('Changed'); expect(reader.getNodeAttribute('a', 'vendor')).toBe(42); expect(reader.getEdgeAttribute('e', 'weight')).toBe(2); expect(reader.isUndirected('e')).toBe(true);
  });
  it.each(['constructor', '__proto__', 'toString'])('rejects %s before known native adjacency failure', (id) => {
    expect(() => toGraphologyJSON(createGraph({ nodes: [{ id: 'a' }, { id }], edges: [{ id: 'e', sourceId: 'a', targetId: id }] }))).toThrow('unsafe');
    const native = new Graphology({ multi: true }); native.addNode('a'); native.addNode(id); native.addDirectedEdgeWithKey('e', 'a', id);
    expect(() => native.directedEdges('a', id)).toThrow();
  });
  it('reads bounded large output with stable ordered node and edge identities', () => {
    const nodes = Array.from({ length: 2000 }, (_, index) => ({ id: `n${index}` })); const edges = nodes.slice(1).map((node, index) => ({ id: `e${index}`, sourceId: nodes[index].id, targetId: node.id }));
    const native = Graphology.from(toGraphologyJSON(createGraph({ nodes, edges })));
    expect(native.order).toBe(2000); expect(native.size).toBe(1999); expect(native.extremities('e1998')).toEqual(['n1998', 'n1999']);
  });
});
describe('Graphlib adapter independent native reader', () => {
  it.each([false, true])('native reader proves inserted/retargeted edges and keys, multigraph=%s', (multigraph) => {
    const source = { options: { directed: true, multigraph, compound: false }, nodes: [{ v: 'a' }, { v: 'b' }, { v: 'c' }], edges: [{ v: 'a', w: 'b', ...(multigraph && { name: 'old' }), value: { data: [42], __statelyai: { foreign: true } } }] };
    const graph = fromGraphlibJSON(source); const oldId = graph.edges[0].id; graph.edges[0].targetId = 'c'; graph.nodes.push({ type: 'node', id: 'added', label: '', data: null });
    graph.edges.push({ type: 'edge', id: 'new', sourceId: 'b', targetId: 'added', label: 'New', data: [1, null] }); graph.nodes.reverse(); graph.edges.reverse();
    const output = toGraphlibJSON(graph); const native = json.read(getPersisted(output));
    expect(native.hasEdge('a', 'c', multigraph ? 'old' : undefined)).toBe(true); expect(native.hasEdge('b', 'added', multigraph ? 'new' : undefined)).toBe(true); expect(native.hasEdge('a', 'b', multigraph ? 'old' : undefined)).toBe(false);
    expect(native.edge('a', 'c', multigraph ? 'old' : undefined).data).toEqual([42]); expect(native.edge('a', 'c', multigraph ? 'old' : undefined).__statelyai).toEqual({ foreign: true }); expect(native.edge('b', 'added', multigraph ? 'new' : undefined).label).toBe('New');
    const restored = fromGraphlibJSON(json.write(native)); expect(restored.edges.map((edge) => edge.id)).toEqual(['new', oldId]); expect(restored.edges[0].data).toEqual([1, null]);
    graph.edges.push({ type: 'edge', id: 'parallel', sourceId: 'b', targetId: 'added', label: '', data: null });
    if (multigraph) { const reader = json.read(toGraphlibJSON(graph)); expect(reader.edgeCount()).toBe(3); expect(reader.hasEdge('b', 'added', 'parallel')).toBe(true); }
    else expect(() => toGraphlibJSON(graph)).toThrow('duplicate');
  });
  it.each(['directed', 'undirected'] as const)('observes %s native topology, names and compound parents', (mode) => {
    const graph = createGraph<any, any, any>({ mode, data: null, nodes: [{ id: 'parent' }, { id: 'empty', parentId: 'parent', label: '', data: [1, null] }, { id: 'b', data: 42 }, { id: 'isolated' }], edges: [{ id: 'first', sourceId: 'empty', targetId: 'b' }, { id: 'zero', sourceId: 'empty', targetId: 'b', weight: 0 }, { id: 'loop', sourceId: 'b', targetId: 'b' }] });
    graph.nodes[1].id = ''; graph.edges[0].sourceId = ''; graph.edges[1].sourceId = ''; graph.edges[1].id = '';
    const native = json.read(getPersisted(toGraphlibJSON(graph))); expect(native.isDirected()).toBe(mode === 'directed'); expect(native.isMultigraph()).toBe(true); expect(native.isCompound()).toBe(true);
    expect(native.nodeCount()).toBe(4); expect(native.edgeCount()).toBe(3); expect(native.parent('')).toBe('parent'); expect(native.node('').data).toEqual([1, null]); expect(native.edge('', 'b', '').weight).toBe(0);
    expect(native.nodeEdges('isolated')).toEqual([]); expect(native.hasEdge('b', 'b', 'loop')).toBe(true);
    native.node('').label = 'Native label'; native.node('').custom = [42]; const restored = fromGraphlibJSON(json.write(native)); restored.nodes.find((node) => node.id === '')!.x = 2;
    const reader = json.read(toGraphlibJSON(restored)); expect(reader.node('').label).toBe('Native label'); expect(reader.node('').custom).toEqual([42]); expect(reader.node('').x).toBe(2);
  });
  it('keeps authored opaque values and precise named tuple identity in documents', () => {
    const source = { options: { directed: true, multigraph: true, compound: false }, value: [1, null], nodes: [{ v: '', value: 42 }, { v: 'b', value: null }, { v: 'c', value: false }], edges: [{ v: '', w: 'b', name: 'same', value: ['edge'] }, { v: 'b', w: 'c', name: 'same', value: 0 }] };
    const doc = getPersisted(graphlibDocumentConverter.from(source)); expect(graphlibDocumentConverter.to(doc)).toEqual(source); expect(new Set(doc.graph!.edges.map((edge) => edge.id)).size).toBe(2);
    doc.graph!.nodes[0].data = 43; const native = json.read(graphlibDocumentConverter.to(doc)); expect(native.node('')).toBe(43); expect(native.graph()).toEqual([1, null]); expect(native.edge('', 'b', 'same')).toEqual(['edge']);
  });
  it('guards native __proto__ compound failure before exporting', () => {
    expect(() => toGraphlibJSON(createGraph({ nodes: [{ id: '__proto__' }, { id: 'child', parentId: '__proto__' }] }))).toThrow('unsafe');
    expect(() => json.read({ options: { directed: true, multigraph: true, compound: true }, nodes: [{ v: 'parent' }, { v: '__proto__', parent: 'parent' }], edges: [] })).toThrow();
  });
  it('reads a deep native hierarchy without adapter recursion', () => {
    const nodes = Array.from({ length: 2000 }, (_, index) => ({ id: `n${index}`, ...(index && { parentId: `n${index - 1}` }) }));
    const native = json.read(toGraphlibJSON(createGraph({ nodes }))); expect(native.nodeCount()).toBe(2000); expect(native.parent('n1999')).toBe('n1998');
  });
});
describe('NetworkX inserted/retargeted identities through actual Python native reader', () => {
  it.each([false, true])('native scalar endpoints and Graph edge identities survive, multigraph=%s', async (multigraph) => {
    const source = { directed: true, multigraph, graph: {}, nodes: [{ id: 1 }, { id: '1' }, { id: 2 }], edges: [{ source: 1, target: '1', ...(multigraph && { key: 42 }), data: [42], __statelyai: { foreign: true } }] };
    const graph = fromNetworkXNodeLink(source); const oldId = graph.edges[0].id; graph.edges[0].targetId = graph.nodes[2].id; graph.nodes.push({ type: 'node', id: 'added', label: '', data: null });
    graph.edges.push({ type: 'edge', id: 'new', sourceId: graph.nodes[1].id, targetId: 'added', label: 'New', data: [1, null] }); graph.edges.reverse(); graph.nodes.reverse();
    const output = toNetworkXNodeLink(getPersisted(graph)); const oracle = await getNetworkXOracle({ operation: 'node-link', data: output, options: { edges: 'edges' } });
    if (!oracle.summary) throw new Error('NetworkX oracle did not return node-link summary');
    expect(oracle.summary.directed).toBe(true); expect(oracle.summary.multigraph).toBe(multigraph); expect(oracle.summary.nodes.map((node) => node.id)).toEqual(['added', 2, '1', 1]);
    const old = oracle.summary.edges.find((edge) => edge.source === 1 && edge.target === 2)!; const added = oracle.summary.edges.find((edge) => edge.source === '1' && edge.target === 'added')!;
    expect(old).toBeDefined(); expect(added.attributes.label).toBe('New'); expect(old.attributes.data).toEqual([42]); expect(old.attributes.__statelyai).toEqual({ foreign: true });
    if (multigraph) { expect(old.key).toBe(42); expect(added.key).toBe('new'); } else { expect(old.key).toBeUndefined(); expect(added.key).toBeUndefined(); }
    const restored = fromNetworkXNodeLink(output); expect(restored.edges.map((edge) => edge.id)).toEqual(['new', oldId]); expect(restored.edges[0].data).toEqual([1, null]); expect(getCarrierData(restored.data, 'networkx')).toEqual({});
    graph.edges.push({ type: 'edge', id: 'parallel', sourceId: graph.edges[0].sourceId, targetId: 'added', label: '', data: null });
    if (multigraph) expect((await getNetworkXOracle({ operation: 'node-link', data: toNetworkXNodeLink(graph), options: { edges: 'edges' } })).summary!.edges).toHaveLength(3);
    else expect(() => toNetworkXNodeLink(graph)).toThrow('duplicate');
  });
});
