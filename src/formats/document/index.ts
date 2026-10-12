import type { Graph } from '../../types';

export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

export interface GraphDocumentDiagnostic {
  code: string;
  message: string;
  path?: string;
  severity: 'info' | 'warning' | 'error';
}

/** Exact native source and an explicitly separate, possibly partial Graph projection. */
export interface GraphDocument<TSource = JSONValue, TGraph extends Graph = Graph> {
  kind: '@statelyai/graph/document';
  version: 1;
  format: string;
  source: TSource;
  graph: TGraph | null;
  baseline: { source: TSource; graph: TGraph | null };
  diagnostics: GraphDocumentDiagnostic[];
  state?: JSONValue;
}

export interface GraphDocumentProjection<TGraph extends Graph = Graph> {
  graph: TGraph | null;
  diagnostics?: GraphDocumentDiagnostic[];
  state?: JSONValue;
}

export interface GraphDocumentChange {
  entity: 'graph' | 'node' | 'edge';
  id?: string;
  field: string;
  /** JSON pointer using stable entity IDs instead of source-array offsets. */
  path: string;
  before?: unknown;
  after?: unknown;
  beforePresent: boolean;
  afterPresent: boolean;
}

export interface GraphDocumentComparisonContext<TSource> {
  source: TSource;
  baselineSource: TSource;
  state?: JSONValue;
}

export interface GraphDocumentPatchContext<TSource, TGraph extends Graph = Graph> {
  source: TSource;
  baselineSource: TSource;
  /** Fresh source projection with requested Graph changes merged into it. */
  graph: TGraph;
  baselineGraph: TGraph;
  sourceGraph: TGraph;
  changes: GraphDocumentChange[];
  state?: JSONValue;
}

export type GraphDocumentPatchResult<TSource> =
  | { ok: true; source: TSource; diagnostics?: GraphDocumentDiagnostic[] }
  | { ok: false; diagnostics: GraphDocumentDiagnostic[] };

export interface GraphDocumentConverterConfig<TSource, TGraph extends Graph = Graph> {
  format: string;
  codec: { from(source: TSource): TGraph; to(graph: TGraph): TSource };
  project?: (source: TSource) => GraphDocumentProjection<TGraph>;
  /** Normalize only verified adapter provenance; never discard arbitrary user fields. */
  getComparisonGraph?: (graph: TGraph, context: GraphDocumentComparisonContext<TSource>) => TGraph;
  /** Extract verified private provenance only, so edits cannot hide behind user data changes. */
  getComparisonState?: (graph: TGraph, context: GraphDocumentComparisonContext<TSource>) => JSONValue;
  patch?: (context: GraphDocumentPatchContext<TSource, TGraph>) => GraphDocumentPatchResult<TSource>;
}

export interface GraphDocumentImportOptions {
  /** Throw instead of retaining an unavailable projection or error diagnostic. */
  strict?: boolean;
}

export interface GraphDocumentUpdateOptions {
  /** Regeneration is explicit and diagnostic-bearing; converter.to always stays strict. */
  mode?: 'strict' | 'regenerate';
}

export interface GraphDocumentConverter<TSource, TGraph extends Graph = Graph> {
  format: string;
  from(source: TSource, options?: GraphDocumentImportOptions): GraphDocument<TSource, TGraph>;
  to(document: GraphDocument<TSource, TGraph>): TSource;
  getUpdate(document: GraphDocument<TSource, TGraph>, options?: GraphDocumentUpdateOptions): GraphDocumentPatchResult<TSource>;
}

function getDiagnostic(code: string, message: string, path?: string): GraphDocumentDiagnostic {
  return { code, message, severity: 'error', ...(path !== undefined && { path }) };
}

function getDocumentError(diagnostics: GraphDocumentDiagnostic[]): Error & { diagnostics: GraphDocumentDiagnostic[] } {
  return Object.assign(new Error(diagnostics.map((item) => `${item.code}: ${item.message}`).join('; ')), { diagnostics });
}

/** Validate the wire domain before cloning; object undefined is allowed only for Graph views. */
function getJSONClone<T>(value: T, optionalUndefined = false): T {
  const ancestors = new Set<object>();
  const stack: Array<{ value: unknown; path: string; exit?: boolean; objectProperty?: boolean }> = [{ value, path: '' }];
  while (stack.length) {
    const item = stack.pop()!;
    const current = item.value;
    if (item.exit) { ancestors.delete(current as object); continue; }
    if (current === undefined && optionalUndefined && item.objectProperty) continue;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number' && Number.isFinite(current)) continue;
    if (typeof current !== 'object' || current === null) throw getDocumentError([getDiagnostic('invalid-json-value', 'Source/state must contain only finite JSON values', item.path)]);
    if (ancestors.has(current)) throw getDocumentError([getDiagnostic('invalid-json-value', 'Cyclic source/state cannot be serialized', item.path)]);
    const array = Array.isArray(current);
    if (!array && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) {
      throw getDocumentError([getDiagnostic('invalid-json-value', 'Class instances are outside the JSON source domain', item.path)]);
    }
    if (Object.getOwnPropertySymbols(current).length) throw getDocumentError([getDiagnostic('invalid-json-value', 'Symbol properties are outside the JSON source domain', item.path)]);
    ancestors.add(current);
    stack.push({ ...item, exit: true });
    const keys = Object.getOwnPropertyNames(current);
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      if (!descriptor.enumerable || !('value' in descriptor) || (array && !/^(?:0|[1-9]\d*)$/.test(key))) {
        throw getDocumentError([getDiagnostic('invalid-json-value', 'Accessors/non-JSON properties cannot be preserved', `${item.path}/${key}`)]);
      }
      stack.push({ value: descriptor.value, path: `${item.path}/${key}`, objectProperty: !array });
    }
    if (array && keys.length !== current.length + 1) throw getDocumentError([getDiagnostic('invalid-json-value', 'Sparse arrays are outside the JSON source domain', item.path)]);
  }
  return JSON.parse(JSON.stringify(value));
}

export function isGraphDocumentJSONEqual(a: unknown, b: unknown): boolean {
  const stack: Array<[unknown, unknown]> = [[a, b]];
  while (stack.length) {
    const [left, right] = stack.pop()!;
    if (left === right) continue;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false;
      stack.push([(left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]]);
    }
  }
  return true;
}

function getPointerToken(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1'); }

function getGraphChanges(before: Graph, after: Graph): GraphDocumentChange[] {
  const changes: GraphDocumentChange[] = [];
  const addRecordChanges = (left: object, right: object, entity: GraphDocumentChange['entity'], id?: string) => {
    for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (entity === 'graph' && ['nodes', 'edges'].includes(field)) continue;
      const beforePresent = Object.hasOwn(left, field);
      const afterPresent = Object.hasOwn(right, field);
      const previous = (left as Record<string, unknown>)[field];
      const next = (right as Record<string, unknown>)[field];
      if (beforePresent === afterPresent && isGraphDocumentJSONEqual(previous, next)) continue;
      changes.push({ entity, ...(id !== undefined && { id }), field,
        path: entity === 'graph' ? `/${getPointerToken(field)}` : `/${entity === 'node' ? 'nodes' : 'edges'}/${getPointerToken(id!)}/${getPointerToken(field)}`,
        ...(beforePresent && { before: previous }), ...(afterPresent && { after: next }), beforePresent, afterPresent });
    }
  };
  addRecordChanges(before, after, 'graph');
  for (const [collection, entity] of [['nodes', 'node'], ['edges', 'edge']] as const) {
    const left = before[collection];
    const right = after[collection];
    const leftIds = left.map((item) => item.id);
    const rightIds = right.map((item) => item.id);
    if (new Set(leftIds).size !== leftIds.length || new Set(rightIds).size !== rightIds.length) throw getDocumentError([getDiagnostic('invalid-projection', `Duplicate ${entity} IDs prevent stable document updates`)]);
    if (!isGraphDocumentJSONEqual(leftIds, rightIds)) changes.push({ entity: 'graph', field: collection, path: `/${collection}`, before: leftIds, after: rightIds, beforePresent: true, afterPresent: true });
    const leftById = new Map(left.map((item) => [item.id, item]));
    for (const item of right) {
      const previous = leftById.get(item.id);
      if (previous) addRecordChanges(previous, item, entity, item.id);
    }
  }
  return changes;
}

function getMergedGraph<TGraph extends Graph>(native: TGraph, requested: TGraph, changes: GraphDocumentChange[]): TGraph {
  const merged = getJSONClone(native, true);
  const entityMaps = { node: new Map(merged.nodes.map((item) => [item.id, item])), edge: new Map(merged.edges.map((item) => [item.id, item])) };
  for (const change of changes) {
    if (change.entity === 'graph' && (change.field === 'nodes' || change.field === 'edges')) {
      const collection = change.field;
      const currentById = new Map(merged[collection].map((entity) => [entity.id, entity]));
      const requestedById = new Map(requested[collection].map((entity) => [entity.id, entity]));
      (merged as Graph)[collection] = (change.after as string[]).map((id) => currentById.get(id) ?? requestedById.get(id)!) as never;
      const entity = collection === 'nodes' ? 'node' : 'edge';
      entityMaps[entity] = new Map(merged[collection].map((item) => [item.id, item])) as never;
      continue;
    }
    const record = change.entity === 'graph' ? merged : entityMaps[change.entity].get(change.id!);
    if (!record) throw getDocumentError([getDiagnostic('conflicting-edit', 'The native source removed an edited entity', change.path)]);
    if (change.afterPresent) Object.defineProperty(record, change.field, { value: getJSONClone(change.after), enumerable: true, configurable: true, writable: true });
    else delete (record as unknown as Record<string, unknown>)[change.field];
  }
  return merged;
}

/** Create an explicit codec registration; this module never eagerly imports native adapters. */
export function createGraphDocumentConverter<TSource, TGraph extends Graph>(config: GraphDocumentConverterConfig<TSource, TGraph>): GraphDocumentConverter<TSource, TGraph> {
  if (!config.format.trim()) throw new Error('Graph document format must be non-empty');
  const getProjection = (source: TSource): GraphDocumentProjection<TGraph> => {
    try {
      const projection = config.project ? config.project(getJSONClone(source)) : { graph: config.codec.from(getJSONClone(source)) };
      const diagnostics = getJSONClone(projection.diagnostics ?? []);
      if (projection.graph === null && !diagnostics.some((item) => item.severity === 'error')) diagnostics.push(getDiagnostic('projection-unavailable', 'Native source has no supported Graph projection'));
      if (projection.graph && !diagnostics.some((item) => item.code.startsWith('projection-'))) diagnostics.push({ code: 'projection-partial', message: 'Exact source retention does not establish complete native semantic projection', severity: 'warning' });
      return { graph: projection.graph === null ? null : getJSONClone(projection.graph, true),
        diagnostics,
        ...(projection.state !== undefined && { state: getJSONClone(projection.state) }) };
    } catch (error) {
      return { graph: null, diagnostics: [getDiagnostic('projection-unavailable', error instanceof Error ? error.message : String(error))] };
    }
  };
  const getComparison = (graph: TGraph, source: TSource, baselineSource: TSource, state?: JSONValue): TGraph => getJSONClone(config.getComparisonGraph
    ? config.getComparisonGraph(getJSONClone(graph, true), { source: getJSONClone(source), baselineSource: getJSONClone(baselineSource), ...(state !== undefined && { state: getJSONClone(state) }) })
    : graph, true);

  const getUpdate = (document: GraphDocument<TSource, TGraph>, options: GraphDocumentUpdateOptions = {}): GraphDocumentPatchResult<TSource> => {
    try {
      if (document?.kind !== '@statelyai/graph/document' || document.version !== 1 || document.format !== config.format) return { ok: false, diagnostics: [getDiagnostic('invalid-document', 'Document kind/version/format does not match this converter')] };
      const source = getJSONClone(document.source);
      const baselineSource = getJSONClone(document.baseline.source);
      const graph = document.graph === null ? null : getJSONClone(document.graph, true);
      const baselineGraph = document.baseline.graph === null ? null : getJSONClone(document.baseline.graph, true);
      if (document.state !== undefined) getJSONClone(document.state);
      const baselineProjection = getProjection(baselineSource);
      if (!isGraphDocumentJSONEqual(document.state, baselineProjection.state)) return { ok: false, diagnostics: [getDiagnostic('unsupported-state-edit', 'Adapter state must match the baseline native source; edit document.source instead')] };
      if (baselineGraph && baselineProjection.graph && config.getComparisonState) {
        const context = { source: baselineSource, baselineSource, ...(document.state !== undefined && { state: document.state }) };
        if (!isGraphDocumentJSONEqual(getJSONClone(config.getComparisonState(getJSONClone(baselineGraph, true), getJSONClone(context))), getJSONClone(config.getComparisonState(getJSONClone(baselineProjection.graph, true), getJSONClone(context))))) return { ok: false, diagnostics: [getDiagnostic('invalid-baseline', 'Stored private projection state does not match its baseline source')] };
      }
      if ((baselineProjection.graph === null) !== (baselineGraph === null)) return { ok: false, diagnostics: [getDiagnostic('invalid-baseline', 'Stored projection availability does not match its baseline source')] };
      if (baselineGraph && baselineProjection.graph && !isGraphDocumentJSONEqual(getComparison(baselineGraph, baselineSource, baselineSource, document.state), getComparison(baselineProjection.graph, baselineSource, baselineSource, baselineProjection.state))) {
        return { ok: false, diagnostics: [getDiagnostic('invalid-baseline', 'Stored Graph baseline does not match its native source')] };
      }
      if (graph === null && baselineGraph === null) return { ok: true, source, diagnostics: getProjection(source).diagnostics ?? [] };
      if (graph === null || baselineGraph === null) return { ok: false, diagnostics: [getDiagnostic('unsupported-edit', 'Projection creation/removal requires an explicit native editing policy')] };
      const baseline = getComparison(baselineGraph, baselineSource, baselineSource, document.state);
      // document.graph was authored against the baseline projection; fresh
      // source edits must not make its original provenance appear untrusted.
      const requested = getComparison(graph, baselineSource, baselineSource, document.state);
      const changes = getGraphChanges(baseline, requested);
      const rawChanges = getGraphChanges(baselineGraph, graph);
      const normalizedPaths = new Set(changes.map((change) => change.path));
      const comparisonContext = { source: baselineSource, baselineSource, ...(document.state !== undefined && { state: document.state }) };
      const normalizedFieldPaths = config.getComparisonGraph && !config.getComparisonState ? new Set(getGraphChanges(baselineGraph, baseline).map((change) => change.path)) : undefined;
      const privateStateChanged = config.getComparisonState
        ? !isGraphDocumentJSONEqual(getJSONClone(config.getComparisonState(getJSONClone(baselineGraph, true), getJSONClone(comparisonContext))), getJSONClone(config.getComparisonState(getJSONClone(graph, true), getJSONClone(comparisonContext))))
        : normalizedFieldPaths && rawChanges.some((change) => normalizedFieldPaths.has(change.path));
      if (privateStateChanged || rawChanges.some((change) => !normalizedPaths.has(change.path))) return { ok: false, diagnostics: [getDiagnostic('unsupported-state-edit', 'Graph projection provenance/annotations were edited; edit document.source instead')] };
      if (!changes.length) return { ok: true, source, diagnostics: getProjection(source).diagnostics ?? [] };
      const currentProjection = getProjection(source);
      if (!currentProjection.graph) return { ok: false, diagnostics: [getDiagnostic('projection-unavailable', 'Changed native source cannot project the requested Graph edit'), ...(currentProjection.diagnostics ?? [])] };
      const current = getComparison(currentProjection.graph, source, baselineSource, currentProjection.state);
      const nativeChanges = getGraphChanges(baseline, current);
      const nativeByPath = new Map(nativeChanges.map((change) => [change.path, change]));
      const conflicts = changes.filter((change) => {
        const native = nativeByPath.get(change.path);
        return native !== undefined && (native.afterPresent !== change.afterPresent || !isGraphDocumentJSONEqual(native.after, change.after));
      });
      if (conflicts.length) return { ok: false, diagnostics: conflicts.map((change) => getDiagnostic('conflicting-edit', 'Source and Graph changed the same mapped field differently', change.path)) };
      const merged = getMergedGraph(current, requested, changes);
      if (options.mode === 'regenerate') {
        const generated = getJSONClone(config.codec.to(merged));
        const diagnostics: GraphDocumentDiagnostic[] = [{ code: 'lossy-regeneration', message: 'Native source regenerated; source details and requested Graph fields may be lost', severity: 'warning' }];
        const generatedProjection = getProjection(generated);
        if (!generatedProjection.graph) {
          diagnostics.push({ code: 'graph-regeneration-unavailable', message: `Generated source cannot reproduce a Graph projection: ${(generatedProjection.diagnostics ?? []).map((item) => item.message).join('; ')}`, severity: 'warning' });
        } else {
          try {
            const regenerated = getComparison(generatedProjection.graph, generated, baselineSource, generatedProjection.state);
            for (const loss of getGraphChanges(merged, regenerated)) diagnostics.push({ code: 'graph-regeneration-loss', message: 'Regenerated source does not reproduce this requested Graph field', path: loss.path, severity: 'warning' });
          } catch (error) {
            diagnostics.push({ code: 'graph-regeneration-unavailable', message: `Generated projection cannot be compared: ${error instanceof Error ? error.message : String(error)}`, severity: 'warning' });
          }
        }
        return { ok: true, source: generated, diagnostics };
      }
      if (!config.patch) return { ok: false, diagnostics: [getDiagnostic('unsupported-edit', 'This converter has no verified native patch for Graph edits')] };
      const patched = config.patch({ source: getJSONClone(source), baselineSource: getJSONClone(baselineSource), graph: getJSONClone(merged, true), baselineGraph: getJSONClone(baseline, true), sourceGraph: getJSONClone(current, true), changes: getJSONClone(changes), ...(currentProjection.state !== undefined && { state: getJSONClone(currentProjection.state) }) });
      if (!patched.ok) return patched;
      const patchedSource = getJSONClone(patched.source);
      const proof = getProjection(patchedSource);
      if (!proof.graph || !isGraphDocumentJSONEqual(getComparison(proof.graph, patchedSource, baselineSource, proof.state), merged)) {
        return { ok: false, diagnostics: [getDiagnostic('patch-verification-failed', 'Patched source does not reproduce the requested merged Graph projection'), ...(proof.diagnostics ?? [])] };
      }
      return { ok: true, source: patchedSource, diagnostics: [...(proof.diagnostics ?? []), ...(patched.diagnostics ?? [])] };
    } catch (error) {
      return { ok: false, diagnostics: error && typeof error === 'object' && 'diagnostics' in error ? (error as { diagnostics: GraphDocumentDiagnostic[] }).diagnostics : [getDiagnostic('document-update-failed', error instanceof Error ? error.message : String(error))] };
    }
  };
  return {
    format: config.format,
    from(source, options = {}) {
      const saved = getJSONClone(source);
      const projection = getProjection(saved);
      const diagnostics = [...(projection.diagnostics ?? [])];
      if (projection.graph && !diagnostics.some((item) => item.code.startsWith('projection-'))) diagnostics.push({ code: 'projection-partial', message: 'Exact source retention does not establish complete native semantic projection', severity: 'warning' });
      if (options.strict && (!projection.graph || diagnostics.some((item) => item.severity === 'error'))) throw getDocumentError(diagnostics);
      return { kind: '@statelyai/graph/document', version: 1, format: config.format, source: saved,
        graph: projection.graph === null ? null : getJSONClone(projection.graph, true),
        baseline: { source: getJSONClone(saved), graph: projection.graph === null ? null : getJSONClone(projection.graph, true) }, diagnostics,
        ...(projection.state !== undefined && { state: getJSONClone(projection.state) }) };
    },
    to(document) {
      const result = getUpdate(document);
      if (!result.ok) throw getDocumentError(result.diagnostics);
      return result.source;
    },
    getUpdate,
  };
}

export function getGraphDocumentUpdate<TSource, TGraph extends Graph>(document: GraphDocument<TSource, TGraph>, converter: GraphDocumentConverter<TSource, TGraph>, options?: GraphDocumentUpdateOptions): GraphDocumentPatchResult<TSource> {
  return converter.getUpdate(document, options);
}
