import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import AjvDraft04 from 'ajv-draft-04';
import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { fromJGF, toJGF, jgfDocumentConverter, type JGFInput } from '../../src/formats/jgf';

const directory = new URL('./fixtures/jgf/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8')) as { files: Array<{ file: string; sha256: string }> };
function getSchema(version: 1 | 2) {
  const name = `json-graph-schema_v${version}.json`, bytes = readFileSync(new URL(name, directory));
  const expected = provenance.files.find((file) => file.file === name)!;
  if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`JGF schema provenance changed: ${name}`);
  return JSON.parse(bytes.toString('utf8'));
}
const validators = { 1: new AjvDraft04({ allErrors: true, strict: false }).compile(getSchema(1)), 2: new Ajv({ allErrors: true, strict: false }).compile(getSchema(2)) };

describe('official JGF schemas with pinned Ajv draft support', () => {
  it.each([1, 2] as const)('validates explicit standard export version %s with rich private metadata', (version) => {
    const graph = createGraph({ id: 'graph 🕸️', mode: 'bidirectional', data: 42, style: { color: 'red' },
      nodes: [{ id: 'a', label: null, data: { __statelyai: { user: 'KEEP' }, x: 1 }, ports: [{ name: 'out', data: false }] }, { id: 'isolated', label: '' }, { id: '__proto__', label: 'Prototype' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: '__proto__', label: null, mode: 'bidirectional', weight: 2, sourcePort: 'out', data: ['primitive', 1] }] });
    const native = toJGF(graph, { version });
    const validate = validators[version];
    expect(validate(native), JSON.stringify(validate.errors)).toBe(true);
    expect(fromJGF(native)).toEqual(graph);
  });
  it('makes the backward-compatible default hybrid explicitly invalid under both official profiles', () => {
    const native = toJGF(createGraph({ nodes: [{ id: 'a' }] }));
    expect(validators[1](native)).toBe(false);
    expect(validators[2](native)).toBe(false);
  });
  it('validates v1 native nullable metadata and directed defaults independently', () => {
    const native: JGFInput = { graph: { directed: null, metadata: null,
      nodes: [{ id: 'a', metadata: null }, { id: 'b', label: '', metadata: { vendor: 'KEEP' } }],
      edges: [{ source: 'a', target: 'b', directed: null, metadata: null }, { source: 'b', target: 'a', directed: false, relation: 'linked' }] } };
    expect(validators[1](native), JSON.stringify(validators[1].errors)).toBe(true);
    const graph = fromJGF(native, { metadata: 'native' });
    expect(graph.mode).toBe('directed');
    expect(graph.edges[0].mode).toBeUndefined();
    expect(graph.edges[1].mode).toBe('undirected');
    const emitted = toJGF(graph, { version: 1 });
    expect(validators[1](emitted), JSON.stringify(validators[1].errors)).toBe(true);
    expect(emitted).toEqual(native);
  });
  it('validates v2 keyed nodes, native metadata and undirected overrides', () => {
    const native: JGFInput = { graph: { id: 'native', directed: false, metadata: { vendor: { keep: true } },
      nodes: { a: { label: 'A', metadata: { __statelyai: { user: true } } }, b: {} },
      edges: [{ id: 'native-edge', source: 'a', target: 'b', directed: true, metadata: { vendor: 'KEEP' } }] } };
    expect(validators[2](native), JSON.stringify(validators[2].errors)).toBe(true);
    const graph = fromJGF(native, { metadata: 'native' });
    expect(graph.mode).toBe('undirected');
    expect(graph.edges[0].mode).toBe('directed');
    const emitted = toJGF(graph, { version: 2 });
    expect(validators[2](emitted), JSON.stringify(validators[2].errors)).toBe(true);
    expect(emitted).toEqual(native);
  });
  it('records official v2 nodes-only schema ambiguity rather than altering the pinned schema', () => {
    const example = { graph: { nodes: { a: {} } } };
    expect(validators[2](example)).toBe(false);
    expect(validators[2].errors?.some((error) => error.keyword === 'oneOf')).toBe(true);
    expect(validators[2]({ graph: { ...example.graph, edges: [] } })).toBe(true);
  });
  it('rejects v2 nullable metadata and directed values permitted only in v1', () => {
    expect(validators[2]({ graph: { directed: null, metadata: null, nodes: {}, edges: [] } })).toBe(false);
  });
  it('retains schema-valid hyperedges exactly with an unavailable binary projection', () => {
    const native = { graph: { directed: false, nodes: { a: {}, b: {} }, hyperedges: [{ nodes: ['a', 'b'], metadata: { vendor: true } }] } };
    expect(validators[2](native), JSON.stringify(validators[2].errors)).toBe(true);
    const document = jgfDocumentConverter.from(native as unknown as JGFInput);
    expect(document.graph).toBeNull();
    expect(jgfDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toEqual(native);
  });
});

it('converts schema-valid v1 nullable metadata/defaults into schema-valid explicit v2', () => {
  const source: JGFInput = { graph: { directed: null, metadata: null, nodes: [{ id: 'a', metadata: null }, { id: 'b' }], edges: [{ source: 'a', target: 'b', directed: null, metadata: null }] } };
  expect(validators[1](source), JSON.stringify(validators[1].errors)).toBe(true);
  const output = toJGF(fromJGF(source, { metadata: 'native' }), { version: 2 });
  expect(validators[2](output), JSON.stringify(validators[2].errors)).toBe(true);
  expect(output.graph.directed).toBe(true);
  expect(Array.isArray(output.graph.nodes)).toBe(false);
});
it('makes explicit v2 export schema-valid for sparse legacy-compatible v2 imports', () => {
  // The official nodes-only v2 schema has overlapping oneOf alternatives;
  // an explicit standard export supplies edges plus resolved direction.
  const source: JGFInput = { graph: { nodes: { a: {} } } };
  expect(validators[2](source)).toBe(false);
  const output = toJGF(fromJGF(source, { metadata: 'native' }), { version: 2 });
  expect(validators[2](output), JSON.stringify(validators[2].errors)).toBe(true);
  expect(output.graph.edges).toEqual([]);
  expect(output.graph.directed).toBe(true);
});
