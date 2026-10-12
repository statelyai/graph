import { describe, expect, it } from 'vitest';
import { fromRDF, toRDF, createRDFDocumentConverter, type RDFSyntax } from '../src/formats/rdf/syntax';
import { fromRDFDataset, toRDFDataset, getRDFQuadId, type RDFDataset } from '../src/formats/rdf';
const options = { format: 'TriG' as const };
const source = `# KEEP\n@base <http://example.org/> .\n@prefix e: <urn:> .\ne:empty {}\nGRAPH [] {}\ne:g1 { _:same e:p "01"^^<http://www.w3.org/2001/XMLSchema#integer> . }\ne:g2 { _:same e:p "x"@EN . }\n<relative> {}\n{ e:s e:p "{ fake:graph {} }"; e:q ("one" "two"). }\n`;
describe('maintained optional N3 syntax profile', () => {
  it('retains empty/prefixed/base/anonymous graph names and exact literal forms', () => {
    const dataset = toRDFDataset(fromRDF(source, options));
    expect(dataset.namedGraphs).toHaveLength(5);
    expect(dataset.namedGraphs!.map((term) => term.value)).toContain('http://example.org/relative');
    expect(dataset.quads.find((quad) => quad.object.termType === 'Literal' && quad.object.language === 'EN')!.object).toMatchObject({ value: 'x', language: 'EN' });
    expect(dataset.quads.find((quad) => quad.object.termType === 'Literal' && quad.object.value === '01')!.object).toMatchObject({ value: '01' });
    const shared = dataset.quads.filter((quad) => quad.subject.termType === 'BlankNode' && quad.subject.value === 'same'); expect(shared).toHaveLength(2); expect(shared[0].subject).toEqual(shared[1].subject);
    expect(dataset.quads.some((quad) => quad.predicate.value.endsWith('#first'))).toBe(true);
  });
  it('keeps repeated native parses stable, with future blank labels reserved before anonymous allocation', () => {
    const text = '[] <urn:p> <urn:o> . _:rdf_generated_0 <urn:p> _:rdf_generated_0 .';
    const first = fromRDF(text, { format: 'Turtle' }), second = fromRDF(text, { format: 'Turtle' });
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    const blanks = first.nodes.filter((node) => node.data.rdf.term.termType === 'BlankNode'); expect(blanks).toHaveLength(2); expect(blanks.map((node) => node.data.rdf.term.value).sort()).toEqual(['rdf_generated_0', 'rdf_generated_1']);
    expect(fromRDF(text, { format: 'Turtle', blankScope: 'independent' }).nodes[0].id).not.toBe(first.nodes[0].id);
  });
  it('does not interpret literal braces/comments/collection nodes as graph declarations', () => {
    const text = '# <urn:fake> {}\n<urn:s> <urn:p> "{ fake }"; <urn:q> ([<urn:p> "[] {}"] []) .';
    expect(toRDFDataset(fromRDF(text, options)).namedGraphs).toEqual([]);
  });
  it.each(['N-Triples', 'N-Quads', 'Turtle', 'TriG'] as RDFSyntax[])('writes a proven scoped %s author dialect without numeric coercion', (format) => {
    const graph = fromRDF('<urn:s> <urn:p> "abc"^^<http://www.w3.org/2001/XMLSchema#integer>, "A\\u0000B\\nα😀" .', { format: 'Turtle' });
    const output = toRDF(graph, { format, nativeCarrier: false }), dataset = toRDFDataset(fromRDF(output, { format }));
    expect(dataset.quads.map((quad) => quad.object.value)).toEqual(['abc', 'A\u0000B\nα😀']);
  });
  it('writes empty graphs only in TriG and relabels colliding scoped blanks distinctly', () => {
    const first = { termType: 'BlankNode' as const, value: 'same', scope: 'first' }, second = { ...first, scope: 'second' };
    const dataset: RDFDataset = { version: '1.1', namedGraphs: [{ termType: 'NamedNode', value: 'urn:empty' }], quads: [{ subject: first, predicate: { termType: 'NamedNode', value: 'urn:p' }, object: second, graph: { termType: 'DefaultGraph', value: '' } }] };
    const graph = fromRDFDataset(dataset), output = toRDF(graph, options); expect(output).toContain('_:b0 <urn:p> _:b1'); expect(output).toContain('<urn:empty> {');
    const reparsed = toRDFDataset(fromRDF(output, options)); expect(reparsed.namedGraphs).toEqual(dataset.namedGraphs); expect(reparsed.quads[0].subject).not.toEqual(reparsed.quads[0].object);
    for (const format of ['N-Quads', 'N-Triples', 'Turtle'] as RDFSyntax[]) expect(() => toRDF(graph, { format })).toThrow(/empty|named graphs/);
  });
  it('retains exact source and source-only edits after JSON persistence', () => {
    const converter = createRDFDocumentConverter(options), document = JSON.parse(JSON.stringify(converter.from(source)));
    expect(converter.to(document)).toBe(source); document.source = source.replace('# KEEP', '# NATIVE').replace('"01"', '"001"'); expect(converter.to(document)).toBe(document.source);
    expect(toRDF(JSON.parse(JSON.stringify(fromRDF(source, options))), { ...options, nativeCarrier: true })).toBe(source);
  });
  it('rejects unsupported Graph patches/stale replay and reports explicit regeneration loss', () => {
    const converter = createRDFDocumentConverter({ format: 'N-Triples' }), document = converter.from('# KEEP\n<urn:s> <urn:p> "OLD" .\n');
    document.graph!.edges[0].data.rdf.predicate.value = 'urn:changed'; document.graph!.edges[0].label = 'urn:changed';
    const dataset = toRDFDataset(fromRDF('<urn:s> <urn:changed> "OLD" .', { format: 'N-Triples' })); document.graph!.edges[0].id = getRDFQuadId(dataset.quads[0]);
    expect(() => converter.to(document)).toThrow(/unsupported/);
    const result = converter.getUpdate(document, { mode: 'regenerate' }); expect(result.ok).toBe(true); if (result.ok) { expect(result.source).not.toContain('# KEEP'); expect(result.source).toContain('<urn:changed>'); expect(result.diagnostics?.some((item) => item.code.includes('loss'))).toBe(true); }
  });
  it('rejects source/Graph field conflicts without overwriting native RDF terms', () => {
    const converter = createRDFDocumentConverter({ format: 'N-Triples' }), document = converter.from('<urn:s> <urn:p> "OLD" .');
    document.source = '<urn:s> <urn:p> "NATIVE" .'; document.graph!.nodes.find((node) => node.label === 'OLD')!.label = 'GRAPH'; expect(() => converter.to(document)).toThrow(/conflict/);
  });
  it.each(['@version "1.2" . <urn:s> <urn:p> "ordinary" .', '<urn:s> <urn:p> <<(<urn:a> <urn:b> <urn:c>)>> .', '<urn:s> <urn:p> <<(<urn:a> <urn:b> <<(<urn:a> <urn:b> <urn:c>)>>) >> .', '<urn:s> <urn:p> "x"@en--ltr .', '<urn:s> <urn:p> <relative> .', '<urn:s> <urn:p> "bad"@en-abcdefghi .'])('rejects unsupported profiles/invalid source while retaining document text: %s', (text) => {
    const selected = text.includes('<relative>') ? { format: 'N-Triples' as const } : { format: 'Turtle' as const };
    expect(() => fromRDF(text, selected)).toThrow(); const converter = createRDFDocumentConverter(selected), document = converter.from(text); expect(document.graph).toBeNull(); expect(converter.to(JSON.parse(JSON.stringify(document)))).toBe(text);
  });
  it('enforces concrete syntax selection and refuses lossy named-graph triple output', () => {
    expect(() => fromRDF(source, { format: 'JSON-LD' } as any)).toThrow(/select/); expect(() => fromRDF(source, { format: 'TriG', version: '1.2' } as any)).toThrow(/1.1/);
    expect(() => fromRDF('<urn:g> { <urn:s> <urn:p> "x" . }', { format: 'Turtle' })).toThrow();
    expect(() => toRDF(fromRDF('<urn:g> { <urn:s> <urn:p> "x" . }', options), { format: 'N-Triples' })).toThrow(/named graphs/);
  });
});

it('records N3 explicit dirLangString datatype parser gap without discarding original source', () => {
  const text = '<urn:s> <urn:p> "opaque"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString> .';
  expect(() => fromRDF(text, { format: 'N-Triples' })).toThrow(/explicit datatype/);
  const converter = createRDFDocumentConverter({ format: 'N-Triples' }), document = converter.from(text);
  expect(document.graph).toBeNull(); expect(converter.to(document)).toBe(text);
});
it('defaults export to captured base/scope options while explicit option changes regenerate', () => {
  const text = '# KEEP\n<s> <p> "x" .', graph = fromRDF(text, { format: 'Turtle', baseIRI: 'https://example.org/', blankScope: 'first' });
  expect(toRDF(graph, { format: 'Turtle' })).toBe(text);
  expect(toRDF(graph, { format: 'Turtle', baseIRI: 'https://different.org/' })).toContain('<https://example.org/s>');
});
