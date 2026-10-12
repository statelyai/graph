/** Private JSON wire convention; not a source document API. */
export interface FormatMetadata {
  kind: '@statelyai/graph';
  version: 2;
  format: string;
  original: Record<string, any>;
  mapped: Record<string, any>;
}

export interface FormatExportOptions {
  /** Disable interpretation of native-import state when Graph data is user-authored. */
  nativeCarrier?: boolean;
}

export interface FormatImportOptions {
  /** `native` disables adapter metadata interpretation, including legacy blobs. */
  metadata?: 'auto' | 'native' | 'legacy';
}

export function getClonedJSON<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function isJSONEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) =>
    Object.hasOwn(b, key) && isJSONEqual((a as any)[key], (b as any)[key]),
  );
}

export function createMetadata(format: string, original: object, mapped: object): FormatMetadata {
  return { kind: '@statelyai/graph', version: 2, format,
    original: getClonedJSON(original), mapped: getClonedJSON(mapped) };
}

export function getMetadata(value: unknown, format: string): FormatMetadata | undefined {
  const metadata = value as FormatMetadata | undefined;
  return metadata?.kind === '@statelyai/graph' && metadata.version === 2 &&
    metadata.format === format && metadata.original && typeof metadata.original === 'object' &&
    !Array.isArray(metadata.original) && metadata.mapped && typeof metadata.mapped === 'object' &&
    !Array.isArray(metadata.mapped) ? metadata : undefined;
}

/** Current mapped values win when changed; untouched values retain original presence. */
export function getRestoredRecord<T extends object>(mapped: T, metadata?: FormatMetadata): T {
  if (!metadata) return getClonedJSON(mapped);
  // Undefined-valued properties have no JSON wire presence. Compare the same
  // serialized view used by both stored snapshots, rather than fabricating edits.
  mapped = getClonedJSON(mapped);
  const restored = getClonedJSON(metadata.original);
  for (const key of new Set([...Object.keys(mapped), ...Object.keys(metadata.mapped)])) {
    const current = (mapped as any)[key];
    if (Object.hasOwn(mapped, key) !== Object.hasOwn(metadata.mapped, key) ||
        !isJSONEqual(current, metadata.mapped[key])) {
      if (Object.hasOwn(mapped, key)) Object.defineProperty(restored, key, {
        value: getClonedJSON(current), enumerable: true, configurable: true, writable: true,
      });
      else delete restored[key];
    }
  }
  return restored as T;
}

interface FormatNativeCarrier {
  __statelyaiNative: {
    kind: '@statelyai/graph/native'; version: 1; format: string; provenance: 'native-import';
    data?: unknown; native: any; baseline: any;
  };
}

export function createNativeCarrier(data: unknown, format: string, native: unknown, baseline: unknown): any {
  return {
    ...(data && typeof data === 'object' && !Array.isArray(data) ? getClonedJSON(data) : {}),
    __statelyaiNative: { kind: '@statelyai/graph/native', version: 1, format, provenance: 'native-import',
      data: getClonedJSON(data), native: getClonedJSON(native), baseline: getClonedJSON(baseline) },
  } satisfies FormatNativeCarrier;
}

export function getNativeCarrier(data: any, format: string): FormatNativeCarrier['__statelyaiNative'] | undefined {
  const carrier = data?.__statelyaiNative;
  return carrier?.kind === '@statelyai/graph/native' && carrier.version === 1 && carrier.provenance === 'native-import' &&
    carrier.format === format && carrier.native && carrier.baseline ? carrier : undefined;
}

export function getCarrierData(data: any, format: string): any {
  const carrier = getNativeCarrier(data, format);
  if (!carrier) return data;
  const current = { ...data };
  delete current.__statelyaiNative;
  if (!carrier.data || typeof carrier.data !== 'object' || Array.isArray(carrier.data)) {
    return Object.keys(current).length > 0 ? getClonedJSON(current) : getClonedJSON(carrier.data);
  }
  // A foreign property with the same name is kept in the captured user payload.
  if (Object.hasOwn(carrier.data, '__statelyaiNative')) current.__statelyaiNative = (carrier.data as any).__statelyaiNative;
  return getClonedJSON(current);
}

/** Apply live metadata-field edits while retaining independently captured user data. */
export function getEditedData(original: any, baseline: any, current: any): any {
  if (isJSONEqual(baseline, current)) return getClonedJSON(original);
  const result = original && typeof original === 'object' && !Array.isArray(original) ? getClonedJSON(original) : {};
  for (const key of new Set([...Object.keys(baseline ?? {}), ...Object.keys(current ?? {})])) {
    if (Object.hasOwn(baseline ?? {}, key) === Object.hasOwn(current ?? {}, key) && isJSONEqual(baseline?.[key], current?.[key])) continue;
    if (Object.hasOwn(current ?? {}, key)) Object.defineProperty(result, key, {
      value: getClonedJSON(current[key]), enumerable: true, configurable: true, writable: true,
    });
    else delete result[key];
  }
  return result;
}

/** Patch differences between generated projections onto an independent native snapshot. */
export function getMergedNative(original: any, before: any, after: any): any {
  if (after?.kind === '@statelyai/graph' && getMetadata(after, after.format)) return getClonedJSON(after);
  if (isJSONEqual(before, after)) return getClonedJSON(original);
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' ||
      Array.isArray(before) !== Array.isArray(after)) return getClonedJSON(after);
  if (Array.isArray(after)) {
    const beforeIds = before.map(getEntityIdentity);
    const afterIds = after.map(getEntityIdentity);
    const hasIdentity = [...beforeIds, ...afterIds].every((id) => id !== undefined) &&
      new Set(beforeIds).size === beforeIds.length && new Set(afterIds).size === afterIds.length;
    if (hasIdentity && Array.isArray(original)) {
      const byId = new Map(before.map((value: any, index: number) => [beforeIds[index], value]));
      const originalById = new Map(original.map((value: any) => [getEntityIdentity(value), value]));
      // Missing native edge ids acquire stable ids in the baseline projection.
      // Importers keep those arrays in input order, which supplies correspondence.
      if (original.length === before.length) {
        original.forEach((value: any, index: number) => {
          if (getEntityIdentity(value) === undefined) originalById.set(beforeIds[index], value);
        });
      }
      const merged = after.map((value: any, index: number) => {
        const id = afterIds[index];
        return byId.has(id) && originalById.has(id)
          ? getMergedNative(originalById.get(id), byId.get(id), value)
          : getClonedJSON(value);
      });
      // Projection-only arrays can represent one native section among several.
      // Entries absent from the baseline projection were never Graph-owned.
      if (original.length !== before.length) merged.push(...original.filter((value: any) => {
        const id = getEntityIdentity(value);
        return id !== undefined && !byId.has(id);
      }).map(getClonedJSON));
      return merged;
    }
    // Label/section/value arrays have no provable identity. Replace conservatively
    // when their length changes; otherwise retain unchanged positions.
    if (!Array.isArray(original) || before.length !== after.length || original.length !== before.length) return getClonedJSON(after);
    return after.map((value, index) => getMergedNative(original[index], before[index], value));
  }
  const result = original && typeof original === 'object' && !Array.isArray(original) ? getClonedJSON(original) : {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (isJSONEqual(before[key], after[key]) && Object.hasOwn(before, key) === Object.hasOwn(after, key)) continue;
    if (!Object.hasOwn(after, key)) delete result[key];
    else Object.defineProperty(result, key, { value: getMergedNative(result[key], before[key], after[key]),
      enumerable: true, writable: true, configurable: true });
  }
  return result;
}

function getEntityIdentity(value: any): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = value.id ?? value.data?.id ?? value.name;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

/** Native document comparison consumes verified adapter state once. */
export function getNativeDocumentGraph<T extends { data?: any; nodes: any[]; edges: any[] }>(graph: T, format: string, source: any): T {
  const result = getClonedJSON(graph);
  const carrier = getNativeCarrier(result.data, format);
  let external = source;
  if (format === 'cytoscape' && !Array.isArray(source.elements)) external = { ...source, elements: { ...source.elements, nodes: source.elements.nodes ?? [], edges: source.elements.edges ?? [] } };
  if (format === 'cytoscape' && Array.isArray(source.elements)) external = { ...source, elements: {
    nodes: source.elements.filter((element: any) => !('source' in element.data && 'target' in element.data)),
    edges: source.elements.filter((element: any) => 'source' in element.data && 'target' in element.data),
  } };
  if (carrier && isJSONEqual(carrier.native, external) && Array.isArray(carrier.baseline?.nodes) && Array.isArray(carrier.baseline?.edges) &&
      isJSONEqual(getClonedJSON({ ...result, data: carrier.data }), carrier.baseline)) result.data = getCarrierData(result.data, format);
  for (const node of result.nodes) {
    if (format === 'd3' && node.__statelyaiD3Node?.kind === '@statelyai/graph/d3-node' && node.__statelyaiD3Node.version === 1) delete node.__statelyaiD3Node;
  }
  return result;
}

/** Remove renderer-derived duplication during projection only, never from edited Graphs. */
export function getStructuredDocumentProjectionGraph<T extends { data?: any; nodes: any[]; edges: any[] }>(graph: T, source: any, format: string): T {
  const projected = getNativeDocumentGraph(graph, format, source);
  const getWireData = (native: any, kind: string): FormatMetadata | undefined => {
    if (format === 'elk') {
      try { return getMetadata(JSON.parse(native?.layoutOptions?.['statelyai.metadata']), `elk.${kind}`); } catch { return undefined; }
    }
    const value = format === 'cytoscape' || format === 'xyflow' ? native?.data?.__statelyai : format === 'jgf' ? native?.metadata?.__statelyai : native?.__statelyai;
    return getMetadata(value, `${format}.${kind}`);
  };
  const getVisibleData = (native: any, metadata: FormatMetadata, kind: string): any => {
    if (format === 'd3') return getClonedJSON(native.data);
    if (format === 'cytoscape') return getClonedJSON(native.data?.[kind === 'graph' ? 'graphData' : kind === 'node' ? 'nodeData' : 'edgeData']);
    if (format === 'elk' || kind === 'graph' && format === 'xyflow') return getClonedJSON(metadata.original.data);
    const visible = { ...(format === 'jgf' ? native.metadata : native.data) };
    delete visible.__statelyai;
    if (format === 'xyflow') delete visible.label;
    const baseline = format === 'xyflow' ? { ...(metadata.mapped.__visibleData ?? {}) } : { ...(metadata.mapped.data ?? {}) };
    if (format === 'xyflow') { delete baseline.__statelyai; delete baseline.label; }
    const restored = getEditedData(metadata.original.data, baseline, visible);
    if (format === 'jgf' && kind === 'edge' && Object.hasOwn(native, 'relation')) return { ...restored, relation: native.relation };
    return restored;
  };
  const root = format === 'jgf' ? source.graph : source;
  const rootMetadata = getWireData(root, 'graph');
  if (rootMetadata) projected.data = getVisibleData(root, rootMetadata, 'graph');
  const natives: Record<string, Map<string, any>> = { nodes: new Map(), edges: new Map() };
  if (format === 'elk') {
    const queue = [source];
    for (let i = 0; i < queue.length; i++) {
      for (const node of queue[i].children ?? []) { natives.nodes.set(node.id, node); queue.push(node); }
      for (const edge of queue[i].edges ?? []) natives.edges.set(edge.id, edge);
    }
  } else if (format === 'cytoscape') {
    const values = Array.isArray(source.elements) ? source.elements : [...(source.elements.nodes ?? []), ...(source.elements.edges ?? [])];
    let index = 0;
    for (const native of values) {
      if ('source' in native.data && 'target' in native.data) { natives.edges.set(native.data.id ?? `e${index}`, native); index++; }
      else natives.nodes.set(native.data.id, native);
    }
  } else if (['d3', 'jgf', 'xyflow'].includes(format)) {
    if (Array.isArray(root.nodes)) for (const node of root.nodes) natives.nodes.set(node.id, node);
    else for (const [id, node] of Object.entries(root.nodes ?? {})) natives.nodes.set(id, node);
    (root.links ?? root.edges ?? []).forEach((edge: any, index: number) => natives.edges.set(edge.id ?? `e${index}`, edge));
  }
  for (const collection of ['nodes', 'edges'] as const) for (const entity of projected[collection]) {
    const native = natives[collection].get(entity.id);
    const kind = collection === 'nodes' ? 'node' : 'edge';
    const metadata = getWireData(native, kind);
    if (metadata) entity.data = getVisibleData(native, metadata, kind);
  }
  if (format === 'xyflow') for (const collection of ['nodes', 'edges'] as const) {
    const byId = new Map((source[collection] ?? []).map((entity: any) => [entity.id, entity]));
    for (const entity of projected[collection]) {
      if (!entity.data || typeof entity.data !== 'object') continue;
      const native: any = byId.get(entity.id);
      const metadata = getMetadata(native?.data?.__statelyai, `xyflow.${collection === 'nodes' ? 'node' : 'edge'}`);
      if (metadata?.original.data && Object.hasOwn(metadata.original.data, 'label')) entity.data.label = getClonedJSON(metadata.original.data.label);
      else delete entity.data.label;
    }
  }
  return projected;
}

/** Strict native field patches: identity/structure are never inferred from array positions. */
export function getStructuredDocumentPatch(context: any, format: string): any {
  const graph = context.graph;
  const baselineGraph = context.sourceGraph;
  const source = getClonedJSON(context.source);
  const getFailure = (path: string, message = 'No verified native mapping for this Graph edit') => ({ ok: false, diagnostics: [{ code: 'unsupported-edit', severity: 'error', path, message }] });
  const getChanges = (before: any, after: any) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !isJSONEqual(before[key], after[key]) || Object.hasOwn(before, key) !== Object.hasOwn(after, key));
  const updateField = (record: any, key: string, value: any) => { if (value === undefined) delete record[key]; else Object.defineProperty(record, key, { value: getClonedJSON(value), enumerable: true, configurable: true, writable: true }); };
  const updateJGFData = (native: any, before: any, after: any, kind: string, path: string): any => {
    const wire = getMetadata(native.metadata?.__statelyai, `jgf.${kind}`);
    if (after === null && !wire) { native.metadata = null; return undefined; }
    if (!after || typeof after !== 'object' || Array.isArray(after)) return getFailure(path, 'Native JGF metadata requires an object mapping');
    native.metadata ??= {};
    for (const field of getChanges(before ?? {}, after)) {
      if (kind === 'edge' && field === 'relation') { updateField(native, 'relation', after.relation); continue; }
      if (field === '__statelyai' && wire) return getFailure(path, 'Reserved user metadata has no unambiguous native field mapping');
      updateField(native.metadata, field, after[field]);
    }
    return undefined;
  };
  if (!graph || !baselineGraph) return getFailure('graph', 'A binary Graph projection is unavailable');
  for (const collection of ['nodes', 'edges']) {
    if (!isJSONEqual(baselineGraph[collection].map((entity: any) => entity.id), graph[collection].map((entity: any) => entity.id))) return getFailure(collection, 'Structural edits require a native document operation');
  }
  if (format === 'adjacency-list' || format === 'edge-list') return getFailure('graph', 'The minimal native representation has no editable Graph fields');
  if (format === 'tgf') {
    const tokens = source.split(/(\r\n|\n|\r)/);
    const nodeLines = new Map<string, number>();
    const edgeLines: number[] = [];
    let edges = false;
    for (let i = 0; i < tokens.length; i += 2) {
      if (tokens[i].trim() === '#') { edges = true; continue; }
      if (!tokens[i].trim()) continue;
      if (edges) edgeLines.push(i); else nodeLines.set(tokens[i].trimStart().split(/\s/)[0], i);
    }
    const getEdgeRecords = (text: string) => { let inEdges = false; const records: string[] = []; for (const line of text.split(/\r\n|\n|\r/)) { if (line.trim() === '#') { inEdges = true; continue; } if (inEdges && line.trim()) records.push(line); } return records; };
    const edgeChange = context.changes.find((change: any) => change.entity === 'edge');
    if (edgeChange && !isJSONEqual(getEdgeRecords(context.baselineSource), edgeLines.map((index) => tokens[index]))) return { ok: false, diagnostics: [{ code: 'ambiguous-native-identity', severity: 'error', path: edgeChange.path, message: 'TGF generated edge identity is ambiguous after the native edge record sequence changed' }] };
    for (const key of getChanges(baselineGraph, graph)) if (key !== 'nodes' && key !== 'edges') return getFailure(key);
    for (const [collection, records] of [['nodes', nodeLines], ['edges', edgeLines]] as const) {
      for (let i = 0; i < graph[collection].length; i++) {
        const before = baselineGraph[collection][i], after = graph[collection][i];
        for (const key of getChanges(before, after)) {
          if (key !== 'label' || typeof after.label !== 'string' || /[\r\n]/.test(after.label)) return getFailure(`${collection}.${after.id}.${key}`);
          const position = collection === 'nodes' ? (records as Map<string, number>).get(after.id) : (records as number[])[i];
          if (position === undefined) return getFailure(`${collection}.${after.id}`, 'Native line identity is unavailable');
          const pattern = collection === 'nodes' ? /^(\s*\S+)([ \t]*)(.*)$/ : /^(\s*\S+[ \t]+\S+)([ \t]*)(.*)$/;
          const match = tokens[position].match(pattern);
          if (!match) return getFailure(`${collection}.${after.id}`, 'Native line cannot be patched safely');
          tokens[position] = match[1] + (match[2] || (after.label ? ' ' : '')) + after.label;
        }
      }
    }
    return { ok: true, source: tokens.join('') };
  }
  if (format === 'd3' || format === 'cytoscape') {
    const getEdgeRecords = (native: any): any[] => format === 'd3' ? native.links ?? native.edges ?? [] : (Array.isArray(native.elements) ? native.elements : [...native.elements?.nodes ?? [], ...native.elements?.edges ?? []]).filter((record: any) => record.data && 'source' in record.data && 'target' in record.data);
    const getDeclaredIds = (records: any[]) => { const ids = new Map<string, number>(); for (const record of records) { const id = format === 'd3' ? record.id : record.data.id; if (typeof id === 'string') ids.set(id, (ids.get(id) ?? 0) + 1); } return ids; };
    const baselineRecords = getEdgeRecords(context.baselineSource), currentRecords = getEdgeRecords(source);
    const sameSequence = isJSONEqual(baselineRecords, currentRecords), baselineIds = getDeclaredIds(baselineRecords), currentIds = getDeclaredIds(currentRecords);
    for (const change of context.changes) if (change.entity === 'edge' && !sameSequence && (baselineIds.get(change.id) !== 1 || currentIds.get(change.id) !== 1)) return { ok: false, diagnostics: [{ code: 'ambiguous-native-identity', severity: 'error', path: change.path, message: `${format} generated edge identity is ambiguous after the native edge record sequence changed; a unique explicit ID must exist in both sources` }] };
  }
  if (format === 'jgf') {
    const baselineRecords = context.baselineSource.graph.edges ?? [];
    const currentRecords = source.graph.edges ?? [];
    if (!isJSONEqual(baselineRecords, currentRecords)) {
      const getIds = (records: any[]) => {
        const ids = new Map<string, number>();
        for (const record of records) if (typeof record.id === 'string') ids.set(record.id, (ids.get(record.id) ?? 0) + 1);
        return ids;
      };
      const baselineIds = getIds(baselineRecords), currentIds = getIds(currentRecords);
      for (const change of context.changes) if (change.entity === 'edge'
        && (baselineIds.get(change.id) !== 1 || currentIds.get(change.id) !== 1)) {
        return { ok: false, diagnostics: [{ code: 'ambiguous-native-identity', severity: 'error', path: change.path,
          message: 'JGF generated edge identity is ambiguous after the native edge sequence changed; a unique explicit ID must exist in both sources' }] };
      }
    }
  }
  const nodes = new Map<string, any>(), edges = new Map<string, any>();
  const root = format === 'jgf' ? source.graph : source;
  if (format === 'elk') {
    const queue = [source];
    for (let i = 0; i < queue.length; i++) {
      for (const node of queue[i].children ?? []) { nodes.set(node.id, node); queue.push(node); }
      for (const edge of queue[i].edges ?? []) edges.set(edge.id, edge);
    }
  } else if (format === 'cytoscape') {
    const native = Array.isArray(source.elements) ? source.elements : [...(source.elements.nodes ?? []), ...(source.elements.edges ?? [])];
    let index = 0;
    for (const value of native) if ('source' in value.data && 'target' in value.data) { edges.set(value.data.id ?? `e${index}`, value); index++; } else nodes.set(value.data.id, value);
  } else {
    const values = root.nodes ?? [];
    if (Array.isArray(values)) for (const node of values) nodes.set(node.id, node);
    else for (const [id, node] of Object.entries(values)) nodes.set(id, node);
    (root.links ?? root.edges ?? []).forEach((edge: any, index: number) => edges.set(edge.id ?? `e${index}`, edge));
  }
  for (const key of getChanges(baselineGraph, graph)) {
    if (key === 'nodes' || key === 'edges') continue;
    if (format === 'd3' && ['id', 'mode', 'initialNodeId', 'data', 'direction', 'style'].includes(key)) updateField(root, key, graph[key]);
    else if (format === 'cytoscape' && ['id', 'mode', 'initialNodeId', 'direction', 'style'].includes(key)) { root.data ??= {}; updateField(root.data, key, graph[key]); }
    else if (format === 'cytoscape' && key === 'data' && graph.data && typeof graph.data === 'object' && !Array.isArray(graph.data)) {
      root.data ??= {};
      if (getMetadata(root.data.__statelyai, 'cytoscape.graph')) { updateField(root.data, 'graphData', graph.data); continue; }
      for (const field of getChanges(baselineGraph.data ?? {}, graph.data)) {
        if (['id', 'mode', 'initialNodeId', 'direction', 'style', '__statelyai'].includes(field)) return getFailure(`data.${field}`, 'User data collides with native graph fields');
        updateField(root.data, field, graph.data[field]);
      }
    }
    else if (format === 'jgf' && key === 'data') { const failure = updateJGFData(root, baselineGraph.data, graph.data, 'graph', 'data'); if (failure) return failure; }
    else if (format === 'elk' && key === 'direction') { root.layoutOptions ??= {}; updateField(root.layoutOptions, Object.hasOwn(root.layoutOptions, 'org.eclipse.elk.direction') ? 'org.eclipse.elk.direction' : 'elk.direction', String(graph.direction).toUpperCase()); }
    else return getFailure(key);
  }
  for (const collection of ['nodes', 'edges']) {
    for (let i = 0; i < graph[collection].length; i++) {
      const before = baselineGraph[collection][i], after = graph[collection][i];
      const native = (collection === 'nodes' ? nodes : edges).get(after.id);
      if (!native) return getFailure(`${collection}.${after.id}`, 'Native entity identity is unavailable');
      for (const key of getChanges(before, after)) {
        const path = `${collection}.${after.id}.${key}`;
        if (format === 'd3' && collection === 'nodes' && (root.links ?? []).some((link: any) => ['source', 'target'].some((endpoint) => {
          const value = link[endpoint];
          return value && typeof value === 'object' && value.id === after.id && Object.hasOwn(value, key);
        }))) return getFailure(path, 'Embedded D3 object endpoints duplicate this node field; JSON cannot prove runtime alias identity');

        if (key === 'ports' && collection === 'nodes' && ['d3', 'elk'].includes(format)) {
          if (!Array.isArray(before.ports) || !Array.isArray(after.ports) || !isJSONEqual(before.ports.map((port: any) => port.name), after.ports.map((port: any) => port.name))) return getFailure(path, 'Native port identity or order changed');
          const byName = new Map((native.ports ?? []).map((port: any) => [format === 'elk' ? port.id : port.name, port]));
          for (let p = 0; p < after.ports.length; p++) {
            const original = before.ports[p], current = after.ports[p], port: any = byName.get(current.name);
            if (!port) return getFailure(path, 'Native port identity is unavailable');
            for (const field of getChanges(original, current)) {
              if (format === 'd3' && ['label', 'data', 'style', 'x', 'y', 'width', 'height', 'direction'].includes(field)) updateField(port, field, current[field]);
              else if (format === 'elk' && ['x', 'y', 'width', 'height'].includes(field)) updateField(port, field, current[field]);
              else if (format === 'elk' && field === 'label' && typeof current.label === 'string') { if (port.labels?.[0]) updateField(port.labels[0], 'text', current.label); else port.labels = [{ text: current.label }]; }
              else return getFailure(`${path}.${current.name}.${field}`);
            }
          }
          continue;
        }
        if (['id', 'type', 'sourceId', 'targetId', 'sourcePort', 'targetPort', 'parentId', 'initialNodeId', 'ports'].includes(key)) return getFailure(path, 'Structural edits require a native document operation');
        if (format === 'd3' && ['label', 'data', 'style', 'x', 'y', 'width', 'height', 'weight', 'color', 'shape', 'mode', 'routing', 'points'].includes(key)) updateField(native, key, after[key]);
        else if (format === 'cytoscape' && ['label', 'style', 'width', 'height', 'weight', 'color', 'shape', 'mode', 'routing', 'points'].includes(key)) updateField(native.data, key, after[key]);
        else if (format === 'cytoscape' && ['x', 'y'].includes(key) && collection === 'nodes') { if (native.position) updateField(native.position, key, after[key]); else updateField(native.data, key, after[key]); }
        else if (format === 'cytoscape' && key === 'data' && after.data && typeof after.data === 'object' && !Array.isArray(after.data)) {
          const wire = getMetadata(native.data.__statelyai, `cytoscape.${collection === 'nodes' ? 'node' : 'edge'}`);
          if (wire) { updateField(native.data, collection === 'nodes' ? 'nodeData' : 'edgeData', after.data); continue; }
          for (const field of getChanges(before.data ?? {}, after.data)) { if (['id', 'parent', 'source', 'target', 'label', 'x', 'y'].includes(field)) return getFailure(path, 'User data collides with native entity fields'); updateField(native.data, field, after.data[field]); }
        } else if (format === 'jgf' && key === 'label' && typeof after.label === 'string') updateField(native, key, after.label);
        else if (format === 'jgf' && key === 'data') { const failure = updateJGFData(native, before.data, after.data, collection === 'nodes' ? 'node' : 'edge', path); if (failure) return failure; }
        else if (format === 'jgf' && key === 'mode' && ['directed', 'undirected'].includes(after.mode)) updateField(native, 'directed', after.mode === 'directed');
        else if (format === 'xyflow' && key === 'label' && typeof after.label === 'string') { if (collection === 'nodes') { native.data ??= {}; updateField(native.data, 'label', after.label); } else updateField(native, 'label', after.label); }
        else if (format === 'xyflow' && key === 'data' && after.data && typeof after.data === 'object' && !Array.isArray(after.data)) { for (const field of getChanges(before.data ?? {}, after.data)) { if (field === 'label' || field === '__statelyai') return getFailure(path, 'Renderer labels and reserved wire fields have separate mappings'); native.data ??= {}; updateField(native.data, field, after.data[field]); } }
        else if (format === 'xyflow' && ['x', 'y'].includes(key) && collection === 'nodes') updateField(native.position, key, after[key]);
        else if (format === 'xyflow' && ['width', 'height'].includes(key) && collection === 'nodes') updateField(native.measured && Object.hasOwn(native.measured, key) ? native.measured : native, key, after[key]);
        else if (format === 'elk' && ['x', 'y', 'width', 'height'].includes(key) && collection === 'nodes') updateField(native, key, after[key]);
        else if (format === 'elk' && key === 'label' && typeof after.label === 'string') { if (native.labels?.length) updateField(native.labels[0], 'text', after.label); else native.labels = [{ text: after.label }]; }
        else if (format === 'elk' && ['x', 'y', 'width', 'height'].includes(key) && collection === 'edges' && native.labels?.length) updateField(native.labels[0], key, after[key]);
        else if (format === 'elk' && key === 'points' && Array.isArray(after.points) && after.points.length >= 2) { const first = after.points[0], last = after.points.at(-1), bends = after.points.slice(1, -1); if (native.sections?.[0]) { const section = native.sections[0]; section.startPoint = { ...section.startPoint, ...first }; section.endPoint = { ...section.endPoint, ...last }; if (bends.length || Object.hasOwn(section, 'bendPoints')) section.bendPoints = bends; } else if ('source' in native) { native.sourcePoint = { ...native.sourcePoint, ...first }; native.targetPoint = { ...native.targetPoint, ...last }; native.bendPoints = bends; } else return getFailure(path, 'Native routing section identity is unavailable'); }
        else return getFailure(path);
      }
    }
  }
  return { ok: true, source };
}
