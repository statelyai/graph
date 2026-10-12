import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromGraphologyJSON, toGraphologyJSON, graphologyDocumentConverter } from '../../src/formats/graphology';
import { fromGraphlibJSON, toGraphlibJSON, graphlibDocumentConverter } from '../../src/formats/graphlib';
import { fromNetworkXNodeLink, toNetworkXNodeLink, networkxDocumentConverter } from '../../src/formats/networkx';
import { getNativeDocumentGraph, getCarrierData } from '../../src/formats/preservation';

function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const cases = [
  { format: 'graphology', to: toGraphologyJSON, from: fromGraphologyJSON, document: graphologyDocumentConverter },
  { format: 'graphlib', to: toGraphlibJSON, from: fromGraphlibJSON, document: graphlibDocumentConverter },
  { format: 'networkx', to: toNetworkXNodeLink, from: fromNetworkXNodeLink, document: networkxDocumentConverter },
];
function createFixture() {
  return createGraph<any, any, any>({ id: 'root', data: [null, 'graph'], nodes: [
    { id: 'a', label: null, data: 42, x: 0, style: { fill: 'red' }, ports: [{ name: 'out', data: null }] },
    { id: 'b', label: '', data: { label: 'user', __statelyai: { foreign: true }, __statelyaiNative: { arbitrary: true } } },
    { id: 'isolated', data: null },
  ], edges: [{ id: 'e0', sourceId: 'a', targetId: 'b', label: '', data: [1, null], weight: 0 },
    { id: 'e1', sourceId: 'a', targetId: 'b', data: null }, { id: 'loop', sourceId: 'b', targetId: 'b', label: null }] });
}
describe.each(cases)('$format JSON adapter', ({ format, to, from, document }) => {
  it('preserves complete JSON Graph semantics, nulls, optional fields and input independence', () => {
    const graph = createFixture(); const before = getPersisted(graph);
    const source = (to as any)(graph); const restored = (from as any)(getPersisted(source));
    expect(getPersisted(getNativeDocumentGraph(restored, format, source))).toEqual(before);
    expect(getPersisted(graph)).toEqual(before);
    expect(document.to(getPersisted(document.from(source as any)) as any)).toEqual(source);
  });
  it('applies live native labels without restoring stale snapshots', () => {
    const source = (to as any)(createFixture());
    const native = format === 'graphology' ? source.nodes[0].attributes : format === 'graphlib' ? source.nodes[0].value : source.nodes[0];
    native.label = 'native edit'; native.custom = { untouched: true };
    const graph = (from as any)(source); expect(graph.nodes[0].label).toBe('native edit');
    const result = (to as any)(getPersisted(graph));
    const output = format === 'graphology' ? result.nodes[0].attributes : format === 'graphlib' ? result.nodes[0].value : result.nodes[0];
    expect(output.label).toBe('native edit'); expect(output.custom).toEqual({ untouched: true });
  });
  it('native edits to emitted data update the actual user payload, unknown attributes remain independent', () => {
    const source = (to as any)(createFixture());
    const native = format === 'graphology' ? source.nodes[0].attributes : format === 'graphlib' ? source.nodes[0].value : source.nodes[0];
    native.data = [3, null]; native.other = { untouched: true };
    const graph = (from as any)(source); expect(graph.nodes[0].data).toEqual([3, null]);
    graph.nodes[0].label = 'Graph edit'; const output = (to as any)(graph);
    const attrs = format === 'graphology' ? output.nodes[0].attributes : format === 'graphlib' ? output.nodes[0].value : output.nodes[0];
    expect(attrs.data).toEqual([3, null]); expect(attrs.other).toEqual({ untouched: true }); expect(attrs.label).toBe('Graph edit');
  });
  it('patches generated metadata user data and labels after persistence', () => {
    const source = (to as any)(createFixture()); const doc: any = getPersisted(document.from(source as any));
    doc.graph.nodes[0].label = 'Changed'; doc.graph.nodes[0].data = { replaced: true };
    const result: any = document.to(doc); const restored = getNativeDocumentGraph((from as any)(result), format, result);
    expect(restored.nodes[0].label).toBe('Changed'); expect(restored.nodes[0].data).toEqual({ replaced: true });
  });
  it('rejects structural document edits, permits source-only edits, diagnoses field conflicts', () => {
    const source = (to as any)(createFixture()); const doc: any = document.from(source as any);
    doc.graph.nodes.reverse(); expect(document.getUpdate(doc).ok).toBe(false);
    const fresh: any = document.from(source as any);
    const native = format === 'graphology' ? fresh.source.nodes[0].attributes : format === 'graphlib' ? fresh.source.nodes[0].value : fresh.source.nodes[0];
    native.label = 'source'; expect(document.to(fresh)).toEqual(fresh.source);
    fresh.graph.nodes[0].label = 'requested'; expect(document.getUpdate(fresh).ok).toBe(false);
  });
  it('rejects bidirectional modes', () => {
    const graph = createFixture(); graph.edges[0].mode = 'bidirectional';
    expect(() => (to as any)(graph)).toThrow();
  });
  it('preserves foreign reserved payloads through explicit native import and raw export', () => {
    const graph = createFixture(); graph.data = { __statelyaiNative: { kind: '@statelyai/graph/native', version: 1, provenance: 'native-import', format, data: 'foreign', native: { anything: true }, baseline: { anything: true } }, sibling: 1 };
    const source = (to as any)(graph, { nativeCarrier: false }); const doc: any = getPersisted(document.from(source));
    expect(doc.graph.data).toEqual(graph.data); doc.graph.data.sibling = 2;
    const output = document.to(doc); expect(getNativeDocumentGraph((from as any)(output), format, output).data).toEqual({ ...graph.data, sibling: 2 });
    const nativeGraph = (from as any)(source, { metadata: 'native' }); expect(nativeGraph.nodes[0].data.__statelyai).toHaveProperty('origin', `@statelyai/graph/${format}`);
  });
  it('retains extras on surviving stable IDs after reorder, insertion and deletion', () => {
    const source = (to as any)(createFixture());
    const attrs = (node: any) => format === 'graphology' ? node.attributes : format === 'graphlib' ? node.value : node;
    attrs(source.nodes[0]).unknown = 'a'; attrs(source.nodes[1]).unknown = 'b';
    const graph = (from as any)(source); graph.nodes.reverse(); graph.nodes.pop(); graph.edges = [];
    graph.nodes.push({ type: 'node', id: 'new', label: '', data: null });
    const output = (to as any)(getPersisted(graph));
    expect(output.nodes.map((node: any) => node.key ?? node.v ?? node.id)).toEqual(['isolated', 'b', 'new']);
    expect(attrs(output.nodes[1]).unknown).toBe('b'); expect(attrs(output.nodes[2]).unknown).toBeUndefined();
  });
});
describe('native foreign JSON preservation and validation', () => {
  it.each(cases)('$format invalid protocol snapshots remain ordinary typed-safe native data', ({ format, to, from }) => {
    const getAttributes = (source: any, kind: string) => kind === 'graph' ? (format === 'graphology' ? source.attributes : format === 'graphlib' ? source.value : source.graph) : (format === 'graphology' ? source[kind === 'node' ? 'nodes' : 'edges'][0].attributes : format === 'graphlib' ? source[kind === 'node' ? 'nodes' : 'edges'][0].value : source[kind === 'node' ? 'nodes' : 'edges'][0]);
    for (const [kind, field, value] of [['node', 'label', 42], ['node', 'x', null], ['node', 'type', 'wrong'], ['edge', 'weight', 'heavy'], ['edge', 'sourceId', 42], ['graph', 'mode', 'wrong']] as const) {
      const source = (to as any)(createFixture()); const attrs = getAttributes(source, kind); attrs.__statelyai.original[field] = value;
      const graph = (from as any)(source); const entity = kind === 'graph' ? graph : graph[kind === 'node' ? 'nodes' : 'edges'][0];
      expect(entity.data.__statelyai).toEqual(attrs.__statelyai); expect(entity.type === undefined || ['node', 'edge'].includes(entity.type)).toBe(true);
      if (kind === 'node') { expect(entity.label === null || typeof entity.label === 'string').toBe(true); expect(entity.x === undefined || typeof entity.x === 'number').toBe(true); }
      const native = (from as any)(source, { metadata: 'native' }); const nativeEntity = kind === 'graph' ? getCarrierData(native.data, format) : native[kind === 'node' ? 'nodes' : 'edges'][0].data;
      expect(nativeEntity.__statelyai).toEqual(attrs.__statelyai);
    }
  });
  it.each(cases.filter((entry) => entry.format !== 'graphology'))('$format identity metadata allocation preserves enormous foreign suffix keys', ({ format, from, to }) => {
    const huge = `__statelyai__${'9'.repeat(400)}`;
    const attributes = { __statelyai: { foreign: true }, __statelyai__1: ['occupied'], [huge]: { untouched: true }, data: [42] };
    const source: any = format === 'graphlib' ? { options: { directed: true, multigraph: false, compound: false }, nodes: [{ v: 'a' }, { v: 'b' }, { v: 'c' }], edges: [{ v: 'a', w: 'b', value: attributes }] } : { directed: true, multigraph: false, graph: {}, nodes: [{ id: 1 }, { id: '1' }, { id: 2 }], edges: [{ source: 1, target: '1', ...attributes }] };
    const graph = (from as any)(source); graph.edges[0].targetId = graph.nodes[2].id;
    const output = (to as any)(getPersisted(graph)); const attrs = format === 'graphlib' ? output.edges[0].value : output.edges[0];
    expect(attrs.__statelyai).toEqual({ foreign: true }); expect(attrs.__statelyai__1).toEqual(['occupied']); expect(attrs[huge]).toEqual({ untouched: true }); expect(attrs.__statelyai__2.origin).toBe(`@statelyai/graph/${format}`);
    const restored = getNativeDocumentGraph((from as any)(output), format, output);
    expect(getPersisted(restored)).toEqual(getPersisted({ ...graph, data: getCarrierData(graph.data, format) }));
  });
  it.each([false, true])('NetworkX retains full inserted/retargeted edge IDs with foreign typed endpoints, multigraph=%s', (multigraph) => {
    const source: any = { directed: true, multigraph, graph: {}, nodes: [{ id: 1 }, { id: '1' }, { id: 2 }], edges: [{ source: 1, target: '1', ...(multigraph && { key: 42 }), data: { vendor: true }, __statelyai: { foreign: true } }] };
    const graph = fromNetworkXNodeLink(source); graph.nodes.push({ type: 'node', id: 'added', label: '', data: ['node'] });
    graph.edges.push({ type: 'edge', id: 'new', sourceId: graph.nodes[1].id, targetId: graph.nodes[2].id, label: 'New', data: { z: 1 } });
    graph.edges[0].targetId = 'added'; graph.edges.reverse(); graph.nodes.reverse();
    const output = toNetworkXNodeLink(getPersisted(graph)); const restored = getNativeDocumentGraph(fromNetworkXNodeLink(output), 'networkx', output);
    expect(getPersisted(restored)).toEqual(getPersisted({ ...graph, data: getCarrierData(graph.data, 'networkx') }));
    expect(output.edges![0].source).toBe('1'); expect(output.edges![0].target).toBe(2); expect(output.edges![1].source).toBe(1); expect(output.edges![1].target).toBe('added');
    expect(output.edges![1].data).toEqual({ vendor: true }); expect(output.edges![1].__statelyai).toEqual({ foreign: true });
    expect(output.multigraph).toBe(multigraph);
  });
  it.each([false, true])('Graphlib preserves inserted/retargeted IDs without changing simple/multigraph shape, multigraph=%s', (multigraph) => {
    const source: any = { options: { directed: true, multigraph, compound: false }, nodes: [{ v: 'a' }, { v: 'b' }, { v: 'c' }], edges: [{ v: 'a', w: 'b', ...(multigraph && { name: 'old' }), value: { vendor: true, __statelyai: { foreign: true } } }] };
    const graph = fromGraphlibJSON(source); graph.nodes.push({ type: 'node', id: 'added', label: '', data: null }); graph.edges[0].targetId = 'added';
    graph.edges.push({ type: 'edge', id: 'new', sourceId: 'b', targetId: 'c', label: 'New', data: [42] }); graph.edges.reverse(); graph.nodes.reverse();
    const output = toGraphlibJSON(getPersisted(graph)); const restored = getNativeDocumentGraph(fromGraphlibJSON(output), 'graphlib', output);
    expect(getPersisted(restored)).toEqual(getPersisted({ ...graph, data: getCarrierData(graph.data, 'graphlib') }));
    expect(output.options.multigraph).toBe(multigraph); expect(Object.hasOwn(output.edges[0], 'name')).toBe(multigraph); expect(output.edges[1].value.vendor).toBe(true); expect(output.edges[1].value.__statelyai).toEqual({ foreign: true });
  });
  it.each(cases.filter((entry) => entry.format !== 'graphology'))('$format rejects parallel insertion into native simple graphs rather than collapsing', ({ format, from, to }) => {
    const source: any = format === 'graphlib' ? { options: { directed: true, multigraph: false, compound: false }, nodes: [{ v: 'a' }, { v: 'b' }], edges: [{ v: 'a', w: 'b' }] } : { directed: true, multigraph: false, graph: {}, nodes: [{ id: 1 }, { id: '1' }], edges: [{ source: 1, target: '1' }] };
    const graph = (from as any)(source); graph.edges.push({ ...graph.edges[0], id: 'parallel' }); expect(() => (to as any)(graph)).toThrow('duplicate');
  });
  it.each(cases)('$format keeps unrepresentable Graph-looking attributes as user data', ({ format, from, document }) => {
    const attrs = { label: 42, weight: 'heavy', style: ['red'], ports: 'hello', x: null, direction: 42, routing: 'unknown' };
    const source: any = format === 'graphology' ? { options: { type: 'directed', multi: true }, attributes: {}, nodes: [{ key: '', attributes: attrs }], edges: [] } : format === 'graphlib' ? { options: { directed: true, multigraph: true, compound: false }, nodes: [{ v: '', value: attrs }], edges: [] } : { directed: true, multigraph: true, graph: {}, nodes: [{ id: '', ...attrs }], edges: [] };
    const graph = (from as any)(source); expect(graph.nodes[0].label).toBe(''); expect(graph.nodes[0].x).toBeUndefined();
    expect(graph.nodes[0].data).toEqual(attrs); const doc: any = getPersisted(document.from(source)); expect(document.to(doc)).toEqual(source);
    doc.graph.nodes[0].label = 'would erase'; expect(document.getUpdate(doc).ok).toBe(false);
    const fresh: any = document.from(source); fresh.graph.nodes[0].data.label = 43;
    const result: any = document.to(fresh); const node = format === 'graphology' ? result.nodes[0].attributes : format === 'graphlib' ? result.nodes[0].value : result.nodes[0];
    expect(node.label).toBe(43); expect(node.x).toBeNull();
  });
  it('Graphology preserves unknown fields, order and omitted attributes under independent native edits', () => {
    const source: any = { options: { type: 'mixed', multi: true }, attributes: { vendor: [1, null], __statelyai: { foreign: true } }, nodes: [{ key: 'a', attributes: { label: 'A', vendor: 1 } }, { key: 'b' }], edges: [{ key: 'e', source: 'a', target: 'b', undirected: true, custom: { native: true } }], vendor: 42 };
    const doc = getPersisted(graphologyDocumentConverter.from(source)); expect(graphologyDocumentConverter.to(doc)).toEqual(source);
    doc.source.nodes.reverse(); doc.source.nodes.push({ key: 'c' }); (doc.source as any).vendor = 43;
    doc.graph!.nodes[0].label = 'Updated';
    const output: any = graphologyDocumentConverter.to(doc);
    expect(output.nodes.map((node: any) => node.key)).toEqual(['b', 'a', 'c']); expect(output.nodes[1].attributes).toEqual({ label: 'Updated', vendor: 1 });
    expect(output.nodes[0]).toEqual({ key: 'b' }); expect(output.vendor).toBe(43); expect(output.edges[0].custom).toEqual({ native: true });
  });
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('Graphology guards unsafe native key %s', (id) => {
    const graph = createGraph({ nodes: [{ id }, { id: 'safe' }], edges: [{ id: 'e', sourceId: id, targetId: 'safe' }] });
    expect(() => toGraphologyJSON(graph)).toThrow('unsafe native');
  });
  it('Graphology allows native mixed directed/undirected edges and rejects simple duplicates', () => {
    const graph = createFixture(); graph.edges[0].mode = 'undirected';
    const source = toGraphologyJSON(graph); expect(source.options.type).toBe('mixed');
    expect(source.edges[0].undirected).toBe(true); expect(source.edges[1].undirected).toBe(false);
    source.options.multi = false; source.edges[2] = { ...source.edges[1], key: 'duplicate' };
    expect(() => fromGraphologyJSON(source)).toThrow('duplicate edge');
  });
  it('Graphlib preserves scalar/array/null values exactly and rejects incompatible label edits', () => {
    const source: any = { options: { directed: false, multigraph: true, compound: false }, value: 42, nodes: [{ v: 'a', value: ['array', null] }, { v: 'b', value: null }], edges: [{ v: 'a', w: 'b', name: '', value: false }, { v: 'a', w: 'b', name: 'second', value: 0 }], extension: { native: true } };
    const doc = getPersisted(graphlibDocumentConverter.from(source)); expect(graphlibDocumentConverter.to(doc)).toEqual(source);
    expect(doc.graph!.nodes[0].data).toEqual(['array', null]); doc.graph!.nodes[0].label = 'Impossible';
    expect(graphlibDocumentConverter.getUpdate(doc).ok).toBe(false);
    const changed = graphlibDocumentConverter.from(source); changed.graph!.nodes[0].data = [2];
    expect(graphlibDocumentConverter.to(changed).nodes[0].value).toEqual([2]);
  });
  it('Graphlib preserves parents and guards unsafe compound IDs', () => {
    const graph = createGraph({ nodes: [{ id: 'p' }, { id: 'child', parentId: 'p' }] });
    const source = toGraphlibJSON(graph); expect(source.nodes[1].parent).toBe('p'); expect(fromGraphlibJSON(source).nodes[1].parentId).toBe('p');
    graph.nodes[0].id = '__proto__'; graph.nodes[1].parentId = '__proto__'; expect(() => toGraphlibJSON(graph)).toThrow('unsafe');
  });
  it.each([toGraphlibJSON, toNetworkXNodeLink])('rejects genuine mixed native topology', (to) => {
    const graph = createFixture(); graph.edges[0].mode = 'undirected'; expect(() => to(graph)).toThrow('one directed or undirected');
  });
  it.each(cases.filter((entry) => entry.format !== 'graphology'))('$format honors changed native global direction over per-edge snapshots', ({ format, to, from }) => {
    const graph = createFixture(); graph.edges.forEach((edge) => edge.mode = 'undirected');
    const source = (to as any)(graph); if (format === 'graphlib') source.options.directed = true; else source.directed = true;
    const restored = (from as any)(source); expect(restored.mode).toBe('directed'); expect(restored.edges.every((edge: any) => (edge.mode ?? restored.mode) === 'directed')).toBe(true);
  });
  it.each(cases)('$format rejects missing endpoints and duplicate native identities', ({ format, to, from }) => {
    const source = (to as any)(createFixture()); source.nodes.push(getPersisted(source.nodes[0])); expect(() => (from as any)(source)).toThrow(); source.nodes.pop();
    if (format === 'graphlib') source.edges[0].w = 'missing'; else source.edges[0].target = 'missing'; expect(() => (from as any)(source)).toThrow('missing');
  });
  it('Graphology rejects invalid boolean modes/attributes and allocates omitted keys safely', () => {
    const source: any = { options: { type: 'directed', multi: true }, attributes: {}, nodes: [{ key: 'a' }, { key: 'b' }], edges: [{ source: 'a', target: 'b' }, { key: 'e0', source: 'a', target: 'b' }] };
    expect(() => fromGraphologyJSON(source)).not.toThrow();
    source.edges[0].undirected = 'yes'; expect(() => fromGraphologyJSON(source)).toThrow('direction'); delete source.edges[0].undirected;
    source.options.allowSelfLoops = null; expect(() => fromGraphologyJSON(source)).toThrow('boolean'); delete source.options.allowSelfLoops;
    source.nodes[0].attributes = null; expect(() => fromGraphologyJSON(source)).toThrow('attributes');
  });
  it('Graphlib native defaults are importable and hierarchy errors explicit', () => {
    const source: any = { options: {}, nodes: [{ v: 'a' }, { v: 'b' }], edges: [{ v: 'a', w: 'b' }] };
    expect(fromGraphlibJSON(source).mode).toBe('directed');
    source.nodes[0].parent = 'b'; expect(() => fromGraphlibJSON(source)).toThrow('parent'); source.options.compound = true; source.nodes[1].parent = 'a'; expect(() => fromGraphlibJSON(source)).toThrow('cyclic'); source.nodes[1].parent = 'missing'; expect(() => fromGraphlibJSON(source)).toThrow('missing');
  });
  it('NetworkX keeps numeric/string IDs and repeated keys on different pairs distinct', () => {
    const source: any = { directed: false, multigraph: true, graph: { custom: true }, nodes: [{ id: 1, label: null }, { id: '1', label: '' }, { id: '', vendor: true }], edges: [{ source: 1, target: '1', key: 1 }, { source: 1, target: '1', key: '1' }, { source: '', target: 1, key: 1 }] };
    const graph = fromNetworkXNodeLink(source); expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(3); expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(3);
    expect(toNetworkXNodeLink(getPersisted(graph))).toEqual(source);
    const doc = getPersisted(networkxDocumentConverter.from(source)); doc.graph!.nodes[0].label = 'Changed';
    const output = networkxDocumentConverter.to(doc); expect(output.nodes[0].id).toBe(1); expect(output.nodes[0].label).toBe('Changed');
    expect(output.nodes[0].label).not.toBeNull(); expect(output.edges![1].key).toBe('1');
  });
  it('NetworkX canonicalizes Python bool/numeric equivalence and rejects duplicate native tuples', () => {
    const source: any = { directed: true, multigraph: true, graph: {}, nodes: [{ id: true }, { id: '1' }], edges: [{ source: 1, target: '1', key: true }] };
    expect(fromNetworkXNodeLink(source).edges[0].sourceId).toBe(fromNetworkXNodeLink(source).nodes[0].id);
    source.nodes.push({ id: 1 }); expect(() => fromNetworkXNodeLink(source)).toThrow('Python-equivalent'); source.nodes.pop();
    source.edges.push({ source: true, target: '1', key: 1 }); expect(() => fromNetworkXNodeLink(source)).toThrow('duplicate native edge');
  });
  it('NetworkX derives missing keys and preserves identity after reorder', () => {
    const source: any = { directed: true, multigraph: true, graph: {}, nodes: [{ id: 1 }, { id: 2 }], edges: [{ source: 1, target: 2, custom: 'first' }, { source: 1, target: 2, custom: 'second' }] };
    const graph = fromNetworkXNodeLink(source); graph.edges.reverse();
    const output = toNetworkXNodeLink(graph); expect(output.edges!.map((edge) => edge.key)).toEqual([1, 0]); expect(output.edges![0].custom).toBe('second');
  });
  it('NetworkX keeps legacy links in documents and explicitly selects bare export shape', () => {
    const source: any = { directed: true, multigraph: false, graph: {}, nodes: [{ id: 'a', label: 'A' }], links: [] };
    const doc = networkxDocumentConverter.from(source); doc.graph!.nodes[0].label = 'B'; expect(networkxDocumentConverter.to(doc).links).toEqual([]);
    expect(toNetworkXNodeLink(fromNetworkXNodeLink(source)).edges).toEqual([]);
    expect(toNetworkXNodeLink(fromNetworkXNodeLink(source), { edgeKey: 'links' }).links).toEqual([]);
    expect(() => fromNetworkXNodeLink({ ...source, edges: [] })).toThrow('ambiguous');
  });
  it.each([null, [], {}, NaN, Infinity])('NetworkX rejects unsupported native identity %j', (id) => {
    const source: any = { directed: true, multigraph: false, graph: {}, nodes: [{ id }], edges: [] };
    expect(() => fromNetworkXNodeLink(source)).toThrow();
  });
});
