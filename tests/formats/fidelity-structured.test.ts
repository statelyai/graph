import { describe, expect, it } from 'vitest';
import { createGraph, createVisualGraph } from '../../src/graph';
import type { Graph } from '../../src/types';
import { fromCytoscapeJSON, toCytoscapeJSON } from '../../src/formats/cytoscape';
import { fromD3Graph, toD3Graph, type D3Graph } from '../../src/formats/d3';
import { fromELK, toELK, type ElkNode, type ELKInputNode } from '../../src/formats/elk';
import { fromJGF, toJGF } from '../../src/formats/jgf';
import { fromXYFlow, toXYFlow } from '../../src/formats/xyflow';
import { fromAdjacencyList, toAdjacencyList } from '../../src/formats/adjacency-list';
import { fromTGF, toTGF } from '../../src/formats/tgf';

function getElkElementIds(root: ElkNode): string[] {
  const ids: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    ids.push(node.id, ...(node.ports ?? []).map((port) => port.id));
    pending.push(...(node.children ?? []));
  }
  return ids;
}

describe('fidelity regressions: structured adapters', () => {
  it.each([
    ['Cytoscape', (graph: Graph) => fromCytoscapeJSON(toCytoscapeJSON(graph))],
    ['D3', (graph: Graph) => fromD3Graph(toD3Graph(graph))],
    ['JGF', (graph: Graph) => fromJGF(toJGF(graph))],
  ] as const)('%s preserves factory-default null node and edge labels', (_name, roundTrip) => {
    const original = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const restored = roundTrip(original);
    expect(restored.nodes[0].label).toBeNull();
    expect(restored.edges[0].label).toBeNull();
  });

  it('Cytoscape retains independently optional node geometry', () => {
    const original = createGraph({ nodes: [{ id: 'a', x: 12 }] });
    const restored = fromCytoscapeJSON(toCytoscapeJSON(original));
    expect(restored.nodes[0].x).toBe(12);
    expect(restored.nodes[0].y).toBeUndefined();
  });

  it('D3 resolves documented numeric node-index endpoints', () => {
    // D3 supports numeric endpoints; the adapter's current public type omits them.
    const native = {
      nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 0, target: 1 }],
    } as unknown as D3Graph;
    expect(fromD3Graph(native).edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b' });
  });

  it('ELK rejects hyperedges explicitly until a richer document API can preserve them', () => {
    const native: ElkNode = {
      id: 'root', children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e', sources: ['a', 'b'], targets: ['c'] }],
    };
    expect(() => fromELK(native)).toThrow(/hyperedge/i);
  });

  it('ELK emits document-unique ids despite separator-containing node and port names', () => {
    const native = toELK(createVisualGraph({
      id: 'root',
      nodes: [
        { id: 'a__b', ports: [{ name: 'c' }] },
        { id: 'a', ports: [{ name: 'b__c' }] },
        { id: 'a__b__c' },
      ],
      edges: [{ id: 'e', sourceId: 'a__b', targetId: 'a', sourcePort: 'c', targetPort: 'b__c' }],
    }));
    const ids = getElkElementIds(native);
    expect(new Set(ids).size).toBe(ids.length);
    const restored = fromELK(native);
    expect(restored.edges[0]).toMatchObject({
      sourceId: 'a__b', targetId: 'a', sourcePort: 'c', targetPort: 'b__c',
    });
  });

  it('ELK preserves a null node label', () => {
    const original = createVisualGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', routing: 'splines' }],
    });
    const restored = fromELK(toELK(original));
    expect(restored.nodes[0].label).toBeNull();
  });

  it('ELK preserves routing without explicit waypoints', () => {
    const original = createVisualGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', routing: 'splines' }],
    });
    expect(fromELK(toELK(original)).edges[0].routing).toBe('splines');
  });

  it('xyflow retains foreign user data containing its reserved metadata name', () => {
    const data = { foo: 1, __statelyai: { bar: 2 } };
    const graph = fromXYFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data }], edges: [] });
    expect(graph.nodes[0].data).toEqual(data);
  });

  it('xyflow imports edits to emitted native node data and labels', () => {
    const native = toXYFlow(createVisualGraph({ nodes: [{ id: 'a', label: 'Original', data: { foo: 1 } }] }));
    native.nodes[0].data.foo = 2;
    native.nodes[0].data.label = 'Edited';
    const graph = fromXYFlow(native);
    expect(graph.nodes[0].label).toBe('Edited');
    expect(graph.nodes[0].data.foo).toBe(2);
  });

  it('xyflow imports edits to emitted native edge labels', () => {
    const native = toXYFlow(createVisualGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: 'Original' }],
    }));
    native.edges[0].label = 'Edited';
    expect(fromXYFlow(native).edges[0].label).toBe('Edited');
  });

  it('adjacency lists retain distinct edges whose ids contain the dedup delimiter', () => {
    const graph = fromAdjacencyList({ 'a->b': ['c'], a: ['b->c'] });
    expect(graph.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
      ['a->b', 'c'], ['a', 'b->c'],
    ]);
  });

  it('adjacency lists retain a node named __proto__ as an own entry', () => {
    const native = toAdjacencyList(createGraph({ nodes: [{ id: '__proto__' }] }));
    expect(Object.hasOwn(native, '__proto__')).toBe(true);
    expect(fromAdjacencyList(native).nodes.map((node) => node.id)).toEqual(['__proto__']);
  });

  it('TGF recognizes a CRLF separator', () => {
    const graph = fromTGF('a Alpha\r\nb Beta\r\n#\r\na b go\r\n');
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b', label: 'go' });
  });

  it.each(['a  b go', 'a\tb go'])('TGF parses whitespace-delimited endpoints in %j', (edge) => {
    expect(fromTGF(`a Alpha\nb Beta\n#\n${edge}`).edges[0]).toMatchObject({
      sourceId: 'a', targetId: 'b', label: 'go',
    });
  });
});


describe('structured native preservation and validation', () => {
  it('D3 rejects out-of-range numeric endpoints', () => {
    expect(() => fromD3Graph({ nodes: [{ id: 'a' }], links: [{ source: 2, target: 0 }] } as unknown as D3Graph)).toThrow(/endpoint|index/i);
  });

  it('D3 retains native fixed positions, velocities and foreign attributes', () => {
    const native = { nodes: [{ id: 'a', fx: 1, fy: 2, vx: 3, vy: 4, group: 7 }], links: [], author: 'Ada' };
    expect(toD3Graph(fromD3Graph(native))).toEqual(native);
  });

  it('Cytoscape retains native element data and UI fields', () => {
    const native = { data: { author: 'Ada' }, zoom: 2, pan: { x: 3, y: 4 }, elements: {
      nodes: [{ data: { id: 'a', score: 10 }, classes: 'red', locked: true, style: { color: 'red' } }], edges: [],
    } };
    expect(toCytoscapeJSON(fromCytoscapeJSON(native))).toEqual(native);
  });

  it('ELK imports primitive edges', () => {
    const native: ELKInputNode = { id: 'root', children: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', source: 'a', target: 'b', sourcePoint: { x: 1, y: 2 }, targetPoint: { x: 3, y: 4 } }],
    };
    const graph = fromELK(native);
    expect(graph.edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    const output = toELK(graph);
    expect(output.edges![0]).toMatchObject({ sources: ['a'], targets: ['b'], sections: [{ startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 } }] });
    expect(output.edges![0]).not.toHaveProperty('source');
  });

  it('ELK preserves native extra labels, sections and layout options', () => {
    const native: ElkNode = { id: 'root', layoutOptions: { 'elk.algorithm': 'layered' }, width: 600,
      children: [{ id: 'a', labels: [{ text: 'one', x: 1 }, { text: 'two' }] }, { id: 'b' }],
      edges: [{ id: 'e', sources: ['a'], targets: ['b'], sections: [
        { id: 's1', startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 } },
        { id: 's2', startPoint: { x: 5, y: 6 }, endPoint: { x: 7, y: 8 } },
      ] }],
    };
    expect(toELK(fromELK(native))).toEqual(native);
  });

  it('xyflow preserves native viewport and UI fields', () => {
    const native = { viewport: { x: 1, y: 2, zoom: 3 }, nodes: [{ id: 'a', position: { x: 0, y: 0 },
      data: { foo: 1 }, selected: true, hidden: true, style: { color: 'red' },
    }], edges: [] };
    expect(toXYFlow(fromXYFlow(native))).toEqual(native);
  });

  it('TGF rejects malformed edges and unknown endpoints', () => {
    expect(() => fromTGF('a Alpha\n#\na')).toThrow(/edge/i);
    expect(() => fromTGF('a Alpha\n#\na missing')).toThrow(/node|endpoint/i);
  });
});

describe('structured native snapshots after Graph edits', () => {
  it('retains D3 foreign attributes on surviving node identities after reorder, insert and delete', () => {
    const graph = fromD3Graph({ nodes: [{ id: 'a', group: 'alpha' }, { id: 'b', group: 'beta' }, { id: 'c', group: 'gamma' }], links: [] });
    graph.nodes = [graph.nodes[2], createGraph({ nodes: [{ id: 'new' }] }).nodes[0], graph.nodes[0]];
    const native = toD3Graph(graph);
    expect(native.nodes.map((node) => node.id)).toEqual(['c', 'new', 'a']);
    expect(native.nodes[0].group).toBe('gamma');
    expect(native.nodes[2].group).toBe('alpha');
  });

  it('uses replacement Graph data instead of restoring an old primitive or object', () => {
    const primitive = fromD3Graph({ data: 1, nodes: [], links: [] });
    primitive.data = { changed: true };
    expect(toD3Graph(primitive).data).toEqual({ changed: true });
    const object = fromD3Graph({ data: { old: true }, nodes: [], links: [] });
    object.data = 2;
    expect(toD3Graph(object).data).toBe(2);
  });
});

describe('complete structured Graph JSON round trips', () => {
  const formats = [
    ['Cytoscape', (graph: Graph) => fromCytoscapeJSON(toCytoscapeJSON(graph))],
    ['D3', (graph: Graph) => fromD3Graph(toD3Graph(graph))],
    ['JGF', (graph: Graph) => fromJGF(toJGF(graph))],
    ['ELK', (graph: Graph) => fromELK(toELK(graph as ReturnType<typeof createVisualGraph>))],
    ['xyflow', (graph: Graph) => fromXYFlow(toXYFlow(graph as ReturnType<typeof createVisualGraph>))],
  ] as const;
  it.each(formats)('%s preserves full JSON fields, presence, data collisions and authored order', (_name, roundTrip) => {
    const graph = createVisualGraph<any, any, any, any>({ id: 'parent', mode: 'bidirectional',
      nodes: [
        { id: 'child', parentId: 'parent', label: null, shape: '', color: '',
          data: { __statelyai: { foreign: true }, label: 'user label', nested: { before: 1 } }, ports: [{ name: 'p', label: '', data: null }] },
        { id: 'parent', label: '', data: 0 },
      ],
      edges: [{ id: 'parent', sourceId: 'child', targetId: 'parent', sourcePort: 'p', label: null,
        color: '', points: [], routing: 'splines', data: ['array', null], mode: 'undirected' }],
      data: { __statelyai: { foreign: true } },
    });
    graph.nodes[1].ports = [];
    const json = JSON.parse(JSON.stringify(graph));
    expect(JSON.parse(JSON.stringify(roundTrip(graph)))).toEqual(json);
    expect(JSON.parse(JSON.stringify(graph))).toEqual(json);
  });

  it('D3 conversion handles a large chain without per-edge node scans', () => {
    const nodes = Array.from({ length: 10000 }, (_value, index) => ({ id: `n${index}` }));
    const links = nodes.slice(1).map((_node, index) => ({ source: index, target: index + 1 }));
    const native = toD3Graph(fromD3Graph({ nodes, links }));
    expect(native.nodes).toHaveLength(10000);
    expect(native.links).toHaveLength(9999);
    expect(native.links[9998]).toMatchObject({ source: 9998, target: 9999 });
  });
});

describe('structured live metadata and identity', () => {
  it('JGF imports live metadata and relation edits from emitted documents', () => {
    const native = toJGF(createGraph({ data: { author: 'Before' }, nodes: [{ id: 'a', data: { score: 1 } }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', data: { relation: 'before', confidence: 0.5 } }] }));
    native.graph.metadata!.author = 'After';
    native.graph.nodes[0].metadata!.score = 2;
    native.graph.edges[0].metadata!.confidence = 0.9;
    native.graph.edges[0].relation = 'after';
    const graph = fromJGF(native);
    expect(graph.data.author).toBe('After');
    expect(graph.nodes[0].data.score).toBe(2);
    expect(graph.edges[0].data).toMatchObject({ confidence: 0.9, relation: 'after' });
  });

  it('Cytoscape treats reserved payloads as native user data under the explicit override', () => {
    const reserved = { kind: '@statelyai/graph', version: 2, format: 'cytoscape.node', original: { id: 'fake' }, mapped: {} };
    const native = { elements: { nodes: [{ data: { id: 'a', __statelyai: reserved } }], edges: [] } };
    const graph = fromCytoscapeJSON(native, { metadata: 'native' });
    expect(graph.nodes[0].id).toBe('a');
    expect(graph.nodes[0].data.__statelyai).toEqual(reserved);
    expect(toCytoscapeJSON(graph)).toEqual(native);
  });

  it.each([
    { id: 'root', children: [{ id: 'root' }] },
    { id: 'root', children: [{ id: 'a', ports: [{ id: 'p' }] }, { id: 'b', ports: [{ id: 'p' }] }] },
    { id: 'root', children: [{ id: 'a' }, { id: 'b' }], edges: [
      { id: 'e', sources: ['a'], targets: ['b'] }, { id: 'e', sources: ['a'], targets: ['b'] },
    ] },
  ])('ELK rejects duplicate IDs across the whole native document', (native) => {
    expect(() => fromELK(native)).toThrow(/duplicate.*id/i);
  });

  it('ELK maps a live native port rename and updated endpoint references consistently', () => {
    const native = toELK(createVisualGraph({ nodes: [{ id: 'a', ports: [{ name: 'p' }] }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', sourcePort: 'p' }] }));
    native.children![0].ports![0].id = 'renamed';
    (native.edges![0] as any).sources = ['renamed'];
    const graph = fromELK(native);
    expect(graph.nodes[0].ports![0].name).toBe('renamed');
    expect(graph.edges[0]).toMatchObject({ sourceId: 'a', sourcePort: 'renamed' });
  });

  it('xyflow orders a reversed 10k hierarchy iteratively and restores Graph order', () => {
    const nodes = Array.from({ length: 10000 }, (_value, index) => ({ id: `n${index}`,
      ...(index > 0 && { parentId: `n${index - 1}` }) })).reverse();
    const graph = createVisualGraph({ nodes });
    const native = toXYFlow(graph);
    expect(native.nodes[0].id).toBe('n0');
    expect(native.nodes[9999].id).toBe('n9999');
    expect(fromXYFlow(native).nodes.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
  });
});

describe('D3 native endpoint rebasing', () => {
  it('rebases numeric endpoints after node reordering without reversing topology', () => {
    const graph = fromD3Graph({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 0, target: 1, custom: 'keep' }] });
    graph.nodes.reverse();
    const native = toD3Graph(graph);
    expect(native.links[0]).toMatchObject({ source: 1, target: 0, custom: 'keep' });
    expect(fromD3Graph(native).edges[0]).toMatchObject({ sourceId: 'a', targetId: 'b' });
  });

  it('rebases numeric endpoints after inserting or deleting nodes', () => {
    const graph = fromD3Graph({ nodes: [{ id: 'a' }, { id: 'unused' }, { id: 'b' }], links: [{ source: 0, target: 2 }] });
    graph.nodes = [createGraph({ nodes: [{ id: 'new' }] }).nodes[0], graph.nodes[0], graph.nodes[2]];
    expect(toD3Graph(graph).links[0]).toMatchObject({ source: 1, target: 2 });
  });

  it('rebinds live object endpoints to renamed and edited current nodes', () => {
    const a = { id: 'a', label: 'Before', custom: 'keep' }, b = { id: 'b' };
    const graph = JSON.parse(JSON.stringify(fromD3Graph({ nodes: [a, b], links: [{ source: a, target: b }] })));
    graph.nodes[0].id = 'renamed'; graph.nodes[0].label = 'After'; graph.edges[0].sourceId = 'renamed';
    graph.nodes.reverse();
    const native = toD3Graph(graph);
    expect(native.links[0].source).toBe(native.nodes[1]);
    expect(native.links[0].source).toMatchObject({ id: 'renamed', label: 'After', custom: 'keep' });
    expect(fromD3Graph(native).edges[0].sourceId).toBe('renamed');
  });
  it('does not attach deleted native node attributes to a new replacement', () => {
    const graph = JSON.parse(JSON.stringify(fromD3Graph({ nodes: [{ id: 'a', custom: 'old' }, { id: 'b' }], links: [{ source: 0, target: 1 }] })));
    graph.nodes[0] = createGraph({ nodes: [{ id: 'replacement' }] }).nodes[0];
    graph.edges[0].sourceId = 'replacement';
    const native = toD3Graph(graph);
    expect(native.nodes[0]).not.toHaveProperty('custom');
    expect(fromD3Graph(native).edges[0].sourceId).toBe('replacement');
  });
});

describe('native carriers consume arbitrary user payloads exactly once', () => {
  function getLookalike(format: string, native: unknown): any {
    return { __statelyaiNative: { kind: '@statelyai/graph/native', version: 1, format,
      data: 'payload', native, baseline: { id: '', mode: 'directed', direction: 'down', data: 1, nodes: [], edges: [] } } };
  }
  it('D3 preserves a valid-looking foreign carrier plus a sibling edit', () => {
    const data = getLookalike('d3', { nodes: [], links: [], data: 2 });
    const graph = fromD3Graph({ nodes: [], links: [], data }); graph.data.foo = 3;
    expect(toD3Graph(graph).data).toEqual({ ...data, foo: 3 });
  });
  it('Cytoscape preserves a valid-looking foreign carrier plus a sibling edit', () => {
    const data = getLookalike('cytoscape', { elements: { nodes: [], edges: [] }, data: { graphData: 2 } });
    const graph = fromCytoscapeJSON({ elements: { nodes: [], edges: [] }, data: { graphData: data } }); graph.data.foo = 3;
    expect(toCytoscapeJSON(graph).data!.graphData).toEqual({ ...data, foo: 3 });
  });
  it('ELK preserves a valid-looking foreign carrier inside legacy Graph data', () => {
    const data = getLookalike('elk', { id: 'fake', children: [] });
    const graph = fromELK({ id: 'root', layoutOptions: { 'statelyai.metadata': JSON.stringify({ graph: { data } }) } }); graph.data.foo = 3;
    const emitted = toELK(graph);
    const metadata = JSON.parse(emitted.layoutOptions!['statelyai.metadata']);
    expect(metadata.original.data).toEqual({ ...data, foo: 3 });
  });
  it('xyflow preserves a valid-looking foreign carrier inside legacy Graph data', () => {
    const data = getLookalike('xyflow', { nodes: [], edges: [] });
    const graph = fromXYFlow({ nodes: [], edges: [], data: { __statelyai: { graph: { data } } } }); graph.data.foo = 3;
    const emitted = toXYFlow(graph);
    expect((emitted.data!.__statelyai as any).original.data).toEqual({ ...data, foo: 3 });
  });
  it('JGF preserves a valid-looking foreign carrier inside native metadata', () => {
    const data = getLookalike('jgf', { graph: { nodes: [], edges: [] } });
    const graph = fromJGF({ graph: { nodes: [], edges: [], metadata: data } }, { metadata: 'native' }); graph.data.foo = 3;
    const emitted = toJGF(graph, { version: 1 });
    expect(emitted.graph.metadata?.__statelyai.original.data).toEqual({ ...data, foo: 3 });
  });
});


describe('ELK native port identity during Graph edits', () => {
  it('retains native port ID, endpoints and foreign attrs when geometry changes', () => {
    const graph = fromELK({ id: 'root', children: [{ id: 'a', ports: [{ id: 'p', x: 1, custom: 'keep' } as any] }, { id: 'b' }], edges: [{ id: 'e', sources: ['p'], targets: ['b'] }] });
    graph.nodes[0].ports![0].x = 2;
    const native = toELK(graph);
    expect(native.children![0].ports![0]).toMatchObject({ id: 'p', x: 2, custom: 'keep' });
    expect(native.edges![0].sources).toEqual(['p']);
    expect(fromELK(native).edges[0]).toMatchObject({ sourceId: 'a', sourcePort: 'p' });
  });
});


describe('minimal codec policies', () => {
  it('preserves explicit parallel adjacency multiplicity with reciprocal entries', () => {
    expect(fromAdjacencyList({ a: ['b', 'b'], b: ['a', 'a'] }, { directed: false, parallel: 'preserve' }).edges).toHaveLength(2);
    expect(fromAdjacencyList({ a: ['b', 'b'], b: [] }, { parallel: 'preserve' }).edges).toHaveLength(2);
    expect(fromAdjacencyList({ a: ['b', 'b'] }).edges).toHaveLength(1);
  });
  it('exports each edge mode even when it differs from graph mode', () => {
    const graph = createGraph({ mode: 'directed', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', mode: 'undirected' }] });
    expect(toAdjacencyList(graph)).toEqual({ a: ['b'], b: ['a'] });
    expect(Object.getPrototypeOf(toAdjacencyList(graph))).toBe(Object.prototype);
  });
  it('rejects multiline TGF labels rather than emitting new records', () => {
    expect(() => toTGF(createGraph({ nodes: [{ id: 'a', label: 'one\ntwo' }] }))).toThrow(/label/);
    expect(() => toTGF(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: 'one\r\ntwo' }] }))).toThrow(/label/);
  });
});


describe('ELK native section correspondence', () => {
  it('edits the imported first section while retaining its identity and other sections', () => {
    const second = { id: 's2', startPoint: { x: 5, y: 6 }, endPoint: { x: 7, y: 8 }, incomingSections: ['s1'], custom: 'second' };
    const graph = fromELK({ id: 'root', children: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sources: ['a'], targets: ['b'], sections: [
      { id: 's1', startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 }, outgoingSections: ['s2'], custom: 'first' } as any, second as any ] }] });
    graph.edges[0].points![0].x = 10;
    const sections = toELK(graph).edges![0].sections!;
    expect(sections[0]).toMatchObject({ id: 's1', startPoint: { x: 10, y: 2 }, outgoingSections: ['s2'], custom: 'first' });
    expect(sections[1]).toEqual(second);
  });
});


describe('JGF v2 hyperedge projection boundary', () => {
  it('rejects hyperedges instead of quietly omitting their semantics', () => {
    expect(() => fromJGF({ graph: { directed: false, nodes: { a: {}, b: {} }, hyperedges: [{ nodes: ['a', 'b'] }] } })).toThrow(/hyperedges/);
  });
});
