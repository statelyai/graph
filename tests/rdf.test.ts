import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { fromRDFDataset, toRDFDataset, getRDFTermId, getRDFQuadId, getRDFTerm, rdfDatasetDocumentConverter, type RDFDataset, type RDFTerm, type RDFQuad, type RDFNamedNode, type RDFLiteral } from '../src/formats/rdf';
const iri = (value: string): RDFNamedNode => ({ termType: 'NamedNode', value });
const literal = (value: string, datatype = 'http://www.w3.org/2001/XMLSchema#string', language = ''): RDFLiteral => ({ termType: 'Literal', value, datatype: iri(datatype), language });
const quad = (object: RDFQuad['object'], graph: RDFQuad['graph'] = { termType: 'DefaultGraph', value: '' }): RDFQuad => ({ subject: iri('urn:s'), predicate: iri('urn:p'), object, graph });
const dataset = (quads: RDFQuad[], namedGraphs?: RDFDataset['namedGraphs']): RDFDataset => ({ version: '1.1', quads, ...(namedGraphs && { namedGraphs }) });
describe('plain RDF 1.1 dataset profile', () => {
  it('retains exact DTO metadata, occurrences, empty named graphs and JSON persistence', () => {
    const source = { ...dataset([quad(literal('01', 'http://www.w3.org/2001/XMLSchema#integer')), quad(literal('01', 'http://www.w3.org/2001/XMLSchema#integer'))], [iri('urn:empty')]), vendor: { constructor: 'KEEP' } };
    const graph = fromRDFDataset(source); expect(graph.edges).toHaveLength(1); expect(graph.nodes).toHaveLength(2);
    expect(toRDFDataset(JSON.parse(JSON.stringify(graph)))).toEqual(source);
    expect(graph.nodes.find((node) => node.data.rdf.term.termType === 'Literal')!.data.rdf.term.value).toBe('01');
    expect(graph.data.rdf.namedGraphs).toEqual([iri('urn:empty')]);
    expect(rdfDatasetDocumentConverter.to(JSON.parse(JSON.stringify(rdfDatasetDocumentConverter.from(source))))).toEqual(source);
  });
  it('keeps lexical numbers/ill-typed literals and RDF 1.1 case-sensitive language identities', () => {
    const source = dataset([quad(literal('1', 'http://www.w3.org/2001/XMLSchema#integer')), quad(literal('01', 'http://www.w3.org/2001/XMLSchema#integer')), quad(literal('abc', 'http://www.w3.org/2001/XMLSchema#integer')), quad(literal('x', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'EN')), quad(literal('x', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'en')), quad(iri('urn:x')), quad(literal('urn:x'))]);
    expect(fromRDFDataset(source).edges).toHaveLength(7);
    expect(new Set(source.quads.map((entry) => getRDFTermId(entry.object))).size).toBe(7);
  });
  it('shares blank nodes across graphs while distinguishing independent scopes', () => {
    const first = { termType: 'BlankNode' as const, value: 'same', scope: 'one' }, second = { ...first, scope: 'two' };
    const source = dataset([quad(first, iri('urn:g1')), quad(first, iri('urn:g2')), quad(second)]);
    const graph = fromRDFDataset(source); expect(graph.nodes).toHaveLength(3); expect(graph.edges[0].targetId).toBe(graph.edges[1].targetId); expect(graph.edges[2].targetId).not.toBe(graph.edges[0].targetId);
    expect(graph.nodes.every((node) => node.parentId === null)).toBe(true);
    expect(graph.edges[1].data.rdf.graph).toEqual(iri('urn:g2'));
  });
  it('provides collision-safe public IDs and a coherent fresh Graph construction path', () => {
    const entry = quad(literal('[]|😀\n\u0000'));
    const graph = createGraph({ nodes: [entry.subject, entry.object].map((term) => ({ id: getRDFTermId(term), label: term.value, data: { rdf: { term } } })), edges: [{ id: getRDFQuadId(entry), sourceId: getRDFTermId(entry.subject), targetId: getRDFTermId(entry.object), mode: 'directed', label: entry.predicate.value, data: { rdf: { predicate: entry.predicate, graph: entry.graph } } }], data: { rdf: { version: '1.1', namedGraphs: [] } } });
    expect(toRDFDataset(graph).quads).toEqual([entry]);
    expect(getRDFTermId(iri('urn:x'))).not.toBe(getRDFTermId(literal('urn:x')));
  });
  it.each([null, { termType: 'Quad', value: '' }, { termType: 'Variable', value: 'x' }, iri('relative'), iri('urn:bad[bracket]'), iri('http://example.org/%ZZ'), iri('urn:\ud800'), { termType: 'DefaultGraph', value: 'bad' }, { termType: 'BlankNode', value: '', scope: 'x' }, { termType: 'BlankNode', value: 'x', scope: '' }, literal('x', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'), literal('x', 'http://www.w3.org/2001/XMLSchema#string', 'en'), literal('x', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'en-abcdefghi'), { ...literal('x'), direction: 'ltr' }])('rejects invalid/version-unsupported terms %j', (term) => { expect(() => getRDFTerm(term as RDFTerm)).toThrow(/RDF/); });
  it('rejects invalid roles, metadata bypass and unsupported version before projection', () => {
    for (const entry of [{ ...quad(literal('x')), subject: literal('bad') }, { ...quad(literal('x')), predicate: { termType: 'BlankNode', value: 'p', scope: 's' } }, { ...quad(literal('x')), object: { termType: 'DefaultGraph', value: '' } }, { ...quad(literal('x')), graph: literal('bad') }]) expect(() => fromRDFDataset(dataset([entry as RDFQuad]))).toThrow(/role/);
    expect(() => fromRDFDataset({ version: '1.2', quads: [] } as any)).toThrow(/1.1/);
    const graph = fromRDFDataset(dataset([quad(literal('x'))])); graph.data.__statelyaiNative.native.quads[0].predicate = literal('bad');
    expect(() => toRDFDataset(graph)).toThrow(/role/);
  });
  it('rejects cyclic/20k malformed literal datatypes at bounded depth', () => {
    const cycle: any = literal('x'); cycle.datatype = cycle; expect(() => getRDFTerm(cycle)).toThrow(/NamedNode/);
    let deep: any = iri('urn:datatype'); for (let index = 0; index < 20000; index++) deep = { ...literal('x'), datatype: deep };
    expect(() => getRDFTerm(deep)).toThrow(/NamedNode/);
  });
  it('accepts BCP47 grandfathered/private tags and authority IP literals without value coercion', () => {
    for (const tag of ['i-klingon', 'x-private', 'en-Latn-US', 'en-u-ca-gregory']) expect(getRDFTerm(literal('x', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', tag))).toMatchObject({ language: tag });
    for (const value of ['http://[::1]/', 'urn:x', 'http://例え.テスト/α']) expect(getRDFTerm(iri(value))).toEqual(iri(value));
    expect(() => getRDFTerm(iri('http://[bad]/'))).toThrow(/IP literal/);
  });
  it('rejects arbitrary Graph-only data, hierarchy, modes and stale display labels', () => {
    expect(() => toRDFDataset(createGraph({ nodes: [{ id: 'a', label: 'invent IRI' }] }))).toThrow();
    for (const change of [(graph: any) => { graph.nodes[0].label = 'DISPLAY'; }, (graph: any) => { graph.nodes[0].x = 10; }, (graph: any) => { graph.mode = 'undirected'; }, (graph: any) => { graph.data.user = 42; }, (graph: any) => { graph.nodes[0].parentId = graph.nodes[1].id; }]) { const graph = fromRDFDataset(dataset([quad(literal('x'))])); change(graph); expect(() => toRDFDataset(graph)).toThrow(/unsupported Graph-only/); }
  });
  it('handles a sparse 10k-statement graph iteratively', () => {
    const source = dataset(Array.from({ length: 10000 }, (_, index) => ({ ...quad(iri(`urn:o:${index}`)), subject: iri(`urn:s:${index}`) })));
    const graph = fromRDFDataset(source); expect(graph.nodes).toHaveLength(20000); expect(graph.edges).toHaveLength(10000); expect(toRDFDataset(graph).quads).toHaveLength(10000);
  }, 30000);
});

it('rejects non-JSON unknown metadata without silent normalization or role bypass', () => {
  for (const vendor of [undefined, () => 1, BigInt(1), NaN, Infinity, new Date(), [,]]) expect(() => fromRDFDataset({ version: '1.1', quads: [], vendor })).toThrow(/JSON/);
  const cyclic: any = { version: '1.1', quads: [] }; cyclic.vendor = cyclic; expect(() => fromRDFDataset(cyclic)).toThrow(/cycles/);
  const source: any = { version: '1.1', quads: [] }; Object.defineProperty(source, 'vendor', { get: () => 'DATA', enumerable: true }); expect(() => fromRDFDataset(source)).toThrow(/accessors/);
});

it('RDF 1.1 accepts rdf:dirLangString as an ordinary unknown datatype without direction fields', () => {
  const term = literal('opaque', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString');
  expect(getRDFTerm(term)).toEqual(term); expect(toRDFDataset(fromRDFDataset(dataset([quad(term)]))).quads[0].object).toEqual(term);
});
