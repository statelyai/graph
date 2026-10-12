import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import packageJSON from '../../package.json';
import { createGraph } from '../../src/graph';
import { fromCSV, toCSV, toTSV, csvDocumentConverter, type CSVGraphSource } from '../../src/formats/csv';

function getNativeRows(source: string, delimiter = ','): string[][] { return parse(source, { delimiter, bom: true, skip_empty_lines: false }); }

describe('csv-parse 7.0.3 graph table oracle', () => {
  it('pins the independent native parser', () => { expect(packageJSON.devDependencies['csv-parse']).toBe('7.0.3'); });
  it.each([',', '\t'] as const)('decodes exact generated %s cell values and Graph semantics', (delimiter) => {
    const graph = createGraph<any, any, any, any>({ id: 'Root', mode: 'undirected', data: { extra: [null, false] }, nodes: [
      { id: 'a,\t東京', label: 'Say "yes"\r\nthen \\', data: { text: 'literal comma, tab\t and \\' } },
      { id: 'b', label: '', data: 0 }, { id: 'isolated', label: null, data: false },
    ], edges: [{ id: 'e', sourceId: 'a,\t東京', targetId: 'b', mode: 'bidirectional', weight: 0, data: ['array', null] }] });
    const wire = delimiter === '\t' ? toTSV(graph) : toCSV(graph);
    const nodes = getNativeRows(wire.nodes, delimiter);
    const edges = getNativeRows(wire.edges, delimiter);
    expect(nodes[1][nodes[0].indexOf('id')]).toBe('a,\t東京');
    expect(nodes[1][nodes[0].indexOf('label')]).toBe(JSON.stringify('Say "yes"\r\nthen \\'));
    expect(JSON.parse(nodes[1][nodes[0].indexOf('data')])).toEqual(graph.nodes[0].data);
    expect(nodes[2][nodes[0].indexOf('label')]).toBe('""');
    expect(nodes[3][nodes[0].indexOf('label')]).toBe('null');
    expect(edges[1][edges[0].indexOf('mode')]).toBe('"bidirectional"');
    expect(edges[1][edges[0].indexOf('weight')]).toBe('0');
    expect(fromCSV(wire)).toEqual(graph);
  });

  it('reads independently authored RFC tables with real multiline text cells', () => {
    const wire: CSVGraphSource = { nodes: 'node,title,payload\r\nA,"東京, \"\"quoted\"\"\r\nsecond",null\r\nB,Target,false\r\nLone,,[]\r\n', edges: 'key,source,target,cost\r\ne,A,B,2.5\r\n', schema: {
      nodes: [{ name: 'node', field: 'id', type: 'string', required: true }, { name: 'title', field: 'label', type: 'string' }, { name: 'payload', field: 'data', type: 'json' }],
      edges: [{ name: 'key', field: 'id', type: 'string', required: true }, { name: 'source', field: 'sourceId', type: 'string', required: true }, { name: 'target', field: 'targetId', type: 'string', required: true }, { name: 'cost', field: 'weight', type: 'number' }],
    } };
    const expected = getNativeRows(wire.nodes);
    expect(expected[1]).toEqual(['A', '東京, "quoted"\r\nsecond', 'null']);
    const graph = fromCSV(wire);
    expect(graph.nodes.map((node) => [node.id, node.label, node.data])).toEqual([['A', expected[1][1], null], ['B', 'Target', false], ['Lone', '', []]]);
    expect(graph.edges[0].weight).toBe(2.5);
  });

  it('native reader checks edited document cells while unrelated quoting and fields remain exact', () => {
    const wire = { nodes: 'id,label,future\r\n"A","""Before"""," keep, exactly "\r\n', edges: 'id,sourceId,targetId\r\n' };
    const document = csvDocumentConverter.from(wire);
    expect(csvDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toEqual(wire);
    document.graph!.nodes[0].label = 'After "yes"\r\nnext';
    const result = csvDocumentConverter.to(document);
    const native = getNativeRows(result.nodes);
    expect(native[1]).toEqual(['A', JSON.stringify('After "yes"\r\nnext'), ' keep, exactly ']);
    expect(result.nodes).toContain('," keep, exactly "\r\n');
    expect(fromCSV(result).nodes[0].label).toBe('After "yes"\r\nnext');
  });

  it('keeps graph-domain rejection separate from CSV lexical acceptance', () => {
    const wire = { nodes: 'id\nA\n', edges: 'id,sourceId,targetId\ne,A,missing\n' };
    expect(getNativeRows(wire.edges)).toEqual([['id', 'sourceId', 'targetId'], ['e', 'A', 'missing']]);
    expect(() => fromCSV(wire)).toThrow('endpoints');
    expect(() => getNativeRows('id\n"unterminated')).toThrow();
    expect(() => fromCSV({ ...wire, nodes: 'id\n"unterminated' })).toThrow('unterminated');
  });
});
