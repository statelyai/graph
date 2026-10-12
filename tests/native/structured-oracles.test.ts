import { describe, expect, it } from 'vitest';
import Graphology from 'graphology';
import { json as graphlibJSON } from '@dagrejs/graphlib';
import cytoscape from 'cytoscape';
import { forceLink, forceSimulation } from 'd3-force';
import ELK from 'elkjs';
import { createGraph, createVisualGraph } from '../../src/graph';
import { toCytoscapeJSON, fromCytoscapeJSON, cytoscapeDocumentConverter } from '../../src/formats/cytoscape';
import { toD3Graph, fromD3Graph, d3DocumentConverter, type D3Graph } from '../../src/formats/d3';
import { toELK, fromELK, elkDocumentConverter, type ElkNode } from '../../src/formats/elk';
import { createGraphologyNativeFixture, createGraphlibNativeFixture } from './fixtures/structured/fixtures';

function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function getLinkIds(source: D3Graph): Array<[string, string]> {
  return source.links.map((link) => [(link.source as any).id, (link.target as any).id]);
}
function getInitializedD3(source: D3Graph, numeric = false): D3Graph {
  const link = forceLink<any, any>(source.links);
  if (!numeric) link.id((node) => node.id);
  const simulation = forceSimulation<any>(source.nodes).force('link', link).stop();
  simulation.tick(2); simulation.stop();
  return source;
}
function getELKIds(root: ElkNode): string[] {
  const ids: string[] = [], queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; ids.push(node.id);
    ids.push(...(node.ports ?? []).map((port) => port.id));
    for (const edge of node.edges ?? []) { ids.push(edge.id); ids.push(...(edge.sections ?? []).map((section) => section.id)); }
    queue.push(...(node.children ?? []));
  }
  return ids;
}

// These are controls for the future serialization adapters, not production mappings.
describe('independent Graphology and Graphlib native controls', () => {
  it('Graphology observes mixed modes, distinct parallel IDs, empty IDs and isolates', () => {
    const input = createGraphologyNativeFixture();
    const native = Graphology.from(getPersisted(input));
    expect(native.type).toBe('mixed'); expect(native.multi).toBe(true);
    expect(native.order).toBe(4); expect(native.size).toBe(4);
    expect(native.nodes()).toEqual(input.nodes.map((node) => node.key));
    expect(native.edges()).toEqual(input.edges!.map((edge) => edge.key));
    expect(native.hasDirectedEdge('a', 'b')).toBe(true);
    expect(native.hasDirectedEdge('b', 'a')).toBe(false);
    expect(native.hasUndirectedEdge('', 'b')).toBe(true);
    expect(native.isUndirected('undirected')).toBe(true);
    expect(native.directedEdges('a', 'b')).toHaveLength(2);
    expect(native.degree('isolated')).toBe(0); expect(native.hasEdge('', '')).toBe(true);
    expect(native.getNodeAttribute('a', 'data')).toBeNull();
    expect(native.getNodeAttribute('b', 'data')).toEqual(['array', 2]);
    const exported = native.export();
    const second = Graphology.from(getPersisted(exported));
    expect(second.export()).toEqual(exported);
  });
  it('Graphology rejects malformed endpoint identity and unsupported typed modes', () => {
    const fixture = createGraphologyNativeFixture();
    fixture.edges![0].target = 'missing';
    expect(() => new Graphology({ type: 'mixed', multi: true }).import(fixture)).toThrow();
    expect(() => new Graphology({ type: 'directed', multi: true }).import(createGraphologyNativeFixture())).toThrow();
  });
  it.each([true, false])('Graphlib reads native global directed=%s, compound labels and named multiplicity', (directed) => {
    const input = createGraphlibNativeFixture(directed);
    const native = graphlibJSON.read(getPersisted(input));
    expect(native.isDirected()).toBe(directed); expect(native.isMultigraph()).toBe(true);
    expect(native.nodeCount()).toBe(4); expect(native.edgeCount()).toBe(3);
    expect(native.parent('a')).toBe('parent'); expect(native.node('')).toBe(42);
    expect(native.node('isolated')).toBeNull();
    expect(native.edge('a', '', 'second')).toEqual(['edge', null]);
    expect(native.edge('', 'a', 'first')).toEqual(directed ? undefined : { weight: 1, label: '' });
    expect(native.nodeEdges('isolated')).toEqual([]);
    expect(graphlibJSON.write(graphlibJSON.read(getPersisted(graphlibJSON.write(native))))).toEqual(graphlibJSON.write(native));
  });
  it.each([null, 42, 'root', [1, null], false].map((value) => ({ value })))('Graphlib preserves arbitrary root value $value through its reader/writer', ({ value }) => {
    const source = { ...createGraphlibNativeFixture(), value };
    const native = graphlibJSON.read(getPersisted(source));
    expect(native.graph()).toEqual(value);
    expect(graphlibJSON.write(native).value).toEqual(value);
  });
  it('Graphlib labels cannot change native global edge direction', () => {
    const fixture = createGraphlibNativeFixture(true);
    (fixture.edges[0].value as any).mode = 'undirected';
    const native = graphlibJSON.read(fixture);
    expect(native.isDirected()).toBe(true);
    expect(native.hasEdge('', 'a', 'first')).toBe(false);
  });
});

describe('upstream reserved-name reader boundaries', () => {
  it('records Graphology 0.26.0 reserved adjacency failure instead of declaring a valid native profile', () => {
    const source = { nodes: [{ key: 'a' }, { key: 'constructor' }], edges: [{ key: 'e', source: 'a', target: 'constructor' }] };
    expect(() => new Graphology({ multi: true }).import(source).directedEdges('a', 'constructor')).toThrow();
  });
  it('records Graphlib 4.0.1 compound __proto__ failure as an unsupported native profile', () => {
    expect(() => graphlibJSON.read({ options: { compound: true }, nodes: [{ v: 'parent' }, { v: '__proto__', parent: 'parent' }], edges: [] })).toThrow();
  });
});

describe('Cytoscape native interpretation', () => {
  it('observes positions, Unicode/reserved IDs, scalar/array data, parallels, self-loop and isolate', () => {
    const graph = createGraph<any, any, any, any>({ data: null, nodes: [
      { id: '__proto__', label: '', data: 42, x: 10, y: 20 },
      { id: '雪🙂', label: null, data: [1, null], x: 50, y: 60 }, { id: 'isolated', data: null },
    ], edges: [
      { id: 'e1', sourceId: '__proto__', targetId: '雪🙂', data: false },
      { id: 'e2', sourceId: '__proto__', targetId: '雪🙂', mode: 'undirected' },
      { id: 'loop', sourceId: '雪🙂', targetId: '雪🙂' },
    ] });
    const source = toCytoscapeJSON(graph, { nativeCarrier: false });
    const cy = cytoscape({ headless: true, elements: source.elements as any, layout: { name: 'preset' } });
    try {
      expect(cy.nodes().map((node) => node.id())).toEqual(['__proto__', '雪🙂', 'isolated']);
      expect(cy.edges().map((edge) => edge.id())).toEqual(['e1', 'e2', 'loop']);
      expect(cy.getElementById('__proto__').position()).toEqual({ x: 10, y: 20 });
      expect(cy.getElementById('__proto__').data('nodeData')).toBe(42);
      expect(cy.getElementById('雪🙂').data('nodeData')).toEqual([1, null]);
      expect(cy.getElementById('雪🙂').data('label')).toBeNull();
      expect(cy.getElementById('e2').data('mode')).toBe('undirected');
      expect(cy.getElementById('isolated').connectedEdges()).toHaveLength(0);
      expect(cy.getElementById('loop').source().id()).toBe('雪🙂');
      expect(cy.getElementById('loop').target().id()).toBe('雪🙂');
    } finally { cy.destroy(); }
  });
  it('native changes to geometry/data/labels and UI fields survive Graph and document edits', () => {
    const initial = { elements: { nodes: [{ data: { id: 'a', label: 'Before', score: 1, __statelyai: { foreign: true } }, position: { x: 1, y: 2 } }, { data: { id: 'b' } }], edges: [{ data: { id: 'e', source: 'a', target: 'b' } }] } };
    const cy = cytoscape({ headless: true, elements: initial.elements as any, layout: { name: 'preset' } });
    try {
      cy.getElementById('a').position({ x: 7, y: 8 }).data('label', 'Native').data('score', 2).addClass('foreign-class');
      const source: any = getPersisted(cy.json());
      const graph = fromCytoscapeJSON(source, { metadata: 'native' });
      expect(graph.nodes[0]).toMatchObject({ label: 'Native', x: 7, y: 8, data: { score: 2, __statelyai: { foreign: true } } });
      const document = getPersisted(cytoscapeDocumentConverter.from(source)); document.graph!.nodes[0].label = 'Document';
      const result = cytoscapeDocumentConverter.to(document);
      const reread = cytoscape({ headless: true, elements: result.elements as any, layout: { name: 'preset' } });
      try {
        expect(reread.getElementById('a').data('label')).toBe('Document');
        expect(reread.getElementById('a').data('score')).toBe(2);
        expect(reread.getElementById('a').hasClass('foreign-class')).toBe(true);
        expect(reread.getElementById('a').position()).toEqual({ x: 7, y: 8 });
      } finally { reread.destroy(); }
    } finally { cy.destroy(); }
  });
  it('patches the actual native flat shape without grouping or dropping insertion order', () => {
    const cy = cytoscape({ headless: true });
    try {
      cy.add([{ data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'e', source: 'a', target: 'b' } }, { data: { id: 'c', label: 'Before', __statelyai: { foreign: true } } }]);
      const source: any = getPersisted((cy as any).json(true));
      expect(Array.isArray(source.elements)).toBe(true);
      const order = source.elements.map((element: any) => element.data.id);
      const document = getPersisted(cytoscapeDocumentConverter.from(source));
      document.graph!.nodes.find((node) => node.id === 'c')!.label = 'After';
      const output: any = cytoscapeDocumentConverter.to(document);
      expect(output.elements.map((element: any) => element.data.id)).toEqual(order);
      const reread = cytoscape({ headless: true, elements: output.elements });
      try { expect(reread.getElementById('c').data('label')).toBe('After'); expect(reread.getElementById('e').source().id()).toBe('a'); }
      finally { reread.destroy(); }
    } finally { cy.destroy(); }
  });
  it('loads a bounded large chain with distinct identities and observed native endpoints', () => {
    const count = 1000;
    const source = toCytoscapeJSON(createGraph({ nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })), edges: Array.from({ length: count - 1 }, (_, i) => ({ id: `e${i}`, sourceId: `n${i}`, targetId: `n${i + 1}` })) }));
    const cy = cytoscape({ headless: true, elements: source.elements as any });
    try {
      expect(cy.nodes()).toHaveLength(count); expect(cy.edges()).toHaveLength(count - 1);
      expect(cy.getElementById(`e${count - 2}`).target().id()).toBe(`n${count - 1}`);
    } finally { cy.destroy(); }
  });
  it('retains tagged-source UI edits added by the native reader', () => {
    const initial = toCytoscapeJSON(createGraph({ nodes: [{ id: 'a' }] }));
    const cy = cytoscape({ headless: true, elements: initial.elements as any, data: initial.data, layout: { name: 'preset' } });
    try {
      cy.getElementById('a').addClass('reader-edit');
      const source: any = getPersisted(cy.json());
      const output: any = toCytoscapeJSON(fromCytoscapeJSON(source));
      expect(output.elements.nodes[0].classes).toBe('reader-edit');
    } finally { cy.destroy(); }
  });
  it('allocates reader-valid identities when Graph node and edge IDs collide', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'same' }], edges: [{ id: 'same', sourceId: 'a', targetId: 'same' }] });
    const source = toCytoscapeJSON(graph);
    const cy = cytoscape({ headless: true, elements: source.elements as any });
    try {
      expect(cy.nodes()).toHaveLength(2); expect(cy.edges()).toHaveLength(1);
      expect(cy.edges()[0].source().id()).toBe(source.elements.nodes[0].data.id);
      expect(cy.edges()[0].target().id()).toBe(source.elements.nodes[1].data.id);
      expect(source.elements.nodes[0].data.id).not.toBe('');
    } finally { cy.destroy(); }
  });
});

describe('D3 forceLink native endpoint interpretation', () => {
  it('resolves emitted string IDs with the native ID accessor, preserving scalar/array data and isolates', () => {
    const graph = createGraph<any, any, any, any>({ nodes: [{ id: 'a', data: 1 }, { id: 'b', label: '', data: [1, 2] }, { id: 'isolated' }], edges: [{ id: 'first', sourceId: 'a', targetId: 'b' }, { id: 'second', sourceId: 'a', targetId: 'b' }, { id: 'loop', sourceId: 'b', targetId: 'b' }] });
    const native = getInitializedD3(toD3Graph(graph));
    expect(getLinkIds(native)).toEqual([['a', 'b'], ['a', 'b'], ['b', 'b']]);
    expect(native.nodes[0].data).toBe(1); expect(native.nodes[1].data).toEqual([1, 2]);
    expect(native.links[0].source).toBe(native.nodes[0]); expect(native.nodes[2].id).toBe('isolated');
    expect(native.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });
  it('resolves rebased numeric indices after Graph reorder, insertion/deletion and JSON persistence', () => {
    const graph = getPersisted(fromD3Graph({ nodes: [{ id: 'a' }, { id: 'unused' }, { id: 'b' }], links: [{ source: 0, target: 2, custom: true }] }));
    graph.nodes = [graph.nodes[2], graph.nodes[0], createGraph({ nodes: [{ id: 'new' }] }).nodes[0]];
    const source = toD3Graph(graph);
    expect(source.links[0]).toMatchObject({ source: 1, target: 0, custom: true });
    const native = getInitializedD3(source, true);
    expect(getLinkIds(native)).toEqual([['a', 'b']]);
    expect(native.links[0].source).toBe(native.nodes[1]); expect(native.links[0].target).toBe(native.nodes[0]);
  });
  it('rebinds live endpoint objects after imported Graph rename/reorder and JSON persistence', () => {
    const a = { id: 'a', label: 'Before', custom: true }, b = { id: 'b' };
    const graph = getPersisted(fromD3Graph({ nodes: [a, b], links: [{ source: a, target: b }] }));
    graph.nodes[0].id = 'renamed'; graph.edges[0].sourceId = 'renamed'; graph.nodes.reverse();
    const native = getInitializedD3(toD3Graph(graph));
    expect(getLinkIds(native)).toEqual([['renamed', 'b']]);
    expect(native.links[0].source).toBe(native.nodes[1]); expect((native.links[0].source as any).custom).toBe(true);
  });
  it('preserves simulation edits and fixed positions from actual native updates', () => {
    const source: D3Graph = { nodes: [{ id: 'a', x: 10, y: 20, fx: 10, fy: 20 }, { id: 'b', x: 60, y: 20 }], links: [{ source: 'a', target: 'b' }] };
    const native = getInitializedD3(source);
    expect(native.nodes[0]).toMatchObject({ x: 10, y: 20, fx: 10, fy: 20 });
    const graph = fromD3Graph(native); graph.nodes[0].label = 'Edited';
    const reread = getInitializedD3(toD3Graph(graph));
    expect(reread.nodes[0]).toMatchObject({ x: 10, y: 20, fx: 10, fy: 20, label: 'Edited' });
    expect(getLinkIds(reread)).toEqual([['a', 'b']]);
  });
  it('rejects invalid indices and independently verifies dangling IDs fail native resolution', () => {
    expect(() => fromD3Graph({ nodes: [{ id: 'a' }], links: [{ source: 3, target: 0 }] })).toThrow(/invalid endpoint/);
    expect(() => getInitializedD3({ nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'missing' }] })).toThrow(/node not found/);
  });
  it('document numeric tokens keep original topology when observed by the default native accessor', () => {
    const document = getPersisted(d3DocumentConverter.from({ nodes: [{ id: 'a', label: 'Before' }, { id: 'b' }], links: [{ source: 0, target: 1 }] }));
    document.graph!.nodes[0].label = 'After';
    const native = getInitializedD3(d3DocumentConverter.to(document), true);
    expect(getLinkIds(native)).toEqual([['a', 'b']]); expect(native.nodes[0].label).toBe('After');
  });
  it('handles a bounded large chain with native endpoint resolution', () => {
    const count = 2000;
    const graph = createGraph({ nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })), edges: Array.from({ length: count - 1 }, (_, i) => ({ id: `e${i}`, sourceId: `n${i}`, targetId: `n${i + 1}` })) });
    const native = getInitializedD3(toD3Graph(graph));
    expect(native.links).toHaveLength(count - 1);
    expect((native.links[0].source as any).id).toBe('n0'); expect((native.links.at(-1)!.target as any).id).toBe(`n${count - 1}`);
  });
});

describe('ELK native layout interpretation', () => {
  it('lays out globally unique qualified IDs and ports while retaining actual endpoint ownership', async () => {
    const graph = createVisualGraph({ id: 'a', direction: 'right', nodes: [
      { id: 'a', label: '', width: 40, height: 30, data: [1, null], ports: [{ name: 'p', direction: 'out', width: 4, height: 4 }] },
      { id: 'a__p', label: 'B', width: 40, height: 30, ports: [{ name: 'p', direction: 'in', width: 4, height: 4 }] },
      { id: 'isolated', label: null, width: 20, height: 20, data: null },
    ], edges: [{ id: 'a', sourceId: 'a', targetId: 'a__p', sourcePort: 'p', targetPort: 'p', label: '', data: 42 }] });
    const source = toELK(graph); source.layoutOptions!['elk.algorithm'] = 'layered';
    for (const node of source.children!) node.layoutOptions!['elk.portConstraints'] = 'FIXED_SIDE';
    const ids = getELKIds(source); expect(new Set(ids).size).toBe(ids.length);
    const native = await new ELK().layout(source);
    const a = native.children!.find((node) => node.id === 'a')!, b = native.children!.find((node) => node.id === 'a__p')!;
    expect(b.x!).toBeGreaterThan(a.x!); expect(a.width).toBe(40); expect(b.width).toBe(40);
    expect(native.edges![0].sources).toEqual([a.ports![0].id]); expect(native.edges![0].targets).toEqual([b.ports![0].id]);
    expect(native.edges![0].sections![0].incomingShape).toBe(a.ports![0].id);
    expect(native.edges![0].sections![0].outgoingShape).toBe(b.ports![0].id);
    expect(native.edges![0].sections![0].startPoint.x).toBeLessThan(native.edges![0].sections![0].endPoint.x);
    const imported = fromELK(native);
    expect(imported.id).toBe('a'); expect(imported.edges[0]).toMatchObject({ id: 'a', sourceId: 'a', targetId: 'a__p', sourcePort: 'p', targetPort: 'p', data: 42 });
    expect(imported.nodes[0].data).toEqual([1, null]);
    expect(imported.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  }, 10000);
  it('native layouts and label edits override mapped snapshots', async () => {
    const source = toELK(createVisualGraph({ direction: 'down', nodes: [{ id: 'a', label: 'Before', width: 20, height: 20 }, { id: 'b', width: 20, height: 20 }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }] }));
    source.layoutOptions!['elk.algorithm'] = 'layered';
    const native = await new ELK().layout(source); native.children![0].labels![0].text = 'Native'; native.children![0].x = 99;
    const imported = fromELK(native);
    expect(imported.nodes[0]).toMatchObject({ label: 'Native', x: 99 });
    expect(imported.edges[0].points).toHaveLength((native.edges![0].sections![0].bendPoints ?? []).length + 2);
    const document = getPersisted(elkDocumentConverter.from(native)); document.graph!.nodes[0].label = 'Document';
    const output = elkDocumentConverter.to(document);
    expect(output.children![0].labels![0].text).toBe('Document'); expect(output.children![0].x).toBe(99);
    expect((output.edges![0] as any).sections).toEqual(native.edges![0].sections);
  }, 10000);
  it('retains bounded deep native containment and fresh parent geometry', async () => {
    const depth = 20;
    const graph = createVisualGraph({ nodes: Array.from({ length: depth }, (_, i) => ({ id: `n${i}`, ...(i > 0 && { parentId: `n${i - 1}` }), width: 20, height: 20 })).reverse() });
    const source = toELK(graph); source.layoutOptions!['elk.algorithm'] = 'layered';
    const native = await new ELK().layout(source);
    let current = native.children![0];
    for (let i = 0; i < depth; i++) { expect(current.id).toBe(`n${i}`); if (i < depth - 1) current = current.children![0]; }
    expect(native.children![0].width!).toBeGreaterThan(20);
    const imported = fromELK(native);
    expect(imported.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(imported.nodes.find((node) => node.id === 'n0')!.width).toBe(native.children![0].width);
    expect(imported.nodes.find((node) => node.id === 'n19')!.parentId).toBe('n18');
  }, 10000);
  it('normalizes primitive inputs to actual reader-accepted extended output without losing port topology', async () => {
    const graph = fromELK({ id: 'root', children: [{ id: 'a', width: 20, height: 20, ports: [{ id: 'p', width: 4, height: 4 }] }, { id: 'b', width: 20, height: 20 }], edges: [{ id: 'e', source: 'a', sourcePort: 'p', target: 'b', sourcePoint: { x: 1, y: 2 }, targetPoint: { x: 3, y: 4 } }] });
    const source = toELK(graph); source.layoutOptions = { ...source.layoutOptions, 'elk.algorithm': 'layered' };
    expect(source.edges![0].sources).toEqual(['p']); expect(source.edges![0]).not.toHaveProperty('source');
    const native = await new ELK().layout(source);
    expect(native.edges![0].sources).toEqual(['p']); expect(native.edges![0].targets).toEqual(['b']);
    expect(native.edges![0].sections![0].startPoint.x).toBeTypeOf('number');
  }, 10000);
  it('qualifies new primitive-routing section IDs against every existing native element', async () => {
    const source = toELK(fromELK({ id: 'root', children: [{ id: 'a', width: 20, height: 20 }, { id: 'b', width: 20, height: 20 }, { id: 'e__section', width: 20, height: 20 }], edges: [{ id: 'e', source: 'a', target: 'b', sourcePoint: { x: 1, y: 2 }, targetPoint: { x: 3, y: 4 } }] }));
    const ids = getELKIds(source); expect(new Set(ids).size).toBe(ids.length);
    source.layoutOptions = { ...source.layoutOptions, 'elk.algorithm': 'layered' };
    const native = await new ELK().layout(source);
    expect(native.children).toHaveLength(3); expect(native.edges![0].sources).toEqual(['a']);
    expect(native.edges![0].targets).toEqual(['b']);
  }, 10000);
  it('rejects malformed duplicate identities and retains unprojectable native hyperedges explicitly', () => {
    expect(() => fromELK({ id: 'root', children: [{ id: 'a', ports: [{ id: 'p' }] }, { id: 'b', ports: [{ id: 'p' }] }] })).toThrow(/duplicate/);
    const source = { id: 'root', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e', sources: ['a', 'b'], targets: ['c'] }] };
    const document = getPersisted(elkDocumentConverter.from(source));
    expect(document.graph).toBeNull(); expect(elkDocumentConverter.to(document)).toEqual(source);
  });
});
