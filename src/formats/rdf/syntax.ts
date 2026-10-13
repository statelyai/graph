import { Parser, Writer, Lexer, DataFactory } from 'n3';
import type { Graph } from '../../types';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getNativeDocumentGraph, isJSONEqual } from '../preservation';
import { fromRDFDataset, toRDFDataset, getRDFTerm, getRDFTermId, type RDFDataset, type RDFTerm, type RDFNamedNode, type RDFGraphName, type RDFQuad } from './index';

export type RDFSyntax = 'N-Triples' | 'N-Quads' | 'Turtle' | 'TriG';
export interface RDFSyntaxOptions { format: RDFSyntax; version?: '1.1'; baseIRI?: string; blankScope?: string }
export interface RDFSyntaxExportOptions extends RDFSyntaxOptions { nativeCarrier?: boolean }
const FORMAT = 'rdf-syntax';
interface NativeTerm { termType: string; value: string; language?: string; direction?: string; datatype?: NativeTerm }
interface NativeToken { type: string; value: string }
interface RDFObservers { onToken(token: NativeToken): void; onVersion(version: string): void }
function getOptions(options: RDFSyntaxOptions): RDFSyntaxOptions {
  if (!options || !['N-Triples', 'N-Quads', 'Turtle', 'TriG'].includes(options.format) || options.version !== undefined && options.version !== '1.1') throw new Error('RDF: select a concrete RDF 1.1 syntax; JSON-LD/N3/RDF 1.2 are unsupported');
  if (options.baseIRI !== undefined) getRDFTerm({ termType: 'NamedNode', value: options.baseIRI });
  if (options.blankScope !== undefined && (typeof options.blankScope !== 'string' || !options.blankScope)) throw new Error('RDF: nonempty blankScope required');
  return { format: options.format, version: '1.1', blankScope: options.blankScope ?? 'document', ...(options.baseIRI !== undefined && { baseIRI: options.baseIRI }) };
}
function getTerm(term: NativeTerm, scope: string): RDFTerm {
  if (term.direction) throw new Error('RDF: directional literals require RDF 1.2');
  switch (term.termType) {
    case 'NamedNode': return getRDFTerm({ termType: 'NamedNode', value: term.value });
    case 'BlankNode': return getRDFTerm({ termType: 'BlankNode', value: term.value, scope });
    case 'DefaultGraph': return getRDFTerm({ termType: 'DefaultGraph', value: '' });
    case 'Literal': return getRDFTerm({ termType: 'Literal', value: term.value, language: term.language ?? '', datatype: getTerm(term.datatype!, scope) as RDFNamedNode });
    default: throw new Error('RDF: RDF 1.2 triple terms/variables have no RDF 1.1 projection');
  }
}
function getParsed(source: string, options: RDFSyntaxOptions): RDFDataset {
  if (typeof source !== 'string' || source.length > 16 * 1024 * 1024) throw new Error('RDF: source must be a string within 16 × 1024² UTF-16 units');
  const selected = getOptions(options), tokens = new Lexer({ lineMode: selected.format === 'N-Triples' || selected.format === 'N-Quads' }).tokenize(source);
  // Reserve explicit labels across the entire source before assigning anonymous ones.
  const reserved = new Set(tokens.filter((token) => token.type === 'blank').map((token) => token.value));
  let generated = 0, lastNode: NativeTerm | undefined, previous: NativeToken | undefined;
  const names = new Map<string, RDFGraphName>();
  const factory = { ...DataFactory,
    namedNode<Iri extends string>(value: Iri) { const term = DataFactory.namedNode(value); lastNode = term; return term; },
    blankNode(value?: string) {
      if (value === undefined) { do { value = `rdf_generated_${generated++}`; } while (reserved.has(value)); reserved.add(value); }
      const term = DataFactory.blankNode(value); lastNode = term; return term;
    },
    literal(value: string, languageOrDatatype?: any): any {
      if (languageOrDatatype && typeof languageOrDatatype === 'object' && 'direction' in languageOrDatatype) throw new Error('RDF: directional literals require RDF 1.2');
      const term = DataFactory.literal(value, languageOrDatatype);
      if (typeof languageOrDatatype !== 'string') return term;
      // RDF 1.1 identity retains tag case; the stock N3 factory lowercases it.
      return { termType: 'Literal', value, language: languageOrDatatype, datatype: term.datatype,
        equals: (other: any) => other?.termType === 'Literal' && other.value === value && other.language === languageOrDatatype && other.datatype?.value === term.datatype.value };
    },
  };
  const parser = new Parser({ format: selected.format, baseIRI: selected.baseIRI, blankNodePrefix: '', factory });
  // N3 2.13.12 public observers are ahead of @types/n3's named-callback overload.
  const observer = { onToken(token: NativeToken) {
    if (['<<', '<<(', 'dircode'].includes(token.type)) throw new Error('RDF: RDF 1.2 triple terms/directional literals are unsupported');
    if (selected.format === 'TriG' && token.type === '{' && previous && ['IRI', 'prefixed', 'blank', ']'].includes(previous.type)) {
      if (!lastNode) throw new Error('RDF: named graph identity unavailable');
      const name = getTerm(lastNode, selected.blankScope!);
      if (name.termType !== 'NamedNode' && name.termType !== 'BlankNode') throw new Error('RDF: invalid named graph role');
      names.set(getRDFTermId(name), name);
    }
    previous = token;
  }, onVersion(version: string) { if (version !== '1.1') throw new Error('RDF: explicit RDF version outside 1.1'); } };
  const quads = (parser.parse as unknown as (source: string, observers: RDFObservers) => Array<{ subject: NativeTerm; predicate: NativeTerm; object: NativeTerm; graph: NativeTerm }>)(source, observer);
  const dataset: RDFDataset = { version: '1.1', quads: quads.map((quad) => ({ subject: getTerm(quad.subject, selected.blankScope!), predicate: getTerm(quad.predicate, selected.blankScope!), object: getTerm(quad.object, selected.blankScope!), graph: getTerm(quad.graph, selected.blankScope!) } as RDFQuad)), namedGraphs: [...names.values()] };
  // Core role/term validation remains authoritative after native parsing.
  return toRDFDataset(fromRDFDataset(dataset), { nativeCarrier: false });
}
function getInput(source: string, options: RDFSyntaxOptions) { return { source, options: getOptions(options) }; }
/** Strict maintained-parser grammar, returned exclusively as plain JSON Graph terms. */
export function fromRDF(source: string, options: RDFSyntaxOptions): Graph {
  const dataset = getParsed(source, options), graph = fromRDFDataset(dataset);
  graph.data = getCarrierData(graph.data, 'rdf-dataset');
  graph.data = createNativeCarrier(graph.data, FORMAT, getInput(source, options), graph); return graph;
}
function getNativeTerm(term: RDFTerm, blanks: Map<string, string>): any {
  switch (term.termType) {
    case 'NamedNode': return DataFactory.namedNode(term.value);
    case 'BlankNode': { const id = getRDFTermId(term); if (!blanks.has(id)) blanks.set(id, `b${blanks.size}`); return DataFactory.blankNode(blanks.get(id)!); }
    case 'DefaultGraph': return DataFactory.defaultGraph();
    case 'Literal': return { termType: 'Literal', value: term.value, language: term.language, datatype: DataFactory.namedNode(term.datatype.value) };
  }
}
function getSerialized(graph: Graph, options: RDFSyntaxOptions): string {
  const selected = getOptions(options), dataset = toRDFDataset(graph, { nativeCarrier: false }), blanks = new Map<string, string>();
  const writer = new Writer({ format: 'N-Quads' }), named = new Map((dataset.namedGraphs ?? []).map((name) => [getRDFTermId(name), { name, lines: [] as string[] }]));
  const defaults: string[] = [], lines: string[] = [];
  for (const quad of dataset.quads) {
    const subject = getNativeTerm(quad.subject, blanks), predicate = getNativeTerm(quad.predicate, blanks), object = getNativeTerm(quad.object, blanks), nativeGraph = getNativeTerm(quad.graph, blanks);
    lines.push(writer.quadToString(subject, predicate, object, nativeGraph));
    const triple = writer.quadToString(subject, predicate, object, DataFactory.defaultGraph());
    if (quad.graph.termType === 'DefaultGraph') defaults.push(triple); else named.get(getRDFTermId(quad.graph))!.lines.push(triple);
  }
  if (selected.format === 'N-Triples' || selected.format === 'Turtle') {
    if (named.size) throw new Error('RDF: triple-only syntax cannot represent named graphs, including empty graphs');
    return defaults.join(''); // N-Triples is a valid Turtle authoring subset.
  }
  if (selected.format === 'N-Quads') {
    if ([...named.values()].some((group) => group.lines.length === 0)) throw new Error('RDF: N-Quads cannot represent empty named graphs; choose TriG');
    return lines.join('');
  }
  const groups = [...named.values()].map((group) => {
    const term = getNativeTerm(group.name, blanks);
    const encoded = writer.quadToString(term, DataFactory.namedNode('urn:stately:rdf:label'), DataFactory.literal(''), DataFactory.defaultGraph());
    // Validated IRI/scoped relabelled blank terms contain no literal spaces.
    const label = encoded.slice(0, encoded.indexOf(' '));
    return `${label} {\n${group.lines.join('')}}\n`;
  });
  return defaults.join('') + groups.join('');
}
/** Fresh syntax requires explicit RDF terms; imported source is exact until regeneration. */
export function toRDF(graph: Graph, options: RDFSyntaxExportOptions): string {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, FORMAT);
  const input = carrier?.native as ReturnType<typeof getInput> | undefined;
  const selected = getOptions(input?.options.format === options.format ? { ...input.options, ...options } : options);
  const current = { ...graph, data: getCarrierData(graph.data, FORMAT) };
  if (carrier) {
    if (isJSONEqual(input!.options, selected) && isJSONEqual(current, carrier.baseline)) { getParsed(input!.source, selected); return input!.source; }
    if (isJSONEqual(input!.options, selected)) throw new Error('RDF: Graph edits require explicit syntax regeneration');
  }
  return getSerialized(current, selected);
}
/** Exact source-only updates; Graph patches intentionally require explicit regeneration. */
export function createRDFDocumentConverter(options: RDFSyntaxOptions) {
  const selected = getOptions(options);
  return createGraphDocumentConverter({ format: `rdf:${selected.format}`, codec: { from: (source: string) => fromRDF(source, selected), to: (graph: Graph) => toRDF(graph, { ...selected, nativeCarrier: false }) },
    project: (source: string) => ({ graph: getNativeDocumentGraph(fromRDF(source, selected), FORMAT, getInput(source, selected)), diagnostics: [{ code: 'rdf-syntax-profile', severity: 'info', message: 'RDF 1.1 dataset terms; prefixes/comments/base and concrete spellings remain exact source. Graph patches require explicit regeneration.' }] }) });
}
