import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fromRDFDataset, toRDFDataset } from '../../src/formats/rdf';
import { fromRDF, toRDF, createRDFDocumentConverter, type RDFSyntax } from '../../src/formats/rdf/syntax';
import { getRDFLibOracle } from './rdflib-oracle';
const source = readFileSync(new URL('./fixtures/rdf/scoped.trig', import.meta.url), 'utf8');
describe('actual pinned RDFLib 7.6 independent RDF grammar/dataset proof', () => {
  it('pins reader and authored fixture provenance', async () => {
    expect((await getRDFLibOracle({ operation: 'version' })).version).toBe('7.6.0');
    const manifest = JSON.parse(readFileSync(new URL('./fixtures/rdf/provenance.json', import.meta.url), 'utf8'));
    expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.fixtures[0].sha256);
  });
  it('matches actual parser statement/graph events for lexical data, collections, blanks and empty graphs', async () => {
    const dataset = toRDFDataset(fromRDF(source, { format: 'TriG' })), native = await getRDFLibOracle({ source, format: 'TriG', expected: dataset });
    expect(native.isomorphic).toBe(true); expect(native.dataset!.namedGraphs).toHaveLength(5);
    expect(native.dataset!.quads.some((quad) => quad.object.termType === 'Literal' && quad.object.value === '01')).toBe(true);
    expect(native.store!.namedGraphCount).toBe(2); // Memory store omits the three declared empty graphs.
  });
  it('certifies fresh TriG output including empty graphs with shared blank identity', async () => {
    const dataset = toRDFDataset(fromRDF(source, { format: 'TriG' }));
    const output = toRDF(fromRDFDataset(dataset), { format: 'TriG' });
    expect((await getRDFLibOracle({ source: output, format: 'TriG', expected: dataset })).isomorphic).toBe(true);
  });
  it.each(['N-Triples', 'N-Quads', 'Turtle', 'TriG'] as RDFSyntax[])('accepts emitted %s, keeping literal Unicode/control escapes and numeric lexical forms', async (format) => {
    const graph = fromRDF('<urn:s> <urn:p> "01"^^<http://www.w3.org/2001/XMLSchema#integer>, "abc"^^<http://www.w3.org/2001/XMLSchema#integer>, "α😀\\n\\t\\r\\u0000" .', { format: 'Turtle' });
    const expected = toRDFDataset(graph), output = toRDF(graph, { format, nativeCarrier: false });
    expect((await getRDFLibOracle({ source: output, format, expected })).isomorphic).toBe(true);
  });
  it('proves distinct scopes relabel safely while the same blank remains shared across graphs', async () => {
    const a = { termType: 'BlankNode' as const, value: 'same', scope: 'a' }, b = { ...a, scope: 'b' }, predicate = { termType: 'NamedNode' as const, value: 'urn:p' };
    const dataset = { version: '1.1' as const, quads: [{ subject: a, predicate, object: b, graph: { termType: 'NamedNode' as const, value: 'urn:g1' } }, { subject: a, predicate, object: a, graph: { termType: 'NamedNode' as const, value: 'urn:g2' } }] };
    const output = toRDF(fromRDFDataset(dataset), { format: 'N-Quads' }); expect(output).toContain('_:b0'); expect(output).toContain('_:b1');
    expect((await getRDFLibOracle({ source: output, format: 'N-Quads', expected: dataset })).isomorphic).toBe(true);
  });
  it.each(['N-Triples', 'N-Quads', 'Turtle', 'TriG'] as RDFSyntax[])('observes exact %s tag casing before native store equality and documents its casefold limitation', async (format) => {
    const text = '<urn:s> <urn:p> "same"@EN, "same"@en .', expected = toRDFDataset(fromRDF(text, { format: 'Turtle' }));
    const output = toRDF(fromRDFDataset(expected), { format });
    const native = await getRDFLibOracle({ source: output, format, expected });
    expect(native.dataset!.quads).toHaveLength(2); expect(native.store!.quadCount).toBe(1); expect(native.isomorphic).toBe(true);
  });
  it('independently accepts regenerated persisted source while explicit loss remains reported', async () => {
    const converter = createRDFDocumentConverter({ format: 'TriG' }), document = JSON.parse(JSON.stringify(converter.from(source)));
    document.source = source.replace('# Terms', '# Native Terms'); expect(converter.to(document)).toBe(document.source);
    const regenerated = converter.getUpdate(document, { mode: 'regenerate' }); expect(regenerated.ok).toBe(true);
    if (regenerated.ok) expect((await getRDFLibOracle({ source: regenerated.source, format: 'TriG' })).dataset!.namedGraphs).toHaveLength(5);
  });
  it('uses native rejection controls rather than accepting parser self-roundtrips as proof', async () => {
    await expect(getRDFLibOracle({ source: '<urn:s> "predicate" <urn:o> .', format: 'N-Triples' })).rejects.toThrow();
    await expect(getRDFLibOracle({ source: '<urn:s> <urn:p> "unterminated', format: 'Turtle' })).rejects.toThrow();
    const wrong = toRDFDataset(fromRDF('<urn:s> <urn:p> "wrong" .', { format: 'N-Triples' }));
    expect((await getRDFLibOracle({ source: '<urn:s> <urn:p> "right" .', format: 'N-Triples', expected: wrong })).isomorphic).toBe(false);
  });
});

it('independently accepts an ordinary RDF 1.1 unknown datatype that N3 reserves for RDF 1.2', async () => {
  const text = '<urn:s> <urn:p> "opaque"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString> .';
  const native = await getRDFLibOracle({ source: text, format: 'N-Triples' });
  expect(native.dataset!.quads[0].object).toMatchObject({ value: 'opaque', language: '', datatype: { value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString' } });
  const emitted = toRDF(fromRDFDataset({ ...native.dataset!, quads: native.dataset!.quads }), { format: 'N-Triples' });
  expect((await getRDFLibOracle({ source: emitted, format: 'N-Triples', expected: native.dataset })).isomorphic).toBe(true);
  expect(createRDFDocumentConverter({ format: 'N-Triples' }).from(emitted).graph).toBeNull();
});
