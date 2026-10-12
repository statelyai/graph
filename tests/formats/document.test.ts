import { describe, expect, it } from 'vitest';
import { createGraph, createVisualGraph } from '../../src/graph';
import { createGraphDocumentConverter, getGraphDocumentUpdate, type GraphDocumentPatchContext } from '../../src/formats/document';
import { adjacencyListDocumentConverter } from '../../src/formats/adjacency-list';
import type { Graph, VisualGraph } from '../../src/types';

interface NativeJSON { nodes: Array<{ id: string; label?: string; future?: string }>; future?: { revision: number } }
const codec = {
  from(source: NativeJSON): Graph { return createGraph({ nodes: source.nodes.map((node) => ({ id: node.id, label: node.label })) }); },
  to(graph: Graph): NativeJSON { return { nodes: graph.nodes.map((node) => ({ id: node.id, ...(node.label != null && { label: node.label }) })) }; },
};

function createTestConverter() {
  return createGraphDocumentConverter({
    format: 'test-json', codec,
    patch(context: GraphDocumentPatchContext<NativeJSON>) {
      if (context.changes.some((change) => change.entity !== 'node' || change.field !== 'label')) return { ok: false as const, diagnostics: [{ code: 'unsupported-edit', message: 'Only node labels are supported', severity: 'error' as const }] };
      const source = context.source;
      for (const change of context.changes) {
        const node = source.nodes.find((entry) => entry.id === change.id)!;
        if (change.afterPresent && typeof change.after === 'string') node.label = change.after;
        else delete node.label;
      }
      return { ok: true as const, source };
    },
  });
}

describe('GraphDocument core', () => {
  it('returns exact native text after JSON persistence without assuming semantic completeness', () => {
    const converter = createGraphDocumentConverter({ format: 'text', codec: { from: (_source: string) => createGraph({}), to: (_graph: Graph) => 'regenerated' } });
    const source = '# copyright\r\nunknown syntax\t\n';
    const document = converter.from(source);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ code: 'projection-partial' }));
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
  });

  it('stores independent exact native JSON and graph baselines', () => {
    const converter = createTestConverter();
    const source: NativeJSON = { nodes: [{ id: 'a', label: 'Before', future: 'extension' }], future: { revision: 1 } };
    const document = converter.from(source);
    source.nodes[0].label = 'Outside mutation';
    source.future!.revision = 2;
    expect(document.source.nodes[0].label).toBe('Before');
    document.graph!.nodes[0].label = 'After';
    expect(document.baseline.graph!.nodes[0].label).toBe('Before');
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toEqual({ nodes: [{ id: 'a', label: 'After', future: 'extension' }], future: { revision: 1 } });
  });

  it('merges independent source extension and Graph label edits', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }], future: { revision: 1 } });
    document.source.future!.revision = 2;
    document.graph!.nodes[0].label = 'After';
    expect(converter.to(document)).toEqual({ nodes: [{ id: 'a', label: 'After' }], future: { revision: 2 } });
  });

  it('native source edits remain authoritative when Graph is unchanged', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }] });
    document.source.nodes[0].label = 'Native edit';
    expect(converter.to(document).nodes[0].label).toBe('Native edit');
  });

  it('diagnoses conflicting mapped edits with stable entity paths', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a/b', label: 'Before' }] });
    document.source.nodes[0].label = 'Native';
    document.graph!.nodes[0].label = 'Graph';
    expect(getGraphDocumentUpdate(document, converter)).toEqual({ ok: false, diagnostics: [expect.objectContaining({ code: 'conflicting-edit', path: '/nodes/a~1b/label' })] });
    expect(() => converter.to(document)).toThrow('conflicting-edit');
  });

  it('merges mapped edits on different entities rather than replaying a stale projection', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    document.source.nodes[0].label = 'Native A';
    document.graph!.nodes[1].label = 'Graph B';
    expect(converter.to(document).nodes.map((node) => node.label)).toEqual(['Native A', 'Graph B']);
  });

  it('rejects structural edits and absent patch policies by default', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a' }] });
    document.graph!.nodes.push({ type: 'node', id: 'b', label: 'B', data: null });
    expect(() => converter.to(document)).toThrow('unsupported-edit');
    const withoutPatch = createGraphDocumentConverter({ format: 'test-json', codec });
    const labelEdit = withoutPatch.from({ nodes: [{ id: 'a' }] });
    labelEdit.graph!.nodes[0].label = 'After';
    expect(() => withoutPatch.to(labelEdit)).toThrow('unsupported-edit');
    expect(getGraphDocumentUpdate(labelEdit, withoutPatch, { mode: 'regenerate' })).toMatchObject({ ok: true, diagnostics: [{ code: 'lossy-regeneration' }] });
  });

  it('rejects a patch that ignores requested edits through post-patch projection proof', () => {
    const converter = createGraphDocumentConverter({ format: 'test-json', codec, patch: (context) => ({ ok: true, source: context.source }) });
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }] });
    document.graph!.nodes[0].label = 'After';
    expect(() => converter.to(document)).toThrow('patch-verification-failed');
  });

  it('preserves unavailable projections and strict import errors explicitly', () => {
    const converter = createGraphDocumentConverter({ format: 'hypergraph', codec: { from: (_source: string): Graph => { throw new Error('Hyperedge has three endpoints'); }, to: (_graph: Graph) => '' } });
    const source = '# comment\nhyperedge a,b,c';
    const document = converter.from(source);
    expect(document.graph).toBeNull();
    expect(document.diagnostics[0].code).toBe('projection-unavailable');
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
    expect(() => converter.from(source, { strict: true })).toThrow('Hyperedge');
  });

  it.each([NaN, Infinity, -Infinity, () => {}, Symbol('invalid'), 1n, new Date(), { value: undefined }, [undefined]])('rejects non-JSON native values %s', (value) => {
    const converter = createGraphDocumentConverter({ format: 'json', codec: { from: (_source: unknown) => createGraph({}), to: (_graph: Graph) => null } });
    expect(() => converter.from(value)).toThrow('invalid-json-value');
  });

  it('rejects cycles/accessors/sparse arrays before silently losing source information', () => {
    const converter = createGraphDocumentConverter({ format: 'json', codec: { from: (_source: unknown) => createGraph({}), to: (_graph: Graph) => null } });
    const cycle: { self?: object } = {}; cycle.self = cycle;
    expect(() => converter.from(cycle)).toThrow('Cyclic');
    expect(() => converter.from({ get value() { throw new Error('Getter should never run'); } })).toThrow('Accessors');
    expect(() => converter.from(new Array(2))).toThrow('Sparse');
  });

  it('compares Graph optional undefined using its JSON view', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a' }] });
    document.graph!.nodes[0].parentId = undefined;
    expect(converter.to(JSON.parse(JSON.stringify(document)))).toEqual({ nodes: [{ id: 'a' }] });
  });

  it('validates envelope and baseline provenance rather than trusting forged snapshots', () => {
    const converter = createTestConverter();
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }] });
    document.baseline.graph!.nodes[0].label = 'Forged';
    expect(() => converter.to(document)).toThrow('invalid-baseline');
    document.version = 2 as 1;
    expect(() => converter.to(document)).toThrow('invalid-document');
  });

  it('infers VisualGraph codecs without weakening the projected type', () => {
    const converter = createGraphDocumentConverter({ format: 'visual', codec: {
      from: (_source: string): VisualGraph => createVisualGraph({ nodes: [{ id: 'a', x: 1, y: 2, width: 3, height: 4 }] }),
      to: (_graph: VisualGraph) => 'visual',
    } });
    const document = converter.from('visual');
    const width: number = document.graph!.nodes[0].width;
    expect(width).toBe(3);
  });
  it('updates ten thousand labels with independent native changes', () => {
    const converter = createGraphDocumentConverter({ format: 'bulk', codec, patch(context) {
      const labels = new Map(context.changes.map((change) => [change.id, change.after]));
      for (const node of context.source.nodes) if (labels.has(node.id)) node.label = labels.get(node.id) as string;
      return { ok: true, source: context.source };
    } });
    const document = converter.from({ nodes: Array.from({ length: 10_000 }, (_, index) => ({ id: `n${index}`, label: `Before ${index}` })) });
    document.source.future = { revision: 2 };
    for (let index = 0; index < document.graph!.nodes.length; index++) document.graph!.nodes[index].label = `After ${index}`;
    const result = converter.to(document);
    expect(result.future).toEqual({ revision: 2 });
    expect(result.nodes.map((node) => node.label)).toEqual(Array.from({ length: 10_000 }, (_, index) => `After ${index}`));
  });

  it('rejects private state edits even alongside user data edits in the same field', () => {
    const converter = createGraphDocumentConverter({ format: 'state', codec: {
      from: (source: { value: string }) => createGraph({ nodes: [{ id: 'a', data: { user: source.value, private: { token: 1 } } }] }),
      to: (_graph: Graph) => ({ value: 'generated' }),
    }, getComparisonGraph(graph) {
      for (const node of graph.nodes) node.data = { user: node.data.user };
      return graph;
    }, getComparisonState(graph) { return graph.nodes.map((node) => node.data.private); } });
    const document = converter.from({ value: 'Before' });
    document.graph!.nodes[0].data.user = 'After';
    document.graph!.nodes[0].data.private.token = 2;
    expect(() => converter.to(document)).toThrow('unsupported-state-edit');
  });

  it('rejects edited adapter state even alongside a supported Graph edit', () => {
    const converter = createGraphDocumentConverter({ format: 'adapter-state', codec,
      project(source: NativeJSON) { return { graph: codec.from(source), state: { revision: 1 } }; },
      patch(context) { return { ok: true, source: context.source }; },
    });
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }] });
    document.state = { revision: 2 };
    document.graph!.nodes[0].label = 'After';
    expect(() => converter.to(document)).toThrow('unsupported-state-edit');
  });

  it('reports projection limitations on update results and explicit null projections', () => {
    const converter = createTestConverter();
    expect(converter.getUpdate(converter.from({ nodes: [] }))).toMatchObject({ ok: true, diagnostics: [expect.objectContaining({ code: 'projection-partial' })] });
    const unavailable = createGraphDocumentConverter({ format: 'unavailable', codec, project: () => ({ graph: null }) });
    const document = unavailable.from({ nodes: [] });
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ code: 'projection-unavailable' }));
    expect(() => unavailable.from({ nodes: [] }, { strict: true })).toThrow('projection-unavailable');
  });

  it('discloses requested Graph label loss when explicitly regenerating adjacency source', () => {
    const document = adjacencyListDocumentConverter.from({ a: ['b'] });
    document.graph!.nodes[0].label = 'Requested label';
    expect(() => adjacencyListDocumentConverter.to(document)).toThrow('unsupported-edit');
    const result = adjacencyListDocumentConverter.getUpdate(document, { mode: 'regenerate' });
    expect(result).toMatchObject({ ok: true, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'lossy-regeneration', severity: 'warning' }),
      expect.objectContaining({ code: 'graph-regeneration-loss', path: '/nodes/a/label', severity: 'warning' }),
    ]) });
  });

  it('discloses an unavailable generated projection from a broken codec', () => {
    const converter = createGraphDocumentConverter({ format: 'broken', codec: {
      from(source: string) { if (source === 'broken') throw new Error('Invalid generated syntax'); return createGraph({ nodes: [{ id: 'a', label: 'Before' }] }); },
      to(_graph: Graph) { return 'broken'; },
    } });
    const document = converter.from('valid');
    document.graph!.nodes[0].label = 'After';
    expect(() => converter.to(document)).toThrow('unsupported-edit');
    expect(converter.getUpdate(document, { mode: 'regenerate' })).toMatchObject({ ok: true, source: 'broken', diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'graph-regeneration-unavailable', severity: 'warning', message: expect.stringContaining('Invalid generated syntax') }),
    ]) });
  });

  it('reports known Graph data loss from a codec that drops requested fields', () => {
    const converter = createGraphDocumentConverter({ format: 'drops-data', codec });
    const document = converter.from({ nodes: [{ id: 'a', label: 'Before' }] });
    document.graph!.nodes[0].data = { requested: 'retain' };
    expect(converter.getUpdate(document, { mode: 'regenerate' })).toMatchObject({ ok: true, diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'graph-regeneration-loss', path: '/nodes/a/data', severity: 'warning' }),
    ]) });
  });

});
