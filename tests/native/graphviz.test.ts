import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromDOT, toDOT } from '../../src/formats/dot';

interface NativeGraph { name: string; directed: boolean; strict: boolean; rankdir?: string; objects: Array<Record<string, any> & { _gvid: number; name: string }>; edges?: Array<Record<string, any> & { tail: number; head: number }> }
let engine: Awaited<ReturnType<typeof Graphviz.load>>;
beforeAll(async () => { engine = await Graphviz.load(); });
function getNative(source: string): NativeGraph { return JSON.parse(engine.layout(source, 'json', 'dot')); }
function getTopology(native: NativeGraph) {
  const names = new Map(native.objects.map((object) => [object._gvid, object.name]));
  return { directed: native.directed, strict: native.strict, nodes: native.objects.filter((object) => !object.nodes).map((object) => object.name).sort(),
    edges: (native.edges ?? []).map((edge) => [names.get(edge.tail), names.get(edge.head)]) };
}

describe('Graphviz 15.0.0 native parser/layout oracle', () => {
  it('pins the independent engine version', () => { expect(engine.version()).toBe('15.0.0'); });
  it('parses emitted DOT topology, isolated nodes, Unicode, parallel edges and modes', () => {
    const graph = createGraph({ id: 'network 🕸️', direction: 'right', mode: 'bidirectional',
      nodes: [{ id: 'a', label: 'A', shape: 'rectangle', color: '#abcdef' }, { id: 'b', label: 'B' }, { id: 'isolated 🕸️', label: 'Isolated' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: 'Edge', color: '#123456' }, { id: 'parallel', sourceId: 'a', targetId: 'b', mode: 'undirected', label: 'Second' }] });
    const native = getNative(toDOT(graph));
    expect(getTopology(native)).toEqual({ directed: true, strict: false, nodes: ['a', 'b', 'isolated 🕸️'], edges: [['a', 'b'], ['a', 'b']] });
    expect(native.name).toBe(graph.id);
    expect(native.rankdir).toBe('LR');
    expect(native.objects.find((object) => object.name === 'a')).toMatchObject({ label: 'A', shape: 'box', fillcolor: '#abcdef', style: 'filled' });
    expect(native.edges![0]).toMatchObject({ label: 'Edge', color: '#123456', dir: 'both' });
    expect(native.edges![1]).toMatchObject({ label: 'Second', dir: 'none' });
  });
  it('renders explicit empty node labels as empty rather than Graphviz default node IDs', () => {
    const native = getNative(toDOT(createGraph({ nodes: [{ id: 'empty', label: '' }, { id: 'missing', label: null }] })));
    expect(native.objects.find((object) => object.name === 'empty')!.label).toBe('');
    expect(native.objects.find((object) => object.name === 'missing')!.label).toBe('\\N');
  });
  it('retains native strict merge attributes and latest explicit endpoint ports', () => {
    const source = 'strict digraph G { a [shape=record,label="<p>P|<r>R"]; b [shape=record,label="<q>Q"]; a:p:n -> b:q:s [weight=2,label="Edge"]; a:r -> b [color=red]; isolated; }';
    const expected = getNative(source), emitted = getNative(toDOT(fromDOT(source)));
    expect(getTopology(emitted)).toEqual(getTopology(expected));
    expect(expected.edges![0]).toMatchObject({ tailport: 'r', headport: 'q:s', label: 'Edge', color: 'red', weight: '2' });
    expect(emitted.edges![0]).toMatchObject({ tailport: 'r', headport: 'q:s', label: 'Edge', color: 'red', weight: '2' });
  });
  it('retains native compass-only endpoints and cluster/rank topology', () => {
    const source = 'digraph G { subgraph cluster_group { a [label="A"]; b; } {rank=same; a; c;} a:n -> c:s [label="E"]; isolated; }';
    const expected = getNative(source), emitted = getNative(toDOT(fromDOT(source)));
    expect(getTopology(emitted)).toEqual(getTopology(expected));
    expect(emitted.edges![0]).toMatchObject({ tailport: 'n', headport: 's', label: 'E' });
    const getMembers = (native: NativeGraph) => {
      const names = new Map(native.objects.map((object) => [object._gvid, object.name]));
      return native.objects.find((object) => object.name === 'cluster_group')!.nodes.map((id: number) => names.get(id)).sort();
    };
    expect(getMembers(emitted)).toEqual(getMembers(expected));
  });
  it('keeps unknown native graph/node/edge attributes authoritative through export', () => {
    const source = 'graph G { graph[bgcolor="pink"]; node[fontname="Courier"]; a[label="A",tooltip="KEEP",color=red,fillcolor=blue,style=filled]; b; a -- b[penwidth=3,label="E"]; }';
    const native = getNative(toDOT(fromDOT(source)));
    expect(native).toMatchObject({ directed: false, bgcolor: 'pink' });
    expect(native.objects.find((object) => object.name === 'a')).toMatchObject({ label: 'A', tooltip: 'KEEP', color: 'red', fillcolor: 'blue', style: 'filled', fontname: 'Courier' });
    expect(native.edges![0]).toMatchObject({ penwidth: '3', label: 'E' });
  });
  it('rejects malformed syntax using Graphviz independently', () => {
    expect(() => engine.layout('digraph { a -> ; }', 'json', 'dot')).toThrow();
  });
  it('verifies vendored native JSON fixtures and their endpoint reference domain', () => {
    const directory = new URL('./fixtures/graphviz/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8')) as { engineVersion: string; files: Array<{ file: string; sha256: string }> };
    expect(manifest.engineVersion).toBe(engine.version());
    for (const item of manifest.files) {
      const bytes = readFileSync(new URL(item.file, directory));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
      if (item.file.endsWith('.json')) {
        const fixture = JSON.parse(bytes.toString('utf8')) as NativeGraph;
        const indices = new Set(fixture.objects.map((object) => object._gvid));
        for (const edge of fixture.edges ?? []) { expect(indices.has(edge.tail)).toBe(true); expect(indices.has(edge.head)).toBe(true); }
        const source = readFileSync(new URL(item.file.replace('.json', '.dot'), directory), 'utf8');
        expect(getTopology(getNative(source))).toEqual(getTopology(fixture));
      }
    }
  });
});

it('preserves missing native labels as Graphviz default ID labels during conversion', () => {
  const source = 'digraph { a; b [label=""]; }';
  const native = getNative(toDOT(fromDOT(source)));
  expect(native.objects.find((object) => object.name === 'a')!.label).toBe('\\N');
  expect(native.objects.find((object) => object.name === 'b')!.label).toBe('');
});

it('rejects actual native NUL scanning and guards emitted strings without rejecting escaped private JSON', () => {
  expect(() => getNative('digraph { a [label="A\u0000B"]; }')).toThrow();
  for (const value of ['A\u0000B', '\ud800']) {
    expect(() => toDOT(createGraph({ nodes: [{ id: 'a', label: value }] }))).toThrow(/Unicode scalar/);
    expect(() => toDOT(createGraph({ id: value, nodes: [{ id: 'a' }] }))).toThrow(/Unicode scalar/);
  }
  const source = toDOT(createGraph({ nodes: [{ id: 'a', label: 'A', data: { nul: '\u0000', surrogate: '\ud800' } }] }));
  expect(getNative(source).objects[0].label).toBe('A'); expect(fromDOT(source).nodes[0].data).toEqual({ nul: '\u0000', surrogate: '\ud800' });
});
