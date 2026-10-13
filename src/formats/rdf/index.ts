import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatExportOptions } from '../preservation';
import { getValidatedGraph } from '../structured-json';

export interface RDFNamedNode { termType: 'NamedNode'; value: string }
/** Scope separates identically labelled blank nodes from independent source datasets. */
export interface RDFBlankNode { termType: 'BlankNode'; value: string; scope: string }
export interface RDFLiteral { termType: 'Literal'; value: string; datatype: RDFNamedNode; language: string }
export interface RDFDefaultGraph { termType: 'DefaultGraph'; value: '' }
export type RDFSubject = RDFNamedNode | RDFBlankNode;
export type RDFObject = RDFSubject | RDFLiteral;
export type RDFGraphName = RDFSubject;
export type RDFGraphTerm = RDFGraphName | RDFDefaultGraph;
export type RDFTerm = RDFObject | RDFDefaultGraph;
export interface RDFQuad { subject: RDFSubject; predicate: RDFNamedNode; object: RDFObject; graph: RDFGraphTerm }
/** RDF 1.1 set semantics, with explicit declarations for empty named graphs. */
export interface RDFDataset { version: '1.1'; quads: RDFQuad[]; namedGraphs?: RDFGraphName[]; [metadata: string]: unknown }
export interface RDFExportOptions extends FormatExportOptions {}
const FORMAT = 'rdf-dataset';
const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

function getScalarString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`RDF: ${field} must be a string`);
  for (const character of value) { const code = character.codePointAt(0)!; if (code >= 0xd800 && code <= 0xdfff) throw new Error(`RDF: ${field} requires Unicode scalar values`); }
  return value;
}
function getIRI(value: unknown): string {
  const iri = getScalarString(value, 'IRI');
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(iri) || /[\u0000-\u0020\u007f-\u009f<>"{}|^`\\]/.test(iri) || /%(?![\da-fA-F]{2})/.test(iri)) throw new Error('RDF: absolute IRI required; invalid lexical IRI characters/percent escape');
  if (/[\[\]]/.test(iri)) {
    const remainder = iri.slice(iri.indexOf(':') + 1), authority = remainder.startsWith('//') ? remainder.slice(2).split(/[/?#]/)[0] : '';
    const outside = remainder.startsWith('//') ? remainder.slice(2 + authority.length) : remainder;
    const host = authority.match(/^(?:[^@\[\]]*@)?\[([^\[\]]+)\](?::\d*)?$/);
    if (/[\[\]]/.test(outside) || !host) throw new Error('RDF: brackets are permitted only around an authority IP literal');
    if (!/^v[\da-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i.test(host[1])) { try { new URL(`http://[${host[1]}]`); } catch { throw new Error('RDF: invalid authority IP literal'); } }
  }
  return iri;
}
function isLanguageTag(value: string): boolean {
  if (/^(?:en-GB-oed|i-(?:ami|bnn|default|enochian|hak|klingon|lux|mingo|navajo|pwn|tao|tay|tsu)|sgn-(?:BE-FR|BE-NL|CH-DE)|art-lojban|cel-gaulish|no-bok|no-nyn|zh-(?:guoyu|hakka|min|min-nan|xiang))$/i.test(value)) return true;
  const pattern = /^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4}|[A-Za-z]{5,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z0-9]{2,8})+)*(?:-x(?:-[A-Za-z0-9]{1,8})+)?|x(?:-[A-Za-z0-9]{1,8})+)$/;
  if (!pattern.test(value)) return false;
  const subtags = value.toLowerCase().split('-'), extensions = new Set<string>(), variants = new Set<string>();
  for (let index = 1; index < subtags.length; index++) {
    const tag = subtags[index];
    if (tag === 'x') break;
    if (tag.length === 1) { if (extensions.has(tag)) return false; extensions.add(tag); while (subtags[index + 1]?.length > 1) index++; }
    else if (tag.length >= 5 || /^\d.{3}$/.test(tag)) { if (variants.has(tag)) return false; variants.add(tag); }
  }
  return true;
}
function getKeys(value: any, keys: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error('RDF: unsupported term/quad fields or RDF 1.2 profile');
}
/** Validate a plain RDF 1.1 term without datatype value coercion or reasoning. */
export function getRDFTerm(term: RDFTerm): RDFTerm {
  if (!term || typeof term !== 'object') throw new Error('RDF: term object required');
  switch (term.termType) {
    case 'NamedNode': getKeys(term, ['termType', 'value']); return { termType: 'NamedNode', value: getIRI(term.value) };
    case 'BlankNode': {
      getKeys(term, ['termType', 'value', 'scope']);
      const value = getScalarString(term.value, 'blank label'), scope = getScalarString(term.scope, 'blank scope');
      if (!value || !scope) throw new Error('RDF: nonempty blank label and scope required');
      return { termType: 'BlankNode', value, scope };
    }
    case 'Literal': {
      getKeys(term, ['termType', 'value', 'datatype', 'language']);
      const value = getScalarString(term.value, 'literal lexical form'), language = getScalarString(term.language, 'literal language');
      if (!term.datatype || term.datatype.termType !== 'NamedNode') throw new Error('RDF: literal datatype must be a NamedNode');
      const datatype = getRDFTerm(term.datatype) as RDFNamedNode;
      if (datatype.termType !== 'NamedNode' || (language ? datatype.value !== LANG_STRING || !isLanguageTag(language) : datatype.value === LANG_STRING)) throw new Error('RDF: invalid RDF 1.1 literal datatype/language or unsupported directional literal');
      return { termType: 'Literal', value, datatype, language };
    }
    case 'DefaultGraph': getKeys(term, ['termType', 'value']); if (term.value !== '') throw new Error('RDF: default graph value must be empty'); return { termType: 'DefaultGraph', value: '' };
    default: throw new Error('RDF: unsupported term type; RDF 1.2 triple terms and variables are outside the RDF 1.1 profile');
  }
}
/** Stable DTO term identity; RDF 1.1 language tags compare character by character. */
export function getRDFTermId(term: RDFTerm): string {
  const valid = getRDFTerm(term);
  return `rdf:${JSON.stringify(valid.termType === 'Literal' ? [valid.termType, valid.value, valid.datatype.value, valid.language] : valid.termType === 'BlankNode' ? [valid.termType, valid.scope, valid.value] : [valid.termType, valid.value])}`;
}
function getQuad(quad: RDFQuad): RDFQuad {
  getKeys(quad, ['subject', 'predicate', 'object', 'graph']);
  const subject = getRDFTerm(quad.subject), predicate = getRDFTerm(quad.predicate), object = getRDFTerm(quad.object), graph = getRDFTerm(quad.graph);
  if (!['NamedNode', 'BlankNode'].includes(subject.termType) || predicate.termType !== 'NamedNode' || object.termType === 'DefaultGraph' || graph.termType === 'Literal') throw new Error('RDF: invalid subject/predicate/object/graph role');
  return { subject: subject as RDFSubject, predicate, object, graph };
}
export function getRDFQuadId(quad: RDFQuad): string { quad = getQuad(quad); return `rdf:quad:${JSON.stringify([quad.subject, quad.predicate, quad.object, quad.graph].map(getRDFTermId))}`; }
function getJSONSource(value: unknown): void {
  const active = new Set<object>(), complete = new Set<object>();
  const pending: Array<{ value: unknown; exit?: boolean }> = [{ value }];
  while (pending.length) {
    const entry = pending.pop()!, current = entry.value;
    if (entry.exit) { active.delete(current as object); complete.add(current as object); continue; }
    if (current === null || typeof current === 'string' || typeof current === 'boolean' || typeof current === 'number' && Number.isFinite(current)) continue;
    if (!current || typeof current !== 'object') throw new Error('RDF: dataset metadata must be plain JSON without undefined/functions/BigInt/nonfinite values');
    if (active.has(current)) throw new Error('RDF: dataset JSON cannot contain cycles');
    if (complete.has(current)) continue;
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(current) && prototype === Array.prototype) || Object.getOwnPropertySymbols(current).length) throw new Error('RDF: dataset requires plain JSON objects/arrays');
    if (Array.isArray(current) && Object.keys(current).length !== current.length) throw new Error('RDF: sparse/extended arrays are not plain dataset JSON');
    active.add(current); pending.push({ value: current, exit: true });
    for (const [name, property] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
      if (property.get || property.set || !property.enumerable && !(Array.isArray(current) && name === 'length')) throw new Error('RDF: dataset JSON cannot contain accessors/nonenumerable properties');
      if (property.enumerable) pending.push({ value: property.value });
    }
  }
}
function getDataset(source: RDFDataset): RDFDataset {
  if (!source || source.version !== '1.1' || !Array.isArray(source.quads) || source.namedGraphs !== undefined && !Array.isArray(source.namedGraphs)) throw new Error('RDF: expected explicit RDF 1.1 dataset and quads');
  getJSONSource(source);
  const named = new Map<string, RDFGraphName>();
  for (const term of source.namedGraphs ?? []) { const valid = getRDFTerm(term); if (!['NamedNode', 'BlankNode'].includes(valid.termType)) throw new Error('RDF: named graph requires IRI or scoped blank node'); named.set(getRDFTermId(valid), valid as RDFGraphName); }
  const quads = new Map<string, RDFQuad>();
  for (const entry of source.quads) { const quad = getQuad(entry); quads.set(getRDFQuadId(quad), quad); if (quad.graph.termType !== 'DefaultGraph') named.set(getRDFTermId(quad.graph), quad.graph); }
  return { version: '1.1', quads: [...quads.values()], namedGraphs: [...named.values()] };
}
/** Subject/object terms become nodes; predicates and named graph terms remain exact edge data. */
export function fromRDFDataset(source: RDFDataset): Graph {
  const dataset = getDataset(source), nodes = new Map<string, Graph['nodes'][number]>();
  const edges = dataset.quads.map((quad) => {
    for (const term of [quad.subject, quad.object]) { const id = getRDFTermId(term); if (!nodes.has(id)) nodes.set(id, { type: 'node', id, parentId: null, initialNodeId: null, label: term.value, data: { rdf: { term } } }); }
    return { type: 'edge' as const, id: getRDFQuadId(quad), sourceId: getRDFTermId(quad.subject), targetId: getRDFTermId(quad.object), mode: 'directed' as const, label: quad.predicate.value, data: { rdf: { predicate: quad.predicate, graph: quad.graph } } };
  });
  const graph: Graph = { id: '', mode: 'directed', initialNodeId: null, nodes: [...nodes.values()], edges, data: { rdf: { version: '1.1', namedGraphs: dataset.namedGraphs } } };
  graph.data = createNativeCarrier(graph.data, FORMAT, source, graph); return graph;
}
/** Strict export: no invented IRIs, label-to-property mapping or discarded Graph-only fields. */
export function toRDFDataset(graph: Graph, options: RDFExportOptions = {}): RDFDataset {
  getValidatedGraph(graph, FORMAT);
  const current = { ...graph, data: getCarrierData(getCarrierData(graph.data, 'rdf-syntax'), FORMAT) }, carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, FORMAT);
  const terms = new Map(current.nodes.map((node) => [node.id, getRDFTerm(node.data?.rdf?.term)]));
  const quads = current.edges.map((edge) => getQuad({ subject: terms.get(edge.sourceId) as RDFSubject, predicate: edge.data?.rdf?.predicate, object: terms.get(edge.targetId) as RDFObject, graph: edge.data?.rdf?.graph }));
  const dataset = getDataset({ version: current.data?.rdf?.version, quads, namedGraphs: current.data?.rdf?.namedGraphs });
  const projected = fromRDFDataset(dataset), comparison = { ...projected, data: getCarrierData(projected.data, FORMAT) };
  const resolved = { ...current, nodes: current.nodes.map((node) => ({ ...node, parentId: node.parentId ?? null, initialNodeId: node.initialNodeId ?? null })), edges: current.edges.map((edge) => ({ ...edge, mode: edge.mode ?? current.mode })) };
  if (!isJSONEqual(resolved, comparison)) throw new Error('RDF: Graph fields/IDs/labels must match the explicit RDF term projection; unsupported Graph-only state cannot be discarded');
  if (carrier) getDataset(carrier.native as RDFDataset);
  if (carrier && isJSONEqual(current, carrier.baseline)) return getClonedJSON(carrier.native) as RDFDataset;
  return carrier ? { ...getClonedJSON(carrier.native) as RDFDataset, quads: dataset.quads, namedGraphs: dataset.namedGraphs } : dataset;
}
export const rdfDatasetConverter = createFormatConverter(toRDFDataset, fromRDFDataset);
export const rdfDatasetDocumentConverter = createGraphDocumentConverter({ format: FORMAT,
  codec: { from: fromRDFDataset, to: (graph) => toRDFDataset(graph, { nativeCarrier: false }) },
  project: (source: RDFDataset) => ({ graph: getNativeDocumentGraph(fromRDFDataset(source), FORMAT, source), diagnostics: [{ code: 'rdf-set-semantics', severity: 'info', message: 'RDF 1.1 quad set projection; duplicate occurrences and source metadata remain original dataset state' }] }) });
