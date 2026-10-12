import type { Graph } from '../types';
import { createMetadata, getMetadata, getRestoredRecord, getClonedJSON, isJSONEqual, getMergedNative, getEditedData } from './preservation';

/** Private attribute convention shared by the three native JSON adapters. */
export const ROOT_FIELDS = ['id', 'initialNodeId', 'direction', 'style'];
export const NODE_FIELDS = ['label', 'parentId', 'initialNodeId', 'x', 'y', 'width', 'height', 'color', 'shape', 'style', 'ports'];
export const EDGE_FIELDS = ['label', 'weight', 'sourcePort', 'targetPort', 'points', 'routing', 'x', 'y', 'width', 'height', 'color', 'style'];

export function getFields(kind: 'graph' | 'node' | 'edge'): string[] {
  return kind === 'graph' ? ROOT_FIELDS : kind === 'node' ? NODE_FIELDS : EDGE_FIELDS;
}

export function getRecordWithField<T extends object>(record: T, field: string, value: any): T {
  const result = getClonedJSON(record) as any;
  if (value === undefined) delete result[field];
  else Object.defineProperty(result, field, { value, enumerable: true, writable: true, configurable: true });
  return result;
}

export function isNativeField(field: string, value: any): boolean {
  if (['label', 'parentId', 'initialNodeId'].includes(field)) return value === null || typeof value === 'string';
  if (['id', 'sourcePort', 'targetPort', 'color', 'shape'].includes(field)) return typeof value === 'string';
  if (field === 'direction') return ['up', 'down', 'left', 'right'].includes(value);
  if (field === 'routing') return ['polyline', 'orthogonal', 'splines'].includes(value);
  if (['x', 'y', 'width', 'height', 'weight'].includes(field)) return typeof value === 'number' && Number.isFinite(value);
  if (field === 'style') return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'boolean' || (typeof entry === 'number' && Number.isFinite(entry)));
  if (field === 'points') return Array.isArray(value) && value.every((point) => point && typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y));
  if (field === 'ports') return Array.isArray(value) && value.every((port) => port && typeof port === 'object' && typeof port.name === 'string' && ['in', 'out', 'inout'].includes(port.direction) && (!Object.hasOwn(port, 'label') || typeof port.label === 'string') && ['x', 'y', 'width', 'height'].every((key) => !Object.hasOwn(port, key) || isNativeField(key, port[key])));
  return false;
}

/** Protocol snapshots are untrusted JSON, including matching origin headers. */
export function isNativeMetadataRecord(record: any, kind: string): boolean {
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string') return false;
  if (kind === 'graph') { if (!['directed', 'undirected', 'bidirectional'].includes(record.mode)) return false; }
  else if (record.type !== kind || (kind === 'edge' && (typeof record.sourceId !== 'string' || typeof record.targetId !== 'string'))) return false;
  if (kind === 'edge' && record.mode !== undefined && !['directed', 'undirected', 'bidirectional'].includes(record.mode)) return false;
  return getFields(kind as 'graph' | 'node' | 'edge').every((field) => !Object.hasOwn(record, field) || record[field] === undefined || isNativeField(field, record[field]));
}

function getMarkerIndex(key: string): number | undefined {
  if (key === '__statelyai') return 0;
  if (!/^__statelyai__\d+$/.test(key)) return undefined;
  const value = Number(key.slice('__statelyai__'.length));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function getNativeMetadataKey(attributes: any, format: string, kind: string): string | undefined {
  if (!attributes || typeof attributes !== 'object') return undefined;
  return Object.keys(attributes).filter((key) => getMarkerIndex(key) !== undefined && attributes[key]?.origin === `@statelyai/graph/${format}` && getMetadata(attributes[key], `${format}.${kind}`) && isNativeMetadataRecord(attributes[key].original, kind) && isNativeMetadataRecord(attributes[key].mapped, kind))
    .sort((a, b) => getMarkerIndex(b)! - getMarkerIndex(a)!)[0];
}

export function getNativeMetadata(attributes: any, format: string, kind: string): ReturnType<typeof getMetadata> {
  const key = getNativeMetadataKey(attributes, format, kind);
  return key === undefined ? undefined : attributes[key];
}

export function getAttributeRecord(attributes: Record<string, any> | undefined, base: Record<string, any>, kind: 'graph' | 'node' | 'edge', format: string, native = false): any {
  const attrs = attributes ?? {};
  const metadata = native ? undefined : getNativeMetadata(attrs, format, kind);
  const metadataKey = native ? undefined : getNativeMetadataKey(attrs, format, kind);
  const fields = getFields(kind);
  const represented = fields.filter((key) => Object.hasOwn(attrs, key) && isNativeField(key, attrs[key]));
  const data = Object.fromEntries(Object.entries(attrs).filter(([key]) => !represented.includes(key) && key !== metadataKey));
  const mapped = { ...base, ...Object.fromEntries(represented.map((key) => [key, attrs[key]])), data };
  const record = getRestoredRecord(mapped, metadata);
  // Emitted Graph user data occupies its own native attribute. Added unknown
  // native attributes stay in source provenance, never replace user data.
  if (metadata) record.data = (metadata as any).dataEncoding === 'native-attributes'
    ? getEditedData(metadata.original.data, metadata.mapped.data, data)
    : Object.hasOwn(attrs, 'data') ? getClonedJSON(attrs.data) : undefined;
  return record;
}

/** Attach identity only when needed, retaining foreign attribute layout and keys. */
export function getRebasedAttributes(attributes: Record<string, any>, entity: Record<string, any>, kind: 'node' | 'edge', format: string, base: Record<string, any>, force = false): Record<string, any> {
  const attrs = getClonedJSON(attributes);
  const candidate = getNativeMetadataKey(attrs, format, kind);
  const key = candidate && !Object.hasOwn(entity.data ?? {}, candidate) ? candidate : undefined;
  const metadata = key ? attrs[key] : undefined;
  const identityFields = kind === 'node' ? ['id'] : ['id', 'sourceId', 'targetId'];
  if (!force && identityFields.every((field) => isJSONEqual((metadata?.mapped ?? entity)[field], base[field]))) return attrs;
  const visible = getClonedJSON(attrs); if (key) delete visible[key];
  let markerKey = key ?? '__statelyai';
  if (!key && Object.hasOwn(attrs, markerKey)) {
    let suffix = 1;
    while (Object.hasOwn(attrs, `__statelyai__${suffix}`)) suffix++;
    markerKey = `__statelyai__${suffix}`;
  }
  Object.defineProperty(attrs, markerKey, { value: { ...createMetadata(`${format}.${kind}`, entity, getAttributeRecord(visible, base, kind, format, true)), origin: `@statelyai/graph/${format}`, dataEncoding: metadata ? metadata.dataEncoding ?? 'attribute' : 'native-attributes' }, enumerable: true, writable: true, configurable: true });
  return attrs;
}

export function getNativeAttributes(entity: Record<string, any>, kind: 'graph' | 'node' | 'edge', format: string, base: Record<string, any>): Record<string, any> {
  const attrs: Record<string, any> = Object.fromEntries(getFields(kind).filter((key) => Object.hasOwn(entity, key)).map((key) => [key, getClonedJSON(entity[key])]));
  if (Object.hasOwn(entity, 'data') && entity.data !== undefined) attrs.data = getClonedJSON(entity.data);
  attrs.__statelyai = { ...createMetadata(`${format}.${kind}`, entity, getAttributeRecord(attrs, base, kind, format, true)), origin: `@statelyai/graph/${format}` };
  return attrs;
}

export function getUpdatedAttributes(original: Record<string, any> | undefined, before: Record<string, any>, current: Record<string, any>, kind: 'graph' | 'node' | 'edge', format: string, base: Record<string, any>): Record<string, any> | undefined {
  if (isJSONEqual(before, current)) return getClonedJSON(original);
  const metadata = getNativeMetadata(original, format, kind);
  const markerKey = getNativeMetadataKey(original, format, kind);
  const isWire = metadata && markerKey && !Object.hasOwn(before.data ?? {}, markerKey);
  if (isWire && (metadata as any).dataEncoding !== 'native-attributes') {
    return getMergedNative(original, getNativeAttributes(before, kind, format, base), getNativeAttributes(current, kind, format, base));
  }
  const attrs = getClonedJSON(original ?? {});
  for (const field of getFields(kind)) {
    if (isJSONEqual(before[field], current[field]) && Object.hasOwn(before, field) === Object.hasOwn(current, field)) continue;
    if (Object.hasOwn(before.data ?? {}, field)) throw new Error(`${format}: native ${field} is unrepresentable user data; separate field edit would erase it`);
    if (Object.hasOwn(current, field) && current[field] !== undefined) Object.defineProperty(attrs, field, { value: getClonedJSON(current[field]), enumerable: true, writable: true, configurable: true });
    else delete attrs[field];
  }
  if (!isJSONEqual(before.data, current.data)) {
    if (current.data !== undefined && (!current.data || typeof current.data !== 'object' || Array.isArray(current.data))) throw new Error(`${format}: native attributes require object data; scalar replacement is unsupported`);
    const previous = before.data ?? {};
    const data = current.data ?? {};
    for (const key of new Set([...Object.keys(previous), ...Object.keys(data)])) {
      if (Object.hasOwn(previous, key) === Object.hasOwn(data, key) && isJSONEqual(previous[key], data[key])) continue;
      if (getFields(kind).includes(key) && Object.hasOwn(data, key) && isNativeField(key, data[key])) throw new Error(`${format}: user data collides with native ${key}`);
      if (Object.hasOwn(data, key)) Object.defineProperty(attrs, key, { value: getClonedJSON(data[key]), enumerable: true, writable: true, configurable: true });
      else delete attrs[key];
    }
  }
  return isWire && kind !== 'graph' ? getRebasedAttributes(attrs, current, kind, format, base, true) : attrs;
}

export function getNodeBase(id: string): Graph['nodes'][number] {
  return { type: 'node', id, parentId: null, initialNodeId: null, label: '', data: undefined };
}

export function getEdgeBase(id: string, sourceId: string, targetId: string, mode?: 'directed' | 'undirected'): Graph['edges'][number] {
  return { type: 'edge', id, sourceId, targetId, label: '', data: undefined, ...(mode && { mode }) };
}

export function getRootBase(mode: 'directed' | 'undirected'): Omit<Graph, 'nodes' | 'edges'> {
  return { id: '', mode, initialNodeId: null, data: undefined };
}

export function getUniformMode(graph: Graph, format: string): 'directed' | 'undirected' {
  const modes = new Set(graph.edges.map((edge) => edge.mode ?? graph.mode));
  if (!modes.size) modes.add(graph.mode);
  if (modes.size !== 1 || modes.has('bidirectional')) throw new Error(`${format}: native graphs require one directed or undirected mode`);
  return [...modes][0] as 'directed' | 'undirected';
}

export function getValidatedGraph(graph: Graph, format: string): void {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const node of graph.nodes) {
    if (typeof node.id !== 'string' || nodes.has(node.id)) throw new Error(`${format}: node IDs must be unique strings`);
    nodes.add(node.id);
  }
  for (const edge of graph.edges) {
    if (typeof edge.id !== 'string' || edges.has(edge.id)) throw new Error(`${format}: edge IDs must be unique strings`);
    if (!nodes.has(edge.sourceId) || !nodes.has(edge.targetId)) throw new Error(`${format}: missing edge endpoint`);
    edges.add(edge.id);
  }
}

/** A generated key must never gain identity from a later explicit key. */
function getDocumentEdgeIdentityError(context: any, format: string): any {
  if (format !== 'graphology' && format !== 'networkx') return undefined;
  const before = context.baselineSource, current = context.source;
  const baselineRecords = before.edges ?? before.links ?? [];
  const currentRecords = current.edges ?? current.links ?? [];
  if (isJSONEqual(baselineRecords, currentRecords)) return undefined;
  if (format === 'networkx' && !before.multigraph && !current.multigraph) return undefined;
  const getValueKey = (value: any): string => JSON.stringify([
    typeof value === 'boolean' ? 'number' : typeof value,
    typeof value === 'boolean' ? Number(value) : value,
  ]);
  const getIdentity = (record: any, source: any): string | undefined => {
    if (format === 'graphology') return typeof record.key === 'string' ? record.key : undefined;
    if (!source.multigraph || !Object.hasOwn(record, 'key') || record.key === undefined) return undefined;
    const pair = [getValueKey(record.source), getValueKey(record.target)];
    if (!source.directed) pair.sort();
    return JSON.stringify([pair, getValueKey(record.key)]);
  };
  const getIndex = (records: any[], source: any, graph: Graph) => {
    const identities = new Map<string, string | undefined>();
    const counts = new Map<string, number>();
    records.forEach((record, index) => {
      const identity = getIdentity(record, source);
      if (graph.edges[index]) identities.set(graph.edges[index].id, identity);
      if (identity !== undefined) counts.set(identity, (counts.get(identity) ?? 0) + 1);
    });
    return { identities, counts };
  };
  const baseline = getIndex(baselineRecords, before, context.baselineGraph);
  const native = getIndex(currentRecords, current, context.sourceGraph);
  for (const change of context.changes) {
    if (change.entity !== 'edge') continue;
    const identity = baseline.identities.get(change.id);
    if (identity === undefined || identity !== native.identities.get(change.id)
      || baseline.counts.get(identity) !== 1 || native.counts.get(identity) !== 1) {
      return { ok: false, diagnostics: [{ code: 'ambiguous-native-identity', severity: 'error', path: change.path,
        message: `${format}: generated edge identity is ambiguous after the native edge sequence changed; a unique explicit identity must exist in both sources` }] };
    }
  }
  return undefined;
}

/** Native document edits use only demonstrated attributes, never private snapshots alone. */
export function getAttributeDocumentPatch(context: any, format: string, toNative: (graph: Graph) => any): any {
  const identityError = getDocumentEdgeIdentityError(context, format);
  if (identityError) return identityError;
  for (const change of context.changes) {
    const fields = getFields(change.entity);
    if ((!fields.includes(change.field) && change.field !== 'data') || ['id', 'parentId', 'initialNodeId', 'sourcePort', 'targetPort', 'ports'].includes(change.field)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', path: change.path, message: `${format}: ${change.field} cannot be patched without changing native structure` }] };
  }
  try { return { ok: true, source: toNative(context.graph) }; }
  catch (error) { return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: String(error) }] }; }
}
