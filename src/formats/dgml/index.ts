import { XMLValidator } from 'fast-xml-parser';
import type { Graph, GraphNode, GraphEdge } from '../../types';
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
  getNativeDocumentGraph,
  isJSONEqual,
  type FormatImportOptions,
  type FormatExportOptions,
} from '../preservation';
import { getValidatedGraph } from '../structured-json';
import {
  getXMLElements,
  getDecodedXML,
  getXMLAttribute,
  getEncodedXML,
  getEditedSource,
  type XMLElement,
  type TextEdit,
} from '../xml-document';
import { getValidatedXMLValue } from '../xml-standard';
export interface DGMLNodeData {
  attributes?: Record<string, string>;
  categories?: string[];
  properties?: Record<string, string | number | boolean>;
  group?: 'Expanded' | 'Collapsed';
  declared?: boolean;
}
export interface DGMLEdgeData {
  attributes?: Record<string, string>;
  categories?: string[];
  properties?: Record<string, string | number | boolean>;
}
export interface DGMLGraphData {
  attributes?: Record<string, string>;
  categories?: Array<Record<string, string>>;
  properties?: Array<Record<string, string>>;
}
export type DGMLGraph = Graph<DGMLNodeData, DGMLEdgeData, DGMLGraphData>;
export interface DGMLImportOptions extends FormatImportOptions {}
export interface DGMLExportOptions extends FormatExportOptions {
  edgeIds?: 'positional';
}
const NS = 'http://schemas.microsoft.com/vs/2009/dgml';
function getAttributes(element: XMLElement): Record<string, string> {
  return Object.fromEntries(
    element.attributes
      .filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
      .map((a) => [a.name, a.value])
  );
}
function getDGMLSource(source: string) {
  getValidatedXMLValue(source);
  if (XMLValidator.validate(source) !== true || /<!DOCTYPE/i.test(source))
    throw new Error('DGML: malformed XML or unsupported DOCTYPE');
  const elements = getXMLElements(source),
    roots = elements.filter((e) => e.parent === null);
  if (
    roots.length !== 1 ||
    roots[0].local !== 'DirectedGraph' ||
    roots[0].uri !== NS
  )
    throw new Error('DGML: expected namespaced DirectedGraph');
  for (const element of elements)
    for (const attribute of element.attributes) {
      const raw = source.slice(attribute.start, attribute.end);
      if (/&(?!(?:amp|lt|gt|quot|apos);|#\d+;|#x[0-9a-fA-F]+;)/.test(raw))
        throw new Error('DGML: undeclared XML entity');
      for (const match of raw.matchAll(/&#(x[0-9a-f]+|\d+);/gi)) {
        const code = Number.parseInt(
          match[1].startsWith('x') ? match[1].slice(1) : match[1],
          match[1].startsWith('x') ? 16 : 10
        );
        if (!Number.isSafeInteger(code) || code > 0x10ffff)
          throw new Error('DGML: invalid XML character reference');
        getValidatedXMLValue(String.fromCodePoint(code));
      }
      attribute.value = getDecodedXML(raw.replace(/\r\n|[\r\n\t]/g, ' '));
      getValidatedXMLValue(attribute.value);
    }
  const root = roots[0],
    rootIndex = elements.indexOf(root);
  const sections = new Map<string, XMLElement>();
  for (const index of root.children) {
    const e = elements[index];
    if (e.uri !== NS) continue;
    if (sections.has(e.local)) throw new Error('DGML: duplicate section');
    sections.set(e.local, e);
  }
  function getRecords(section: string, local: string) {
    return (sections.get(section)?.children ?? [])
      .map((i) => elements[i])
      .filter((e) => e.uri === NS && e.local === local);
  }
  const categories = getRecords('Categories', 'Category').map(getAttributes),
    properties = getRecords('Properties', 'Property').map(getAttributes);
  for (const [records, kind] of [
    [categories, 'category'],
    [properties, 'property'],
  ] as const) {
    const ids = new Set<string>();
    for (const record of records) {
      if (typeof record.Id !== 'string' || ids.has(record.Id))
        throw new Error(`DGML: duplicate/missing ${kind} ID`);
      ids.add(record.Id);
    }
  }
  const definitions = new Map(properties.map((p) => [p.Id, p.DataType]));
  const nodeRecords = getRecords('Nodes', 'Node'),
    linkRecords = getRecords('Links', 'Link');
  return {
    root,
    rootIndex,
    elements,
    nodeRecords,
    linkRecords,
    categories,
    properties,
    definitions,
  };
}
function getProperty(
  value: string,
  type: string | undefined
): string | number | boolean {
  if (type === 'System.String') return value;
  if (type === 'System.Boolean' && /^(true|false)$/i.test(value))
    return value.toLowerCase() === 'true';
  if (type === 'System.Int32' || type === 'System.Int64') {
    if (!/^[+-]?\d+$/.test(value))
      throw new Error('DGML: invalid integer property');
    const exact = BigInt(value);
    if (
      exact <
        (type === 'System.Int32' ? -2147483648n : -9223372036854775808n) ||
      exact > (type === 'System.Int32' ? 2147483647n : 9223372036854775807n)
    )
      throw new Error('DGML: integer property outside CLR range');
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value;
  }
  if (
    type === 'System.Double' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  throw new Error(`DGML: unsupported/invalid property type ${type}`);
}
function getData(
  element: XMLElement,
  elements: XMLElement[],
  definitions: Map<string, string | undefined>,
  node: boolean
): DGMLNodeData {
  const attributes = getAttributes(element),
    categories: string[] = [];
  if (Object.hasOwn(attributes, 'Category'))
    categories.push(attributes.Category);
  for (const i of element.children) {
    const child = elements[i];
    if (child.uri === NS && child.local === 'Category') {
      const ref = getXMLAttribute(child, 'Ref')?.value;
      if (ref === undefined)
        throw new Error('DGML: category reference missing');
      categories.push(ref);
    }
  }
  const properties: Record<string, string | number | boolean> =
    Object.create(null);
  for (const [id, type] of definitions)
    if (
      !['Id', 'Label', 'Source', 'Target', 'Category', 'Group'].includes(id) &&
      Object.hasOwn(attributes, id)
    ) {
      Object.defineProperty(properties, id, {
        value: getProperty(attributes[id], type),
        enumerable: true,
        writable: true,
        configurable: true,
      });
      delete attributes[id];
    }
  for (const key of [
    'Id',
    'Label',
    'Source',
    'Target',
    'Category',
    ...(node ? ['Group'] : []),
  ])
    delete attributes[key];
  const group = node ? getXMLAttribute(element, 'Group')?.value : undefined;
  if (group !== undefined && !['Expanded', 'Collapsed'].includes(group))
    throw new Error('DGML: invalid Group value');
  return {
    attributes,
    categories,
    properties,
    ...(node && { declared: true }),
    ...(group !== undefined && { group: group as DGMLNodeData['group'] }),
  };
}
export function fromDGML(
  source: string,
  _options: DGMLImportOptions = {}
): DGMLGraph {
  const parsed = getDGMLSource(source);
  const nodes: GraphNode<DGMLNodeData>[] = [],
    edges: GraphEdge<DGMLEdgeData>[] = [],
    nodeMap = new Map<string, GraphNode<DGMLNodeData>>();
  function addNativeNode(id: string, element?: XMLElement) {
    if (nodeMap.has(id)) {
      if (element) throw new Error('DGML: duplicate node ID');
      return;
    }
    const node: GraphNode<DGMLNodeData> = {
      type: 'node',
      id,
      label: element ? getXMLAttribute(element, 'Label')?.value ?? id : id,
      parentId: null,
      initialNodeId: null,
      data: element
        ? getData(element, parsed.elements, parsed.definitions, true)
        : { attributes: {}, categories: [], properties: {}, declared: false },
    };
    nodeMap.set(id, node);
    nodes.push(node);
  }
  for (const element of parsed.nodeRecords) {
    const id = getXMLAttribute(element, 'Id')?.value;
    if (id === undefined) throw new Error('DGML: missing node ID');
    addNativeNode(id, element);
  }
  for (const [index, element] of parsed.linkRecords.entries()) {
    const sourceId = getXMLAttribute(element, 'Source')?.value,
      targetId = getXMLAttribute(element, 'Target')?.value;
    if (sourceId === undefined || targetId === undefined)
      throw new Error('DGML: missing link endpoint');
    addNativeNode(sourceId);
    addNativeNode(targetId);
    const data = getData(element, parsed.elements, parsed.definitions, false);
    if (data.categories?.includes('Contains')) {
      const child = nodeMap.get(targetId)!;
      if (child.parentId !== null)
        throw new Error('DGML: multiple containment parents');
      child.parentId = sourceId;
    } else
      edges.push({
        type: 'edge',
        id: `dgml_link_${index}`,
        sourceId,
        targetId,
        label: getXMLAttribute(element, 'Label')?.value ?? null,
        mode: 'directed',
        data,
      });
  }
  const complete = new Set<string>();
  for (const node of nodes) {
    const visiting = new Set<string>();
    let current: GraphNode<DGMLNodeData> | undefined = node;
    while (current && !complete.has(current.id)) {
      if (visiting.has(current.id)) throw new Error('DGML: cyclic containment');
      visiting.add(current.id);
      current =
        current.parentId == null ? undefined : nodeMap.get(current.parentId);
    }
    for (const id of visiting) complete.add(id);
  }
  const graph: DGMLGraph = {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes,
    edges,
    data: {
      attributes: getAttributes(parsed.root),
      categories: parsed.categories,
      properties: parsed.properties,
    },
  };
  graph.data = createNativeCarrier(graph.data, 'dgml', source, graph);
  (graph.data as any).__statelyaiNative.baselineNative = source;
  return graph;
}
function getPropertyText(value: any, type: string | undefined): string {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  )
    throw new Error('DGML: unsupported property value');
  const text = String(value);
  if (!isJSONEqual(getProperty(text, type), value))
    throw new Error('DGML: property edit changes declared type');
  return text;
}
function getRecordText(
  name: string,
  attrs: Record<string, string>,
  children = ''
): string {
  return `<${name}${Object.entries(attrs)
    .map(([k, v]) => {
      if (
        typeof v !== 'string' ||
        !/^[A-Za-z_][\w.:-]*$/.test(k) ||
        k.includes(':') ||
        k === 'xmlns'
      )
        throw new Error('DGML: invalid native attribute name');
      return ` ${k}="${getEncodedXML(v, '"')}"`;
    })
    .join('')}${children ? `>${children}</${name}>` : '/>'}`;
}
function getEntityAttributes(
  data: DGMLNodeData | undefined,
  definitions: Map<string, string | undefined>,
  node = false
): Record<string, string> {
  if (
    data &&
    Object.keys(data).some(
      (key) =>
        ![
          'attributes',
          'categories',
          'properties',
          ...(node ? ['group', 'declared'] : []),
        ].includes(key)
    )
  )
    throw new Error('DGML: unrepresentable data key');
  const result = { ...(data?.attributes ?? {}) };
  for (const [key, value] of Object.entries(result))
    if (
      typeof value !== 'string' ||
      ['Id', 'Label', 'Source', 'Target', 'Category', 'Group'].includes(key) ||
      definitions.has(key)
    )
      throw new Error('DGML: protected/nonstring native attribute');
  for (const [key, value] of Object.entries(data?.properties ?? {})) {
    if (['Id', 'Label', 'Source', 'Target', 'Category', 'Group'].includes(key))
      throw new Error('DGML: protected structural property');
    if (!definitions.has(key)) throw new Error('DGML: undeclared property');
    Object.defineProperty(result, key, {
      value: getPropertyText(value, definitions.get(key)),
      enumerable: true,
    });
  }
  return result;
}
function toRawDGML(graph: DGMLGraph, options: DGMLExportOptions = {}): string {
  getValidatedGraph(graph, 'DGML');
  if (
    graph.mode !== 'directed' ||
    graph.edges.some((e) => getEdgeMode(graph, e) !== 'directed')
  )
    throw new Error('DGML: directed graphs required');
  if (graph.id !== '' || graph.initialNodeId != null)
    throw new Error('DGML: unsupported Graph root identity/initial node');
  const data = graph.data ?? {};
  if (
    Object.keys(data).some(
      (key) => !['attributes', 'categories', 'properties'].includes(key)
    )
  )
    throw new Error('DGML: unrepresentable root data key');
  if (Object.hasOwn(data.attributes ?? {}, 'Id'))
    throw new Error('DGML: protected root Id');
  const definitions = new Map(
    (data.properties ?? []).map((p) => [p.Id, p.DataType])
  );
  const containmentCount = graph.nodes.filter((n) => n.parentId != null).length;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    parents = new Set(
      graph.nodes.flatMap((n) => (n.parentId == null ? [] : [n.parentId]))
    );
  const lines = [
    `${getRecordText('DirectedGraph', data.attributes ?? {}).slice(
      0,
      -2
    )} xmlns="${NS}">`,
    '<Nodes>',
  ];
  function getCategories(values: string[] | undefined) {
    return (values ?? [])
      .map((Ref) => getRecordText('Category', { Ref }))
      .join('');
  }
  function getSupportedFields(record: any, allowed: string[]) {
    if (
      Object.keys(record).some(
        (k) => !allowed.includes(k) && record[k] !== undefined
      )
    )
      throw new Error('DGML: unrepresentable Graph field');
  }
  getSupportedFields(graph, [
    'id',
    'mode',
    'initialNodeId',
    'data',
    'nodes',
    'edges',
  ]);
  for (const node of graph.nodes) {
    getSupportedFields(node, [
      'type',
      'id',
      'label',
      'parentId',
      'initialNodeId',
      'data',
    ]);
    if (node.data?.declared === false)
      throw new Error(
        'DGML: fresh export cannot retain implicit declaration provenance'
      );
    if (node.initialNodeId != null || typeof node.label !== 'string')
      throw new Error('DGML: string label/empty initial node required');
    if (node.parentId != null && !nodes.has(node.parentId))
      throw new Error('DGML: missing parent');
    const attrs = getEntityAttributes(node.data, definitions, true);
    attrs.Id = node.id;
    attrs.Label = node.label;
    if (node.data?.group) attrs.Group = node.data.group;
    else if (parents.has(node.id)) attrs.Group = 'Expanded';
    lines.push(
      getRecordText('Node', attrs, getCategories(node.data?.categories))
    );
  }
  lines.push('</Nodes>', '<Links>');
  for (const node of graph.nodes)
    if (node.parentId != null)
      lines.push(
        getRecordText('Link', {
          Source: node.parentId,
          Target: node.id,
          Category: 'Contains',
        })
      );
  for (const [index, edge] of graph.edges.entries()) {
    if (
      options.edgeIds !== 'positional' &&
      edge.id !== `dgml_link_${containmentCount + index}`
    )
      throw new Error(
        'DGML: native links have positional IDs; explicit edgeIds: positional required'
      );
    getSupportedFields(edge, [
      'type',
      'id',
      'sourceId',
      'targetId',
      'label',
      'mode',
      'data',
    ]);
    if (edge.data?.categories?.includes('Contains'))
      throw new Error('DGML: ordinary edge cannot use Contains category');
    const attrs = getEntityAttributes(edge.data, definitions);
    attrs.Source = edge.sourceId;
    attrs.Target = edge.targetId;
    if (edge.label != null) attrs.Label = edge.label;
    lines.push(
      getRecordText('Link', attrs, getCategories(edge.data?.categories))
    );
  }
  lines.push('</Links>');
  for (const [section, record, values] of [
    ['Categories', 'Category', data.categories ?? []],
    ['Properties', 'Property', data.properties ?? []],
  ] as const)
    if (values.length)
      lines.push(
        `<${section}>${values
          .map((v) => getRecordText(record, v))
          .join('')}</${section}>`
      );
  lines.push('</DirectedGraph>');
  const result = lines.join('\n');
  fromDGML(result);
  return result;
}
function getDGMLPatch(context: GraphDocumentPatchContext<string, DGMLGraph>) {
  const parsed = getDGMLSource(context.source),
    nodes = new Map(
      parsed.nodeRecords.map((e) => [getXMLAttribute(e, 'Id')?.value, e])
    );
  const links = new Map(
    parsed.linkRecords.map((e, i) => [`dgml_link_${i}`, e])
  );
  const edits: TextEdit[] = [];
  if (context.changes.some((change) => change.entity === 'edge')) {
    const baseline = getDGMLSource(context.baselineSource);
    const originalLinks = baseline.linkRecords.map((element) =>
      context.baselineSource.slice(element.start, element.end)
    );
    const currentLinks = parsed.linkRecords.map((element) =>
      context.source.slice(element.start, element.end)
    );
    if (!isJSONEqual(originalLinks, currentLinks))
      throw new Error(
        'DGML: positional Link sequence changed; edge patch is ambiguous'
      );
  }
  function addAttribute(element: XMLElement, name: string, value: string) {
    const attr = getXMLAttribute(element, name);
    if (attr)
      edits.push({
        start: attr.start,
        end: attr.end,
        text: getEncodedXML(value, attr.quote),
      });
    else {
      const at = element.openEnd - (element.empty ? 2 : 1);
      edits.push({
        start: at,
        end: at,
        text: ` ${name}="${getEncodedXML(value, '"')}"`,
      });
    }
  }
  for (const change of context.changes) {
    if (change.entity !== 'node' && change.entity !== 'edge')
      throw new Error(
        'DGML: only declared entity label/property edits supported'
      );
    const element =
      change.entity === 'node' ? nodes.get(change.id) : links.get(change.id!);
    if (!element)
      throw new Error('DGML: implicit node/structural edits unsupported');
    if (change.field === 'label' && typeof change.after === 'string') {
      addAttribute(element, 'Label', change.after);
      continue;
    }
    if (change.field === 'data') {
      const before = change.before as DGMLNodeData,
        after = change.after as DGMLNodeData;
      if (
        !isJSONEqual(
          { ...before, properties: undefined },
          { ...after, properties: undefined }
        )
      )
        throw new Error('DGML: only typed properties in data can be edited');
      for (const key of new Set([
        ...Object.keys(before.properties ?? {}),
        ...Object.keys(after.properties ?? {}),
      ])) {
        if (isJSONEqual(before.properties?.[key], after.properties?.[key]))
          continue;
        if (
          !Object.hasOwn(after.properties ?? {}, key) ||
          !parsed.definitions.has(key)
        )
          throw new Error(
            'DGML: property deletion/undeclared property unsupported'
          );
        addAttribute(
          element,
          key,
          getPropertyText(after.properties![key], parsed.definitions.get(key))
        );
      }
      continue;
    }
    throw new Error('DGML: unsupported structural/native edit');
  }
  return { ok: true as const, source: getEditedSource(context.source, edits) };
}
export function toDGML(
  graph: DGMLGraph,
  options: DGMLExportOptions = {}
): string {
  const carrier =
    options.nativeCarrier === false
      ? undefined
      : getNativeCarrier(graph.data, 'dgml');
  if (!carrier) return toRawDGML(graph, options);
  const originalSource = (
    carrier as typeof carrier & { baselineNative?: string }
  ).baselineNative;
  if (originalSource === undefined)
    throw new Error('DGML: missing native provenance baseline');
  const document = dgmlDocumentConverter.from(originalSource);
  if (!isJSONEqual(document.baseline.graph, carrier.baseline))
    throw new Error('DGML: invalid native provenance baseline');
  document.source = carrier.native;
  document.graph = { ...graph, data: getCarrierData(graph.data, 'dgml') };
  return dgmlDocumentConverter.to(document);
}
export const dgmlConverter = createFormatConverter(toDGML, fromDGML);
export const dgmlDocumentConverter = createGraphDocumentConverter({
  format: 'dgml',
  codec: { from: fromDGML, to: toRawDGML },
  project: (source: string) => ({
    graph: getNativeDocumentGraph(fromDGML(source), 'dgml', source),
  }),
  patch: getDGMLPatch,
});
