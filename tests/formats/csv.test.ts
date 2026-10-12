import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromCSV, toCSV, fromTSV, toTSV, csvDocumentConverter, tsvDocumentConverter, type CSVGraphSource, type CSVGraphSchema } from '../../src/formats/csv';

const schema: CSVGraphSchema = {
  nodes: [{ name: 'key', field: 'id', type: 'string', required: true }, { name: 'title', field: 'label', type: 'string' }, { name: 'value', field: 'data', type: 'json' }],
  edges: [{ name: 'key', field: 'id', type: 'string', required: true }, { name: 'from', field: 'sourceId', type: 'string', required: true }, { name: 'to', field: 'targetId', type: 'string', required: true }, { name: 'cost', field: 'weight', type: 'number' }, { name: 'kind', field: 'mode', type: 'mode' }, { name: 'flag', field: 'data', type: 'boolean' }],
};
const source: CSVGraphSource = { nodes: 'key,title,value\r\na,"Title, \"\"quoted\"\" 東京\r\nsecond line",null\r\nb,B,0\r\nIsolated,,[]\r\n', edges: 'key,from,to,cost,kind,flag\r\ne,a,b,1.5,undirected,true\r\n', schema };

describe('CSV/TSV graph tables', () => {
  it('reads explicit typed columns with quoted delimiters, doubled quotes, embedded CRLF and isolated nodes', () => {
    const graph = fromCSV(source);
    expect(graph.nodes.map((node) => [node.id, node.label, node.data])).toEqual([['a', 'Title, "quoted" 東京\r\nsecond line', null], ['b', 'B', 0], ['Isolated', '', []]]);
    expect(graph.edges[0]).toMatchObject({ id: 'e', sourceId: 'a', targetId: 'b', weight: 1.5, mode: 'undirected', data: true });
  });

  it.each([',', '\t'] as const)('retains full JSON Graph values and field presence using generated %s schema', (delimiter) => {
    const graph = createGraph<any, any, any, any>({ id: 'Root', mode: 'bidirectional', data: [null, '', 0, false], direction: 'right', nodes: [
      { id: 'a,東京', label: null, parentId: null, data: { __statelyai: { user: true }, text: 'one\r\ntwo "quotes" \\' }, ports: [{ name: 'out', direction: 'out', data: 7 }], x: 0, y: 2, style: { visible: true } },
      { id: 'b', label: '', data: false, ports: [{ name: 'in', direction: 'in', data: null }] },
      { id: 'Isolated', data: ['a', null] },
    ], edges: [{ id: 'e1', sourceId: 'a,東京', targetId: 'b', sourcePort: 'out', targetPort: 'in', mode: 'undirected', weight: 0, data: 3, points: [{ x: 0, y: 2 }] }, { id: 'e2', sourceId: 'a,東京', targetId: 'b', label: 'Parallel', data: 'text' }] });
    delete graph.nodes[2].label;
    Object.defineProperty(graph.nodes[0], '__proto__', { value: { safe: true }, enumerable: true });
    const wire = toCSV(graph, { delimiter });
    expect(fromCSV(JSON.parse(JSON.stringify(wire)))).toEqual(graph);
    if (delimiter === '\t') expect(fromTSV(toTSV(graph))).toEqual(graph);
  });

  it('distinguishes missing, null and empty JSON labels visibly in cells', () => {
    const graph = createGraph<any, any, any, any>({ nodes: [{ id: 'missing' }, { id: 'null', label: null }, { id: 'empty', label: '' }] });
    delete graph.nodes[0].label;
    const wire = toCSV(graph);
    const result = fromCSV(wire);
    expect(Object.hasOwn(result.nodes[0], 'label')).toBe(false);
    expect(result.nodes[1].label).toBeNull();
    expect(result.nodes[2].label).toBe('');
    expect(wire.nodes).toContain('null');
    expect(wire.nodes).toContain('""""""');
  });

  it('keeps native metadata interpretation explicit and documents opt-out losses', () => {
    const graph = createGraph<any, any, any, any>({ id: 'g', data: 1, nodes: [{ id: 'a', label: null }] });
    (graph.nodes[0] as any).future = 'extra';
    const wire = toCSV(graph);
    expect((fromCSV(wire).nodes[0] as any).future).toBe('extra');
    expect((fromCSV(wire, { metadata: 'native' }).nodes[0] as any).future).toBeUndefined();
    const minimal = toCSV(graph, { nativeCarrier: false });
    expect(minimal.graph).toBeUndefined();
    expect(minimal.nodes).not.toContain('__extra');
    expect(fromCSV(minimal).id).toBe('');
  });

  it('requires separate header-bearing node and edge tables including empty graphs', () => {
    expect(fromCSV(toCSV(createGraph<any, any, any, any>({}))).nodes).toEqual([]);
    expect(() => fromCSV({ nodes: '', edges: '' })).toThrow('header');
    expect(() => fromCSV({ nodes: 'label\nA', edges: 'id,sourceId,targetId' })).toThrow('header');
    expect(fromCSV({ nodes: '\ufeffid\r\na\r\n', edges: 'id,sourceId,targetId\r\n' }).nodes[0].id).toBe('a');
  });

  it.each([
    [{ nodes: 'id,id\na,a', edges: 'id,sourceId,targetId' }, 'headers'],
    [{ nodes: 'id\na\na', edges: 'id,sourceId,targetId' }, 'node IDs'],
    [{ nodes: 'id\na', edges: 'id,sourceId,targetId\ne,a,a\ne,a,a' }, 'edge IDs'],
    [{ nodes: 'id\na', edges: 'id,sourceId,targetId\ne,a,missing' }, 'endpoints'],
    [{ nodes: 'id\n"unterminated', edges: 'id,sourceId,targetId' }, 'unterminated'],
    [{ nodes: 'id\na"bad', edges: 'id,sourceId,targetId' }, 'quote'],
    [{ nodes: 'id\n"a"garbage', edges: 'id,sourceId,targetId' }, 'unexpected'],
    [{ nodes: 'id\na\r', edges: 'id,sourceId,targetId' }, 'bare CR'],
    [{ nodes: 'id,label\na', edges: 'id,sourceId,targetId' }, 'row'],
    [{ nodes: 'id,data\na,NaN', edges: 'id,sourceId,targetId' }, 'JSON'],
    [{ nodes: 'id,data\na,1e999', edges: 'id,sourceId,targetId' }, 'JSON'],
    [{ nodes: 'id\na', edges: 'id,sourceId,targetId,mode\ne,a,a,"""invalid"""' }, 'mode'],
  ] as Array<[CSVGraphSource, string]>)('rejects malformed tables/domain: %s', (wire, message) => { expect(() => fromCSV(wire)).toThrow(message); });

  it('rejects malformed typed cells and schema rather than guessing', () => {
    for (const [cell, field] of [['01', 'cost'], ['Infinity', 'cost'], ['yes', 'flag'], ['unknown', 'kind']]) {
      const graph = { ...source, edges: source.edges.replace(field === 'cost' ? '1.5' : field === 'flag' ? 'true' : 'undirected', cell) };
      expect(() => fromCSV(graph)).toThrow(field === 'kind' ? 'mode' : field === 'flag' ? 'boolean' : 'number');
    }
    expect(() => fromCSV({ ...source, schema: { nodes: [{ name: 'key', field: 'id', type: 'string' }, { name: 'key', field: 'label', type: 'string' }] } })).toThrow('duplicate schema');
    expect(() => fromCSV({ ...source, schema: { nodes: [{ name: 'x', field: 'label', type: 'string' }] } })).toThrow('schema requires');
    expect(() => toCSV(createGraph<any, any, any, any>({ nodes: [{ id: 'a' }] }), { schema: { nodes: [{ name: 'id', field: 'id', type: 'string' }, { name: 'label', field: 'label', type: 'string' }] } })).toThrow('cannot be encoded');
  });

  it('rejects non-JSON Graph data before silently dropping information', () => {
    for (const data of [NaN, new Date(), { fn() {} }, [undefined], { value: undefined }, Symbol('x')]) expect(() => toCSV(createGraph<any, any, any, any>({ nodes: [{ id: 'a', data }] }))).toThrow('CSV');
    const cycle: any = {}; cycle.self = cycle;
    expect(() => toCSV(createGraph<any, any, any, any>({ data: cycle }))).toThrow('cyclic');
  });

  it('patches known cells while retaining exact unrelated columns, quotes, CRLF and metadata', () => {
    const wire: CSVGraphSource = { nodes: 'id,label,future\r\n"a","""Before"""," untouched "\r\nb,"""B""",raw\r\n', edges: 'id,sourceId,targetId,weight,note\r\ne,a,b,1,"Keep, this"\r\n', metadata: { vendor: ['exact', null] } };
    const document = csvDocumentConverter.from(wire);
    expect(csvDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toEqual(wire);
    document.graph!.nodes[0].label = 'After "quoted"\nline';
    document.graph!.edges[0].weight = 2;
    const result = csvDocumentConverter.to(document);
    expect(result.nodes).toContain('" untouched "\r\nb,"""B""",raw\r\n');
    expect(result.edges).toBe(wire.edges.replace(',1,', ',2,'));
    expect(result.metadata).toEqual(wire.metadata);
    expect(fromCSV(result).nodes[0].label).toBe('After "quoted"\nline');
  });

  it('merges independent source changes and reports mapped conflicts or unsupported structure', () => {
    const document = csvDocumentConverter.from({ nodes: 'id,label,future\na,"""Before""",x\n', edges: 'id,sourceId,targetId\n' });
    document.source.nodes = document.source.nodes.replace(',x', ',y');
    document.graph!.nodes[0].label = 'After';
    expect(csvDocumentConverter.to(document).nodes).toContain(',y\n');
    document.source.nodes = document.source.nodes.replace('Before', 'Native');
    expect(() => csvDocumentConverter.to(document)).toThrow('conflicting-edit');
    const structural = csvDocumentConverter.from(toCSV(createGraph<any, any, any, any>({ nodes: [{ id: 'a' }] })));
    structural.graph!.nodes.push({ type: 'node', id: 'b', data: null });
    expect(() => csvDocumentConverter.to(structural)).toThrow('unsupported-edit');
  });

  it('patches TSV without inventing schema metadata on an external source', () => {
    const wire = { nodes: 'id\tlabel\tunknown\na\t"""Before"""\tkeep\n', edges: 'id\tsourceId\ttargetId\n' };
    const document = tsvDocumentConverter.from(wire);
    document.graph!.nodes[0].label = 'After';
    const result = tsvDocumentConverter.to(document);
    expect(result).toEqual({ ...wire, nodes: wire.nodes.replace('Before', 'After') });
  });

  it('patches root data/style and removes a mapped optional value with reparse proof', () => {
    const graph = createGraph<any, any, any, any>({ id: 'g', data: { old: true }, nodes: [{ id: 'a', label: 'Before' }] });
    const document = csvDocumentConverter.from(toCSV(graph));
    document.graph!.data = [false, null];
    document.graph!.style = { stroke: 'blue' };
    delete document.graph!.nodes[0].label;
    const source = csvDocumentConverter.to(document);
    expect(source.graph!.data).toEqual([false, null]);
    expect(fromCSV(source).style).toEqual({ stroke: 'blue' });
    expect(Object.hasOwn(fromCSV(source).nodes[0], 'label')).toBe(false);
  });

  it('rejects structural mapped cell edits and missing source cells', () => {
    const portDocument = csvDocumentConverter.from(toCSV(createGraph<any, any, any, any>({ nodes: [{ id: 'a', ports: [{ name: 'p' }] }] })));
    portDocument.graph!.nodes[0].ports![0].name = 'renamed';
    expect(() => csvDocumentConverter.to(portDocument)).toThrow('unsupported-edit');
    const missing = csvDocumentConverter.from({ nodes: 'id\na\n', edges: 'id,sourceId,targetId\n' });
    missing.graph!.nodes[0].label = 'New';
    expect(() => csvDocumentConverter.to(missing)).toThrow('no declared source cell');
  });

  it('exports configured number/boolean/mode cells without coercion', () => {
    const graph = fromCSV(source);
    const emitted = toCSV(graph, { schema, lineEnding: '\n' });
    expect(emitted.edges).toBe('key,from,to,cost,kind,flag\ne,a,b,1.5,undirected,true\n');
    expect(fromCSV(emitted)).toEqual(graph);
    expect(() => toCSV(graph, { lineEnding: '\r' as any })).toThrow('line ending');
    expect(() => fromCSV(source, { delimiter: ';' as any })).toThrow('delimiter');
  });

  it('processes ten thousand rows with identity and source patch correspondence intact', () => {
    const graph = createGraph<any, any, any, any>({ nodes: Array.from({ length: 10_000 }, (_, index) => ({ id: `n${index}`, data: index })) });
    const wire = toCSV(graph);
    const document = csvDocumentConverter.from(wire);
    document.graph!.nodes[9999].data = 10000;
    expect(fromCSV(csvDocumentConverter.to(document)).nodes[9999].data).toBe(10000);
  });
  it.each([
    ['label', '123', 'label'], ['x', '"heavy"', 'finite'], ['style', '[]', 'style'],
    ['parentId', '123', 'parent'], ['ports', '"bad"', 'ports'],
  ])('validates typed node fields despite JSON cell syntax: %s', (field, value, message) => {
    const cell = `"${value.replace(/"/g, '""')}"`;
    expect(() => fromCSV({ nodes: `id,${field}\na,${cell}\n`, edges: 'id,sourceId,targetId\n' })).toThrow(message);
  });

  it('validates typed weight, geometry and roots even with declared text cells', () => {
    expect(() => fromCSV({ nodes: 'id\na\n', edges: 'id,sourceId,targetId,weight\ne,a,a,"""heavy"""\n' })).toThrow('finite');
    expect(() => fromCSV({ nodes: 'id,x\na,heavy\n', edges: 'id,sourceId,targetId\n', schema: { nodes: [{ name: 'id', field: 'id', type: 'string' }, { name: 'x', field: 'x', type: 'string' }] } })).toThrow('finite');
    expect(() => fromCSV({ nodes: 'id\na\n', edges: 'id,sourceId,targetId\n', graph: { mode: null } })).toThrow('mode');
    expect(() => fromCSV({ nodes: 'id\na\n', edges: 'id,sourceId,targetId\n', graph: { style: [] } })).toThrow('style');
  });

  it('protects required/type fields from extra cells while preserving hostile user names', () => {
    const graph = createGraph<any, any, any, any>({ nodes: [{ id: '__proto__', data: JSON.parse('{"constructor":"value","__proto__":{"safe":true}}') }] });
    (graph.nodes[0] as any).$extra = 'actual user field';
    expect(fromCSV(toCSV(graph))).toEqual(graph);
    const malicious = 'id,__extra\na,"{\"\"type\"\":\"\"edge\"\"}"\n';
    expect(() => fromCSV({ nodes: malicious, edges: 'id,sourceId,targetId\n' })).toThrow('collides');
  });

});
