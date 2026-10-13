import type { Graph } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import {
  createGraphDocumentConverter,
  type GraphDocumentPatchContext,
} from '../document';
import {
  createNativeCarrier,
  getNativeCarrier,
  getCarrierData,
  getClonedJSON,
  getNativeDocumentGraph,
  isJSONEqual,
  type FormatImportOptions,
  type FormatExportOptions,
} from '../preservation';
import { getValidatedGraph } from '../structured-json';
export type CX2AttributeType =
  | 'string'
  | 'long'
  | 'integer'
  | 'double'
  | 'boolean'
  | 'list_of_string'
  | 'list_of_long'
  | 'list_of_integer'
  | 'list_of_double'
  | 'list_of_boolean';
export interface CX2AttributeDeclaration {
  d: CX2AttributeType;
  a?: string;
  v?: any;
  [key: string]: any;
}
export interface CX2Declarations {
  nodes?: Record<string, CX2AttributeDeclaration>;
  edges?: Record<string, CX2AttributeDeclaration>;
  networkAttributes?: Record<string, CX2AttributeDeclaration>;
  [aspect: string]: any;
}
export interface CX2Node {
  id: number;
  v?: Record<string, any>;
  x?: number;
  y?: number;
  z?: number;
  [key: string]: any;
}
export interface CX2Edge {
  id: number;
  s: number;
  t: number;
  v?: Record<string, any>;
  [key: string]: any;
}
export type CX2JSON = Array<Record<string, any>>;
export interface CX2EntityData {
  attributes?: Record<string, any>;
}
export interface CX2GraphData {
  attributes?: Record<string, any>;
  declarations?: CX2Declarations;
}
export type CX2Graph = Graph<CX2EntityData, CX2EntityData, CX2GraphData>;
export interface CX2ImportOptions extends FormatImportOptions {}
export interface CX2ExportOptions extends FormatExportOptions {}
function getJSONValue(value: any, optionalUndefined = false): void {
  const active = new Set<object>();
  const stack: Array<{ value: any; exit?: boolean; allowUndefined?: boolean }> =
    [{ value, allowUndefined: optionalUndefined }];
  while (stack.length) {
    const item = stack.pop()!,
      current = item.value;
    if (item.exit) {
      active.delete(current);
      continue;
    }
    if (current === undefined && item.allowUndefined) continue;
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    )
      continue;
    if (typeof current === 'number' && Number.isFinite(current)) continue;
    if (
      !current ||
      typeof current !== 'object' ||
      active.has(current) ||
      Object.getOwnPropertySymbols(current).length ||
      (!Array.isArray(current) &&
        Object.getPrototypeOf(current) !== Object.prototype &&
        Object.getPrototypeOf(current) !== null)
    )
      throw new Error('CX2: JSON values required');
    if (Array.isArray(current)) {
      const names = Object.getOwnPropertyNames(current);
      if (
        names.length !== current.length + 1 ||
        Object.keys(current).length !== current.length ||
        names.some(
          (name) =>
            name !== 'length' &&
            (!/^(0|[1-9]\d*)$/.test(name) || Number(name) >= current.length)
        )
      )
        throw new Error('CX2: sparse/custom arrays unsupported');
    }
    active.add(current);
    stack.push({ value: current, exit: true });
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(current)
    )) {
      if (Array.isArray(current) && name === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        throw new Error('CX2: accessors/non-JSON properties unsupported');
      stack.push({
        value: descriptor.value,
        allowUndefined: optionalUndefined && !Array.isArray(current),
      });
    }
  }
}
function getRecord(value: any, message: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`CX2: ${message} must be an object`);
  return value;
}
function getID(value: any): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  )
    throw new Error('CX2: IDs must be exact safe integers');
  return value;
}
function getTypedValue(
  value: any,
  type: CX2AttributeType,
  defaultValue = false
): any {
  if (type.startsWith('list_of_')) {
    if (!Array.isArray(value)) throw new Error('CX2: list attribute required');
    return value.map((v) =>
      getTypedValue(v, type.slice(8) as CX2AttributeType, defaultValue)
    );
  }
  if (
    (type === 'string' && typeof value === 'string') ||
    (type === 'boolean' && typeof value === 'boolean')
  )
    return value;
  if (['long', 'integer', 'double'].includes(type)) {
    let n = value;
    if (
      defaultValue &&
      typeof value === 'string' &&
      value.trim() !== '' &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
    )
      n = Number(value);
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      (type !== 'double' && !Number.isSafeInteger(n)) ||
      (type === 'integer' && (n < -2147483648 || n > 2147483647))
    )
      throw new Error('CX2: invalid/unsafe numeric attribute');
    return n;
  }
  throw new Error(`CX2: value does not match declared type ${type}`);
}
function getDeclarations(value: CX2Declarations): void {
  getRecord(value, 'attribute declarations');
  for (const [aspect, records] of Object.entries(value)) {
    getRecord(records, 'aspect declarations');
    const wire = new Set<string>();
    for (const [name, declaration] of Object.entries(records) as Array<
      [string, CX2AttributeDeclaration]
    >) {
      getRecord(declaration, 'declaration');
      if (
        ![
          'string',
          'long',
          'integer',
          'double',
          'boolean',
          'list_of_string',
          'list_of_long',
          'list_of_integer',
          'list_of_double',
          'list_of_boolean',
        ].includes(declaration.d) ||
        (name === 'id' && (aspect === 'nodes' || aspect === 'edges'))
      )
        throw new Error('CX2: invalid attribute declaration');
      if (
        declaration.a !== undefined &&
        (typeof declaration.a !== 'string' || aspect === 'networkAttributes')
      )
        throw new Error('CX2: invalid alias');
      const key = declaration.a ?? name;
      if ((aspect === 'nodes' || aspect === 'edges') && key === 'id')
        throw new Error('CX2: reserved id alias');
      if (wire.has(key)) throw new Error('CX2: colliding attribute aliases');
      wire.add(key);
      if (Object.hasOwn(declaration, 'v')) {
        if (!['nodes', 'edges'].includes(aspect))
          throw new Error('CX2: defaults require node/edge declarations');
        getTypedValue(declaration.v, declaration.d, true);
      }
      if (
        ((aspect === 'nodes' && name === 'represents') ||
          (aspect === 'networkAttributes' &&
            ['name', 'description', 'version'].includes(name))) &&
        declaration.d !== 'string'
      )
        throw new Error(
          'CX2: reserved text attribute requires string declaration'
        );
      if (
        aspect === 'nodes' &&
        name === 'alias' &&
        declaration.d !== 'list_of_string'
      )
        throw new Error(
          'CX2: node alias attribute requires list_of_string declaration'
        );
      if (
        ['nodes', 'edges'].includes(aspect) &&
        name === 'name' &&
        declaration.d !== 'string'
      )
        throw new Error('CX2: label name must be declared string');
    }
  }
}
function getAttributes(
  values: any,
  declarations: Record<string, CX2AttributeDeclaration> | undefined
): Record<string, any> {
  const attrs = values === undefined ? {} : getRecord(values, 'attributes');
  const result: Record<string, any> = Object.create(null),
    byWire = new Map<string, [string, CX2AttributeDeclaration]>();
  for (const [name, declaration] of Object.entries(declarations ?? {})) {
    byWire.set(declaration.a ?? name, [name, declaration]);
    if (Object.hasOwn(declaration, 'v'))
      Object.defineProperty(result, name, {
        value: getTypedValue(declaration.v, declaration.d, true),
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  for (const [wire, value] of Object.entries(attrs)) {
    const declared = byWire.get(wire);
    if (!declared)
      throw new Error(`CX2: undeclared/full-alias attribute ${wire}`);
    Object.defineProperty(result, declared[0], {
      value: getTypedValue(value, declared[1].d),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
function getCX2Source(source: CX2JSON) {
  getJSONValue(source);
  if (
    !Array.isArray(source) ||
    !source.length ||
    source[0]?.CXVersion !== '2.0' ||
    (source[0].hasFragments !== undefined &&
      typeof source[0].hasFragments !== 'boolean')
  )
    throw new Error('CX2: expected CXVersion 2.0 descriptor');
  const status = source.at(-1)?.status;
  if (
    !Array.isArray(status) ||
    status.length !== 1 ||
    typeof status[0]?.success !== 'boolean' ||
    status[0].success !== true
  )
    throw new Error('CX2: missing/unsuccessful final status');
  const declarations: CX2Declarations = {},
    nodes: CX2Node[] = [],
    edges: CX2Edge[] = [],
    nodeData: Record<string, any>[] = [],
    edgeData: Record<string, any>[] = [];
  let attributes: Record<string, any> = {},
    networkSeen = false,
    post = false,
    dataStarted = false;
  const seen = new Set<string>(),
    counts = new Map<string, number>();
  for (let index = 1; index < source.length - 1; index++) {
    const block = getRecord(source[index], 'aspect block'),
      keys = Object.keys(block);
    if (keys.length !== 1)
      throw new Error('CX2: aspect block requires one key');
    const aspect = keys[0],
      records = block[aspect];
    if (!Array.isArray(records))
      throw new Error('CX2: aspect records require array');
    if (aspect === 'metaData') {
      if (seen.size) post = true;
      continue;
    }
    if (post) throw new Error('CX2: aspect after post metadata');
    if (aspect === 'status')
      throw new Error('CX2: status must terminate stream');
    if (seen.has(aspect) && !source[0].hasFragments)
      throw new Error('CX2: duplicate nonfragmented aspect');
    seen.add(aspect);
    counts.set(aspect, (counts.get(aspect) ?? 0) + records.length);
    if (aspect === 'attributeDeclarations') {
      if (dataStarted)
        throw new Error('CX2: late fragmented declarations unsupported');
      for (const record of records) {
        getDeclarations(record);
        for (const [kind, defs] of Object.entries(record)) {
          const existing = Object.hasOwn(declarations, kind)
            ? declarations[kind]
            : {};
          for (const [name, definition] of Object.entries(defs as any)) {
            if (Object.hasOwn(existing, name))
              throw new Error('CX2: duplicate declaration');
            Object.defineProperty(existing, name, {
              value: definition,
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
          Object.defineProperty(declarations, kind, {
            value: existing,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        getDeclarations(declarations);
      }
      continue;
    }
    if (['nodes', 'edges', 'networkAttributes'].includes(aspect))
      dataStarted = true;
    if (aspect === 'networkAttributes') {
      if (networkSeen || records.length !== 1)
        throw new Error('CX2: single networkAttributes object required');
      networkSeen = true;
      attributes = getAttributes(records[0], declarations.networkAttributes);
      continue;
    }
    if (aspect === 'nodes' || aspect === 'edges')
      for (const record of records) {
        getRecord(record, 'entity');
        getID(record.id);
        const attrs = getAttributes(record.v, declarations[aspect]);
        if (aspect === 'nodes') {
          nodes.push(record);
          nodeData.push(attrs);
        } else {
          getID(record.s);
          getID(record.t);
          edges.push(record);
          edgeData.push(attrs);
        }
      }
  }
  const ids = new Set<number>(),
    edgeIDs = new Set<number>();
  const layout = nodes.some(
      (n) => Object.hasOwn(n, 'x') || Object.hasOwn(n, 'y')
    ),
    z = nodes.some((n) => Object.hasOwn(n, 'z'));
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error('CX2: duplicate node ID');
    ids.add(node.id);
    if (
      (layout &&
        (!Number.isFinite(node.x) ||
          typeof node.x !== 'number' ||
          !Number.isFinite(node.y) ||
          typeof node.y !== 'number')) ||
      (z && (!layout || typeof node.z !== 'number' || !Number.isFinite(node.z)))
    )
      throw new Error('CX2: incomplete/nonfinite node coordinates');
  }
  for (const edge of edges) {
    if (edgeIDs.has(edge.id) || !ids.has(edge.s) || !ids.has(edge.t))
      throw new Error('CX2: duplicate edge/dangling endpoint');
    edgeIDs.add(edge.id);
  }
  for (const block of source)
    if (Array.isArray(block.metaData))
      for (const metadata of block.metaData) {
        if (
          typeof metadata.name !== 'string' ||
          (metadata.elementCount !== undefined &&
            (!Number.isSafeInteger(metadata.elementCount) ||
              metadata.elementCount !== (counts.get(metadata.name) ?? 0)))
        )
          throw new Error('CX2: invalid metadata count');
      }
  return { declarations, nodes, edges, nodeData, edgeData, attributes };
}
export function fromCX2(
  source: CX2JSON,
  _options: CX2ImportOptions = {}
): CX2Graph {
  const parsed = getCX2Source(source);
  const graph: CX2Graph = {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    data: { attributes: parsed.attributes, declarations: parsed.declarations },
    nodes: parsed.nodes.map((node, i) => {
      const { name, ...attributes } = parsed.nodeData[i];
      return {
        type: 'node',
        id: String(node.id),
        label: name ?? null,
        parentId: null,
        initialNodeId: null,
        data: { attributes },
        ...(Object.hasOwn(node, 'x') && { x: node.x, y: node.y }),
      };
    }),
    edges: parsed.edges.map((edge, i) => {
      const { name, ...attributes } = parsed.edgeData[i];
      return {
        type: 'edge',
        id: String(edge.id),
        sourceId: String(edge.s),
        targetId: String(edge.t),
        label: name ?? null,
        mode: 'directed',
        data: { attributes },
      };
    }),
  };
  graph.data = createNativeCarrier(graph.data, 'cx2', source, graph);
  (graph.data as any).__statelyaiNative.baselineNative = getClonedJSON(source);
  return graph;
}
function getCanonicalID(id: string): number {
  const n = Number(id);
  if (String(n) !== id)
    throw new Error('CX2: canonical numeric Graph IDs required');
  getID(n);
  return n;
}
function getInferredType(value: any): CX2AttributeType {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isFinite(value))
    return Number.isInteger(value) ? 'long' : 'double';
  if (Array.isArray(value) && value.length) {
    const types = new Set(value.map(getInferredType));
    if ([...types].some((type) => type.startsWith('list_of_')))
      throw new Error('CX2: homogeneous scalar list required');
    if (types.size === 2 && types.has('long') && types.has('double'))
      return 'list_of_double';
    if (types.size !== 1)
      throw new Error('CX2: homogeneous scalar list required');
    const type = [...types][0];
    return `list_of_${type}` as CX2AttributeType;
  }
  throw new Error(
    'CX2: explicit declaration required for empty/unrepresentable attribute'
  );
}
function getFreshDeclarations(graph: CX2Graph): CX2Declarations {
  getJSONValue(graph.data?.declarations ?? {}, true);
  const declarations = getClonedJSON(graph.data?.declarations ?? {});
  for (const [aspect, records] of [
    ['networkAttributes', [graph.data?.attributes ?? {}]],
    [
      'nodes',
      graph.nodes.map((n) => ({
        ...n.data?.attributes,
        ...(n.label != null && { name: n.label }),
      })),
    ],
    [
      'edges',
      graph.edges.map((e) => ({
        ...e.data?.attributes,
        ...(e.label != null && { name: e.label }),
      })),
    ],
  ] as const) {
    const defs = declarations[aspect] ?? {};
    const inferred = new Set<string>();
    for (const attrs of records)
      for (const [key, value] of Object.entries(attrs)) {
        if (!Object.hasOwn(defs, key)) {
          inferred.add(key);
          Object.defineProperty(defs, key, {
            value: { d: getInferredType(value) },
            enumerable: true,
            writable: true,
            configurable: true,
          });
        } else if (inferred.has(key)) {
          const current = defs[key].d,
            next = getInferredType(value);
          if (
            (current === 'long' && next === 'double') ||
            (current === 'list_of_long' && next === 'list_of_double')
          )
            defs[key].d = next;
        }
        getTypedValue(value, defs[key].d);
      }
    declarations[aspect] = defs;
  }
  getDeclarations(declarations);
  return declarations;
}
function getWireAttributes(
  attrs: Record<string, any>,
  definitions: Record<string, CX2AttributeDeclaration> | undefined
): Record<string, any> {
  const values: Record<string, any> = {};
  for (const [name, value] of Object.entries(attrs)) {
    const def = definitions?.[name];
    if (!def) throw new Error('CX2: undeclared native attribute');
    getTypedValue(value, def.d);
    Object.defineProperty(values, def.a ?? name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return values;
}
function toRawCX2(graph: CX2Graph): CX2JSON {
  getValidatedGraph(graph, 'CX2');
  if (
    graph.id !== '' ||
    graph.initialNodeId != null ||
    graph.mode !== 'directed' ||
    graph.edges.some((e) => getEdgeMode(graph, e) !== 'directed')
  )
    throw new Error('CX2: unsupported identity/initial node/mode');
  function getFields(record: any, allowed: string[]) {
    if (
      Object.keys(record).some(
        (k) => record[k] !== undefined && !allowed.includes(k)
      )
    )
      throw new Error('CX2: unrepresentable Graph field');
  }
  getFields(graph, ['id', 'mode', 'initialNodeId', 'nodes', 'edges', 'data']);
  getFields(graph.data ?? {}, ['attributes', 'declarations']);
  const declarations = getFreshDeclarations(graph),
    source: CX2JSON = [
      { CXVersion: '2.0', hasFragments: false },
      { attributeDeclarations: [declarations] },
      {
        networkAttributes: [
          getWireAttributes(
            graph.data?.attributes ?? {},
            declarations.networkAttributes
          ),
        ],
      },
    ];
  source.push({
    nodes: graph.nodes.map((node) => {
      getFields(node, [
        'type',
        'id',
        'label',
        'parentId',
        'initialNodeId',
        'data',
        'x',
        'y',
      ]);
      getFields(node.data ?? {}, ['attributes']);
      if (
        node.label == null &&
        Object.hasOwn(declarations.nodes?.name ?? {}, 'v')
      )
        throw new Error('CX2: native name default cannot represent null label');
      if (
        node.parentId != null ||
        node.initialNodeId != null ||
        (node.label != null && typeof node.label !== 'string') ||
        Object.hasOwn(node.data?.attributes ?? {}, 'name')
      )
        throw new Error('CX2: unsupported hierarchy/label attribute collision');
      return {
        id: getCanonicalID(node.id),
        v: getWireAttributes(
          {
            ...node.data?.attributes,
            ...(node.label != null && { name: node.label }),
          },
          declarations.nodes
        ),
        ...(node.x !== undefined || node.y !== undefined
          ? { x: node.x, y: node.y }
          : {}),
      };
    }),
  });
  source.push(
    {
      edges: graph.edges.map((edge) => {
        getFields(edge, [
          'type',
          'id',
          'sourceId',
          'targetId',
          'label',
          'mode',
          'data',
        ]);
        getFields(edge.data ?? {}, ['attributes']);
        if (
          edge.label == null &&
          Object.hasOwn(declarations.edges?.name ?? {}, 'v')
        )
          throw new Error(
            'CX2: native name default cannot represent null label'
          );
        if (
          (edge.label != null && typeof edge.label !== 'string') ||
          Object.hasOwn(edge.data?.attributes ?? {}, 'name')
        )
          throw new Error('CX2: unsupported label attribute collision');
        return {
          id: getCanonicalID(edge.id),
          s: getCanonicalID(edge.sourceId),
          t: getCanonicalID(edge.targetId),
          v: getWireAttributes(
            {
              ...edge.data?.attributes,
              ...(edge.label != null && { name: edge.label }),
            },
            declarations.edges
          ),
        };
      }),
    },
    { status: [{ success: true }] }
  );
  getCX2Source(source);
  return source;
}
function getCX2Patch(context: GraphDocumentPatchContext<CX2JSON, CX2Graph>) {
  const source = getClonedJSON(context.source),
    parsed = getCX2Source(source),
    nodes = new Map(parsed.nodes.map((n) => [String(n.id), n])),
    edges = new Map(parsed.edges.map((e) => [String(e.id), e]));
  for (const change of context.changes) {
    if (change.entity !== 'node' && change.entity !== 'edge')
      throw new Error('CX2: only label/typed entity attributes supported');
    const kind = change.entity === 'node' ? 'nodes' : 'edges',
      record =
        change.entity === 'node'
          ? nodes.get(change.id!)
          : edges.get(change.id!);
    if (!record) throw new Error('CX2: structural edits unsupported');
    const defs = parsed.declarations[kind] ?? {};
    function updateAttribute(name: string, value: any, present: boolean) {
      const def = defs[name];
      if (!def) throw new Error('CX2: undeclared attribute edit');
      if (!present) {
        if (Object.hasOwn(def, 'v'))
          throw new Error('CX2: attribute default prevents absence/null');
        if (record!.v) delete record!.v[def.a ?? name];
        return;
      }
      getTypedValue(value, def.d);
      if (!record!.v) record!.v = {};
      Object.defineProperty(record!.v, def.a ?? name, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (change.field === 'label') {
      if (change.after !== null && typeof change.after !== 'string')
        throw new Error('CX2: unsupported label value');
      updateAttribute(
        'name',
        change.after,
        change.after !== null && change.afterPresent
      );
      continue;
    }
    if (change.field === 'data') {
      getRecord(change.after, 'entity data');
      if (Object.keys(change.after as any).some((k) => k !== 'attributes'))
        throw new Error('CX2: unsupported data key');
      const before = (change.before as CX2EntityData)?.attributes ?? {},
        after = (change.after as CX2EntityData)?.attributes ?? {};
      if (Object.hasOwn(after, 'name'))
        throw new Error('CX2: protected label attribute');
      for (const name of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ]))
        if (
          Object.hasOwn(before, name) !== Object.hasOwn(after, name) ||
          !isJSONEqual(before[name], after[name])
        )
          updateAttribute(name, after[name], Object.hasOwn(after, name));
      continue;
    }
    throw new Error('CX2: unsupported structural/geometry edit');
  }
  return { ok: true as const, source };
}
export function toCX2(
  graph: CX2Graph,
  options: CX2ExportOptions = {}
): CX2JSON {
  const carrier =
    options.nativeCarrier === false
      ? undefined
      : getNativeCarrier(graph.data, 'cx2');
  if (!carrier) return toRawCX2(graph);
  const originalSource = (
    carrier as typeof carrier & { baselineNative?: CX2JSON }
  ).baselineNative;
  if (originalSource === undefined)
    throw new Error('CX2: missing native provenance baseline');
  const document = cx2DocumentConverter.from(originalSource);
  if (!isJSONEqual(document.baseline.graph, carrier.baseline))
    throw new Error('CX2: invalid native provenance baseline');
  document.source = carrier.native;
  document.graph = { ...graph, data: getCarrierData(graph.data, 'cx2') };
  return cx2DocumentConverter.to(document);
}
export const cx2Converter = createFormatConverter(toCX2, fromCX2);
export const cx2DocumentConverter = createGraphDocumentConverter({
  format: 'cx2',
  codec: { from: fromCX2, to: toRawCX2 },
  project: (source: CX2JSON) => ({
    graph: getNativeDocumentGraph(fromCX2(source), 'cx2', source),
  }),
  patch: getCX2Patch,
});
