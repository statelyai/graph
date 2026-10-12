import { createFormatData } from '../xml-preservation';
import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createMetadata, getMetadata, getRestoredRecord, createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getValidatedGraph, getUniformMode } from '../structured-json';

export interface GraphvizJSONObject { _gvid: number; name: string; nodes?: number[]; edges?: number[]; subgraphs?: number[]; [attribute: string]: any }
export interface GraphvizJSONEdge { _gvid: number; tail: number; head: number; [attribute: string]: any }
export interface GraphvizJSON { name: string; directed: boolean; strict: boolean; _subgraph_cnt: number; objects?: GraphvizJSONObject[]; edges?: GraphvizJSONEdge[]; [attribute: string]: any }
export interface GraphvizJSONImportOptions extends FormatImportOptions { geometry?: 'none' | 'points' }
export interface GraphvizJSONExportOptions extends FormatExportOptions { regenerate?: boolean }
const FORMAT = 'graphviz-json';

function getWireMetadata(record: Record<string, any>, kind: string, native = false) {
  if (native) return undefined;
  for (const [key, value] of Object.entries(record)) if (/^_stately(?:_\d+)?$/.test(key) && typeof value === 'string') {
    try { const metadata = getMetadata(JSON.parse(value), `${FORMAT}.${kind}`); if (metadata) return { key, metadata }; } catch { /* Opaque native attribute. */ }
  }
  return undefined;
}
function getAttributes(record: Record<string, any>, known: string[], metadataKey?: string) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !known.includes(key) && key !== metadataKey));
}
function getRecord(record: Record<string, any>, mapped: any, kind: string, known: string[], native: boolean) {
  const wire = getWireMetadata(record, kind, native);
  mapped.data = getAttributes(record, known, wire?.key);
  const restored = getRestoredRecord(mapped, wire?.metadata);
  if (wire && !isJSONEqual(mapped.data, wire.metadata.mapped.data)) restored.data = createFormatData(wire.metadata.original.data, FORMAT, { native: mapped.data });
  return restored;
}
function addMetadata(record: Record<string, any>, entity: any, mapped: any, kind: string) {
  let key = '_stately', index = 0;
  while (Object.hasOwn(record, key)) key = `_stately_${++index}`;
  record[key] = JSON.stringify(createMetadata(`${FORMAT}.${kind}`, entity, mapped));
}
function getValidatedAttributes(record: Record<string, any>): void {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Graphviz JSON: native attribute records must be objects');
  for (const key of ['name', 'label', 'weight', 'pos', 'width', 'height', 'bb', 'tailport', 'headport', 'style', 'shape', 'color', 'fillcolor']) {
    if (Object.hasOwn(record, key) && typeof record[key] !== 'string') throw new Error(`Graphviz JSON: native ${key} must be a string`);
  }
  for (const key of ['weight', 'width', 'height']) if (record[key] !== undefined && record[key] !== '') getNumber(record[key], key);
  if (record.bb !== undefined && record.bb !== '') {
    const coordinates = record.bb.trim().split(/[\s,]+/);
    if (coordinates.length !== 4) throw new Error('Graphviz JSON: invalid bounding box');
    coordinates.forEach((value: string) => getNumber(value, 'bounding box'));
  }
  if (record.pos !== undefined && record.pos !== '') {
    for (const token of record.pos.trim().split(/[\s;]+/)) {
      const coordinates = token.replace(/^[es],/, '').replace(/!$/, '').split(',');
      if (coordinates.length < 2 || coordinates.length > 3) throw new Error('Graphviz JSON: invalid native position');
      coordinates.forEach((value: string) => getNumber(value, 'position'));
    }
  }
  for (const [key, value] of Object.entries(record)) if (/draw_$/.test(key) && !Array.isArray(value)) throw new Error('Graphviz JSON: drawing state must be an array');
}
function getValidatedSource(source: GraphvizJSON): void {
  if (!source || typeof source.name !== 'string' || typeof source.directed !== 'boolean' || typeof source.strict !== 'boolean' || !Number.isSafeInteger(source._subgraph_cnt) || source._subgraph_cnt < 0 || (source.objects !== undefined && !Array.isArray(source.objects)) || (source.edges !== undefined && !Array.isArray(source.edges))) throw new Error('Graphviz JSON: invalid output profile');
  getValidatedAttributes(source);
  const objects = source.objects ?? [], edges = source.edges ?? [];
  if (source._subgraph_cnt > objects.length) throw new Error('Graphviz JSON: invalid subgraph count');
  const names = new Set<string>();
  objects.forEach((object, index) => {
    getValidatedAttributes(object);
    if (object._gvid !== index || typeof object.name !== 'string') throw new Error('Graphviz JSON: _gvid must match object-array identity');
    if (index >= source._subgraph_cnt) { if (names.has(object.name)) throw new Error('Graphviz JSON: duplicate node name'); names.add(object.name); }
    for (const key of ['nodes', 'subgraphs', 'edges'] as const) if (object[key] !== undefined) {
      if (index >= source._subgraph_cnt) throw new Error('Graphviz JSON: memberships belong only to subgraphs');
      if (!Array.isArray(object[key]) || new Set(object[key]).size !== object[key].length || object[key].some((id) => !Number.isSafeInteger(id) || id < 0 || id >= (key === 'edges' ? edges.length : objects.length) || (key === 'subgraphs' ? id >= source._subgraph_cnt || id === index : key === 'nodes' ? id < source._subgraph_cnt : false))) throw new Error('Graphviz JSON: invalid subgraph membership reference');
    }
  });
  const strictPairs = new Set<string>();
  edges.forEach((edge, index) => { getValidatedAttributes(edge); if (!edge || edge._gvid !== index || !Number.isSafeInteger(edge.tail) || !Number.isSafeInteger(edge.head) || !objects[edge.tail] || !objects[edge.head]) throw new Error('Graphviz JSON: invalid edge _gvid/endpoint reference');
    const pair = JSON.stringify(source.directed ? [edge.tail, edge.head] : [edge.tail, edge.head].sort((a, b) => a - b));
    if (source.strict && strictPairs.has(pair)) throw new Error('Graphviz JSON: duplicate strict edge'); strictPairs.add(pair);
  });
  const completed = new Set<number>();
  for (let start = 0; start < source._subgraph_cnt; start++) {
    const visiting = new Set<number>(), stack: Array<[number, boolean]> = [[start, false]];
    while (stack.length) {
      const [id, exit] = stack.pop()!;
      if (exit) { visiting.delete(id); completed.add(id); continue; }
      if (completed.has(id)) continue;
      if (visiting.has(id)) throw new Error('Graphviz JSON: cyclic subgraphs');
      visiting.add(id); stack.push([id, true]);
      for (const child of objects[id].subgraphs ?? []) stack.push([child, false]);
    }
  }
}
function getNumber(value: unknown, field: string): number {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number)) throw new Error(`Graphviz JSON: invalid ${field}`);
  return number;
}
function getGeometry(object: GraphvizJSONObject, source: GraphvizJSON) {
  if (object.pos === undefined || object.pos === '') return {};
  const bounding = String(source.bb ?? '').trim().split(/[\s,]+/).map((value) => getNumber(value, 'bounding box'));
  const position = String(object.pos).replace(/!$/, '').split(',').map((value) => getNumber(value, 'position'));
  if (bounding.length !== 4 || position.length < 2) throw new Error('Graphviz JSON: geometry requires native bounding box and position');
  const width = getNumber(object.width, 'width') * 72, height = getNumber(object.height, 'height') * 72;
  return { x: position[0] - width / 2, y: bounding[3] - position[1] - height / 2, width, height };
}

/** Graphviz output JSON; drawing programs and non-tree memberships remain opaque native state. */
export function fromGraphvizJSON(source: GraphvizJSON, options: GraphvizJSONImportOptions = {}): Graph {
  getValidatedSource(source);
  const objects = source.objects ?? [], native = options.metadata === 'native';
  const represented = objects.map((object, index) => index >= source._subgraph_cnt || object.name.startsWith('cluster'));
  for (const edge of source.edges ?? []) if (!represented[edge.tail] || !represented[edge.head]) throw new Error('Graphviz JSON: endpoints on non-cluster subgraphs have no binary Graph projection');
  const ids = new Map<number, string>(), used = new Set(objects.slice(source._subgraph_cnt).map((object) => object.name));
  objects.forEach((object, index) => {
    if (!represented[index]) return;
    let id = object.name;
    if (index < source._subgraph_cnt) { id = `graphviz:cluster:${index}`; while (used.has(id)) id += '_'; }
    ids.set(index, id); used.add(id);
  });
  const mappedNodes: Array<{ object: GraphvizJSONObject; mapped: any }> = objects.flatMap((object, index) => represented[index] ? [{ object, mapped: { type: 'node', id: ids.get(index)!, label: typeof object.label === 'string' ? object.label : null, parentId: null, initialNodeId: null, ...(options.geometry === 'points' && index >= source._subgraph_cnt ? getGeometry(object, source) : {}) } }] : []);
  const mappedById = new Map(mappedNodes.map((entry) => [entry.mapped.id, entry.mapped]));
  // Unique innermost cluster ownership only; overlapping memberships stay in native state.
  const ownersByMember = new Map<number, GraphvizJSONObject[]>();
  for (const object of objects.slice(0, source._subgraph_cnt)) if (object.name.startsWith('cluster')) for (const member of [...object.nodes ?? [], ...object.subgraphs ?? []]) {
    const owners = ownersByMember.get(member) ?? []; owners.push(object); ownersByMember.set(member, owners);
  }
  for (const [index, id] of ids) {
    const owners = ownersByMember.get(index) ?? [], ownerIDs = new Set(owners.map((owner) => owner._gvid));
    const deepest = owners.filter((owner) => !owner.subgraphs?.some((child) => ownerIDs.has(child)));
    if (deepest.length === 1) mappedById.get(id)!.parentId = ids.get(deepest[0]._gvid)!;
  }
  const nodes = mappedNodes.map(({ object, mapped }) => getRecord(object, mapped, 'node', ['_gvid', 'name', 'label'], native));
  const records = new Map(mappedNodes.map(({ object }, index) => [object._gvid, nodes[index]]));
  const mappedIDs = new Map(mappedNodes.map(({ mapped }, index) => [mapped.id, nodes[index].id]));
  nodes.forEach((node, index) => { const parent = mappedNodes[index].mapped.parentId; if (parent != null) node.parentId = mappedIDs.get(parent)!; });
  const edges = (source.edges ?? []).map((edge) => getRecord(edge, { type: 'edge', id: `graphviz:edge:${edge._gvid}`, sourceId: records.get(edge.tail)!.id, targetId: records.get(edge.head)!.id, mode: source.directed ? 'directed' : 'undirected', label: typeof edge.label === 'string' ? edge.label : null,
    ...(edge.weight !== undefined && { weight: getNumber(edge.weight, 'weight') }) }, 'edge', ['_gvid', 'tail', 'head', 'label', 'weight'], native));
  const graph: Graph = { ...getRecord(source, { id: source.name, mode: source.directed ? 'directed' : 'undirected', initialNodeId: null }, 'graph', ['name', 'directed', 'strict', '_subgraph_cnt', 'objects', 'edges'], native), nodes, edges };
  getValidatedGraph(graph, FORMAT);
  graph.data = createNativeCarrier(graph.data, FORMAT, source, graph);
  return graph;
}
function toRawGraphvizJSON(graph: Graph): GraphvizJSON {
  getValidatedGraph(graph, FORMAT);
  const mode = getUniformMode(graph, FORMAT), parents = new Set(graph.nodes.flatMap((node) => node.parentId == null ? [] : [node.parentId]));
  const nodeIDs = new Set(graph.nodes.map((node) => node.id));
  if ([...parents].some((id) => !nodeIDs.has(id))) throw new Error('Graphviz JSON: missing parent');
  const ordered = [...graph.nodes.filter((node) => parents.has(node.id)), ...graph.nodes.filter((node) => !parents.has(node.id))];
  const ids = new Map(ordered.map((node, index) => [node.id, index]));
  const children = new Map<string, Graph['nodes']>();
  for (const node of graph.nodes) if (node.parentId != null) { const siblings = children.get(node.parentId) ?? []; siblings.push(node); children.set(node.parentId, siblings); }
  const source: GraphvizJSON = { name: graph.id, directed: mode === 'directed', strict: false, _subgraph_cnt: parents.size, objects: ordered.map((node, index) => ({ _gvid: index, name: parents.has(node.id) ? `cluster_stately_${index}` : node.id, ...(node.label != null && { label: node.label }), ...(parents.has(node.id) && { nodes: (children.get(node.id) ?? []).filter((child) => !parents.has(child.id)).map((child) => ids.get(child.id)!), subgraphs: (children.get(node.id) ?? []).filter((child) => parents.has(child.id)).map((child) => ids.get(child.id)!) }) })), edges: graph.edges.map((edge, index) => ({ _gvid: index, tail: ids.get(edge.sourceId)!, head: ids.get(edge.targetId)!, ...(edge.label != null && { label: edge.label }), ...(edge.weight !== undefined && { weight: String(edge.weight) }) })) };
  const mapped = fromGraphvizJSON(source, { metadata: 'native' });
  const mappedRecords = new Map(mapped.nodes.map((node) => [node.id, node]));
  const mappedByGvid = new Map((source.objects ?? []).map((object) => [object._gvid, mappedRecords.get(object._gvid < parents.size ? `graphviz:cluster:${object._gvid}` : object.name)!]));
  ordered.forEach((node, index) => addMetadata(source.objects![index], node, mappedByGvid.get(index), 'node'));
  graph.edges.forEach((edge, index) => addMetadata(source.edges![index], edge, mapped.edges[index], 'edge'));
  const { nodes: _nodes, edges: _edges, ...root } = graph;
  const { nodes: _mappedNodes, edges: _mappedEdges, ...mappedRoot } = mapped;
  addMetadata(source, root, { ...mappedRoot, data: getCarrierData(mapped.data, FORMAT) }, 'graph');
  return source;
}
/** Minimal dot_json profile; explicit regeneration discards captured drawing programs. */
export function toGraphvizJSON(graph: Graph, options: GraphvizJSONExportOptions = {}): GraphvizJSON {
  const carrier = options.nativeCarrier === false || options.regenerate ? undefined : getNativeCarrier(graph.data, FORMAT);
  if (!carrier) return toRawGraphvizJSON({ ...graph, data: options.regenerate ? getCarrierData(graph.data, FORMAT) : graph.data });
  const current = { ...graph, data: getCarrierData(graph.data, FORMAT) };
  if (isJSONEqual(current, carrier.baseline)) return getClonedJSON(carrier.native);
  const source = getClonedJSON(carrier.native) as GraphvizJSON;
  const before = carrier.baseline as Graph;
  if (!isJSONEqual(before.nodes.map((node) => [node.id, node.parentId]), current.nodes.map((node) => [node.id, node.parentId])) || !isJSONEqual(before.edges.map((edge) => [edge.id, edge.sourceId, edge.targetId]), current.edges.map((edge) => [edge.id, edge.sourceId, edge.targetId]))) throw new Error('Graphviz JSON: structural edits require explicit regeneration');
  for (const [originals, changed, records] of [[before.nodes, current.nodes, (source.objects ?? []).filter((object, index) => index >= source._subgraph_cnt || object.name.startsWith('cluster'))], [before.edges, current.edges, source.edges ?? []]] as const) {
    changed.forEach((entity, index) => {
      const old: any = originals[index], record = records[index];
      if (isJSONEqual(old, entity)) return;
      for (const field of new Set([...Object.keys(old), ...Object.keys(entity)])) if (!isJSONEqual(old[field], (entity as any)[field])) {
        if (field !== 'label' && field !== 'weight') throw new Error(`Graphviz JSON: ${field} requires explicit regeneration`);
        if (Object.keys(record).some((key) => /draw_$/.test(key)) || Object.hasOwn(record, 'pos') || source.bb !== undefined && source.bb !== '') throw new Error('Graphviz JSON: edited attributes would leave stale drawing/layout programs; regenerate explicitly');
        if (field === 'weight') { if ((entity as any).weight === undefined) delete record.weight; else record.weight = String((entity as any).weight); }
        else if (entity.label == null) delete record.label; else record.label = entity.label;
      }
    });
  }
  const { nodes: _bn, edges: _be, ...oldRoot } = before, { nodes: _cn, edges: _ce, ...root } = current;
  if (!isJSONEqual(oldRoot, root)) throw new Error('Graphviz JSON: root edits require explicit regeneration');
  return source;
}
export const graphvizJSONConverter = createFormatConverter(toGraphvizJSON, fromGraphvizJSON);
export const graphvizJSONDocumentConverter = createGraphDocumentConverter({ format: FORMAT, codec: { from: fromGraphvizJSON, to: (graph) => toGraphvizJSON(graph, { regenerate: true }) },
  project: (source: GraphvizJSON) => ({ graph: getNativeDocumentGraph(fromGraphvizJSON(source), FORMAT, source), diagnostics: [{ code: 'projection-partial', severity: 'warning', message: 'Graphviz output drawing programs and non-tree subgraph memberships remain native state' }] }),
  patch: (context) => { try { return { ok: true, source: toGraphvizJSON({ ...context.graph, data: createNativeCarrier(context.graph.data, FORMAT, context.source, context.sourceGraph) }) }; } catch (error) { return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: String(error) }] }; } } });
