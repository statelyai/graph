import { inflateSync, deflateSync, strFromU8, strToU8 } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import { createFormatData } from '../xml-preservation';
import type { Graph, GraphMode } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter, type GraphDocumentPatchContext, type GraphDocumentPatchResult } from '../document';
import { createMetadata, getMetadata, getRestoredRecord, createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getValidatedGraph } from '../structured-json';
import { getXMLElements, getXMLAttribute, getDecodedXML, getEncodedXML, getEditedSource, getLabelChangeError, getUnsupported, type XMLElement, type TextEdit } from '../xml-document';

export interface DrawioImportOptions extends FormatImportOptions { pageId?: string; mode?: GraphMode | 'infer-arrows' }
export interface DrawioExportOptions extends FormatExportOptions { pageId?: string; compressed?: boolean }
export interface DrawioDocumentOptions extends DrawioImportOptions {}
const FORMAT = 'drawio';
const MAX_MODEL_BYTES = 16 * 1024 * 1024;
interface DrawioPage { source: string; elements: XMLElement[]; model: number; outer: XMLElement | null; compressed: boolean; id: string }
interface DrawioCell { id: string; cell: XMLElement; wrapper: XMLElement; attributes: Record<string, string>; user: Record<string, string>; metadataKey?: string }
function getRecord(mapped: any, metadata?: ReturnType<typeof getMetadata>): any {
  const record = getRestoredRecord(mapped, metadata);
  if (metadata && !isJSONEqual(mapped.data, metadata.mapped.data)) record.data = createFormatData(metadata.original.data, FORMAT, { native: mapped.data });
  return record;
}

function getInput(source: string, options: DrawioImportOptions) { return { source, options: getClonedJSON(options) }; }
function getAttribute(source: string, element: XMLElement, name: string): string | undefined {
  const attribute = getXMLAttribute(element, name);
  if (!attribute) return undefined;
  const raw = source.slice(attribute.start, attribute.end);
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(raw)) throw new Error('draw.io: undeclared entities are unsupported');
  const value = getDecodedXML(raw.replace(/\r\n?/g, '\n').replace(/[\t\n]/g, ' '));
  getEncodedXML(value, attribute.quote);
  return value;
}
function getAttributes(source: string, element: XMLElement) {
  return Object.fromEntries(element.attributes.map((attribute) => [attribute.name, getAttribute(source, element, attribute.name)!]));
}
function getBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const value = bytes[index] << 16 | (bytes[index + 1] ?? 0) << 8 | (bytes[index + 2] ?? 0);
    output += alphabet[value >>> 18] + alphabet[value >>> 12 & 63] + (index + 1 < bytes.length ? alphabet[value >>> 6 & 63] : '=') + (index + 2 < bytes.length ? alphabet[value & 63] : '=');
  }
  return output;
}
function getBytes(source: string): Uint8Array {
  const value = source.replace(/\s/g, '');
  if (value.length > MAX_MODEL_BYTES || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('draw.io: invalid or oversized base64 page');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const number = alphabet.indexOf(value[index]) << 18 | alphabet.indexOf(value[index + 1]) << 12 | Math.max(0, alphabet.indexOf(value[index + 2])) << 6 | Math.max(0, alphabet.indexOf(value[index + 3]));
    bytes.push(number >>> 16 & 255);
    if (value[index + 2] !== '=') bytes.push(number >>> 8 & 255);
    if (value[index + 3] !== '=') bytes.push(number & 255);
  }
  return Uint8Array.from(bytes);
}
function getInflated(source: string): string {
  // A fixed output buffer bounds decompression of untrusted native pages.
  const output = inflateSync(getBytes(source), { out: new Uint8Array(MAX_MODEL_BYTES + 1) });
  if (output.length > MAX_MODEL_BYTES) throw new Error('draw.io: inflated page exceeds 16MiB');
  const value = decodeURIComponent(strFromU8(output));
  if (value.length > MAX_MODEL_BYTES) throw new Error('draw.io: decoded page exceeds 16MiB');
  return value;
}
function getCompressed(source: string): string { return getBase64(deflateSync(strToU8(encodeURIComponent(source)))); }
function getElements(source: string): XMLElement[] {
  if (source.length > MAX_MODEL_BYTES || XMLValidator.validate(source) !== true) throw new Error('draw.io: malformed or oversized XML');
  const elements = getXMLElements(source);
  for (const element of elements) if (element.uri === '') for (const attr of element.attributes) getAttribute(source, element, attr.name);
  return elements;
}
function getPage(source: string, options: DrawioImportOptions): DrawioPage {
  const elements = getElements(source), root = elements.find((element) => element.parent === null);
  if (!root || root.uri !== '') throw new Error('draw.io: unsupported root namespace');
  if (root.name === 'mxGraphModel') return { source, elements, model: elements.indexOf(root), outer: null, compressed: false, id: options.pageId ?? '' };
  if (root.name !== 'mxfile') throw new Error('draw.io: expected mxfile or mxGraphModel');
  const pages = root.children.map((index) => elements[index]).filter((element) => element.name === 'diagram' && element.uri === '');
  if (pages.length === 0 || (pages.length > 1 && options.pageId === undefined)) throw new Error('draw.io: pageId required for a multiple-page projection');
  const selected = options.pageId === undefined ? pages : pages.filter((page) => getAttribute(source, page, 'id') === options.pageId);
  if (selected.length !== 1) throw new Error('draw.io: pageId must select exactly one page');
  const outer = selected[0], models = outer.children.filter((index) => elements[index].name === 'mxGraphModel' && elements[index].uri === '');
  const id = getAttribute(source, outer, 'id') ?? '';
  if (models.length === 1 && outer.children.length === 1) return { source, elements, model: models[0], outer, compressed: false, id };
  if (outer.children.length) throw new Error('draw.io: unsupported diagram child structure');
  const modelSource = getInflated(source.slice(outer.openEnd, outer.closeStart));
  const modelElements = getElements(modelSource), model = modelElements.findIndex((element) => element.parent === null && element.name === 'mxGraphModel' && element.uri === '');
  if (model < 0) throw new Error('draw.io: compressed page is not an mxGraphModel');
  return { source: modelSource, elements: modelElements, model, outer, compressed: true, id };
}
function getCells(page: DrawioPage): DrawioCell[] {
  const roots = page.elements[page.model].children.filter((index) => page.elements[index].name === 'root' && page.elements[index].uri === '');
  if (roots.length !== 1) throw new Error('draw.io: expected one model root');
  const cells: DrawioCell[] = [], ids = new Set<string>();
  for (const index of page.elements[roots[0]].children) {
    const wrapper = page.elements[index];
    if (wrapper.uri !== '') continue;
    let cell = wrapper;
    if (wrapper.name === 'UserObject' || wrapper.name === 'object') {
      const matches = wrapper.children.filter((child) => page.elements[child].name === 'mxCell' && page.elements[child].uri === '');
      if (matches.length !== 1) throw new Error('draw.io: ambiguous UserObject cell');
      cell = page.elements[matches[0]];
    } else if (wrapper.name !== 'mxCell') continue;
    const attributes = getAttributes(page.source, cell), user = wrapper === cell ? {} : getAttributes(page.source, wrapper);
    const id = user.id ?? attributes.id;
    if (id === undefined || ids.has(id) || (user.id !== undefined && attributes.id !== undefined && user.id !== attributes.id)) throw new Error('draw.io: duplicate or missing cell identity');
    ids.add(id); cells.push({ id, cell, wrapper, attributes, user });
  }
  if (!ids.has('0') || !ids.has('1')) throw new Error('draw.io: reserved structural cells 0 and 1 are required');
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const completed = new Set<string>();
  for (const cell of cells) {
    const visiting = new Set<string>(); let current: DrawioCell | undefined = cell;
    while (current && !completed.has(current.id)) {
      if (visiting.has(current.id)) throw new Error('draw.io: cyclic parent references');
      visiting.add(current.id);
      const parent: string | undefined = current.attributes.parent;
      if (parent !== undefined && !byId.has(parent)) throw new Error('draw.io: missing parent reference');
      current = parent === undefined ? undefined : byId.get(parent);
    }
    for (const id of visiting) completed.add(id);
  }
  return cells;
}
function getStyle(value = ''): Record<string, string> {
  const style: Record<string, string> = Object.create(null);
  for (const part of value.split(';').filter(Boolean)) { const equals = part.indexOf('='); Object.defineProperty(style, equals < 0 ? part : part.slice(0, equals), { value: equals < 0 ? '1' : part.slice(equals + 1), enumerable: true, writable: true }); }
  return style;
}
function getNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('draw.io: nonfinite native geometry');
  return number;
}
function getWire(cell: DrawioCell, kind: string, native: boolean) {
  if (native) return undefined;
  for (const [key, value] of Object.entries(cell.user)) if (/^stately(?:\d+)?$/.test(key)) {
    try { const metadata = getMetadata(JSON.parse(value), `${FORMAT}.${kind}`); if (metadata) { cell.metadataKey = key; return metadata; } } catch { /* Opaque custom attributes. */ }
  }
  return undefined;
}
function getMappedData(cell: DrawioCell) {
  const attrs = Object.fromEntries(Object.entries(cell.attributes).filter(([key]) => !['id', 'value', 'parent', 'source', 'target', 'vertex', 'edge', 'style'].includes(key)));
  const user = Object.fromEntries(Object.entries(cell.user).filter(([key]) => !['id', 'label', cell.metadataKey].includes(key)));
  return { attributes: attrs, user };
}
function getMode(style: Record<string, string>): GraphMode {
  const start = style.startArrow !== undefined && style.startArrow !== 'none', end = (style.endArrow ?? 'classic') !== 'none';
  return start && end ? 'bidirectional' : !start && !end ? 'undirected' : 'directed';
}

/** Selected-page projection; arrowheads remain decorative unless inference is explicitly requested. */
export function fromDrawio(source: string, options: DrawioImportOptions = {}): Graph {
  const page = getPage(source, options), cells = getCells(page), byId = new Map(cells.map((cell) => [cell.id, cell]));
  const nodeCells = cells.filter((cell) => cell.attributes.vertex === '1'), edgeCells = cells.filter((cell) => cell.attributes.edge === '1');
  if (nodeCells.some((cell) => cell.attributes.edge === '1')) throw new Error('draw.io: a cell cannot be both vertex and edge');
  const nodeIDs = new Set(nodeCells.map((cell) => cell.id));
  const native = options.metadata === 'native', mode = options.mode === undefined || options.mode === 'infer-arrows' ? 'directed' : options.mode;
  const records = new Map<string, any>();
  const nodes = nodeCells.map((cell) => {
    const metadata = getWire(cell, 'node', native), style = getStyle(cell.attributes.style);
    const geometryIndex = cell.cell.children.find((index) => page.elements[index].name === 'mxGeometry' && page.elements[index].uri === '');
    const geometry = geometryIndex === undefined ? {} : getAttributes(page.source, page.elements[geometryIndex]);
    const mapped: any = { type: 'node', id: cell.id, parentId: nodeIDs.has(cell.attributes.parent) ? cell.attributes.parent : null, initialNodeId: null,
      label: cell.user.label ?? cell.attributes.value ?? null, data: getMappedData(cell), style,
      ...(style.fillColor !== undefined && { color: style.fillColor }), ...(style.shape !== undefined && { shape: style.shape }) };
    for (const field of ['x', 'y', 'width', 'height']) if (geometry[field] !== undefined && (!(field === 'x' || field === 'y') || geometry.relative !== '1')) mapped[field] = getNumber(geometry[field]);
    if (geometry.relative === '1') mapped.data.relativeGeometry = geometry;
    const node = getRecord(mapped, metadata); records.set(cell.id, node); return node;
  });
  for (const cell of nodeCells) if (records.has(cell.attributes.parent)) records.get(cell.id).parentId = records.get(cell.attributes.parent).id;
  const edges = edgeCells.map((cell) => {
    const metadata = getWire(cell, 'edge', native), style = getStyle(cell.attributes.style);
    let sourceId = records.get(cell.attributes.source)?.id, targetId = records.get(cell.attributes.target)?.id;
    if (sourceId === undefined || targetId === undefined) throw new Error('draw.io: dangling or non-vertex edge terminals have no binary projection');
    const edgeMode = options.mode === 'infer-arrows' ? getMode(style) : mode;
    if (options.mode === 'infer-arrows' && style.startArrow !== undefined && style.startArrow !== 'none' && style.endArrow === 'none') [sourceId, targetId] = [targetId, sourceId];
    const mapped: any = { type: 'edge', id: cell.id, sourceId, targetId, mode: edgeMode, label: cell.user.label ?? cell.attributes.value ?? null, data: getMappedData(cell), style,
      ...(style.strokeColor !== undefined && { color: style.strokeColor }) };
    const geometryIndex = cell.cell.children.find((index) => page.elements[index].name === 'mxGeometry' && page.elements[index].uri === '');
    if (geometryIndex !== undefined) {
      const geometry = page.elements[geometryIndex];
      mapped.data.labelGeometry = getAttributes(page.source, geometry);
      const arrays = geometry.children.filter((index) => page.elements[index].name === 'Array' && getAttribute(page.source, page.elements[index], 'as') === 'points');
      if (arrays.length > 1) throw new Error('draw.io: ambiguous waypoint arrays');
      if (arrays.length) mapped.points = page.elements[arrays[0]].children.map((index) => { const point = page.elements[index]; if (point.name !== 'mxPoint' || point.uri !== '') throw new Error('draw.io: unsupported waypoint'); return { x: getNumber(getAttribute(page.source, point, 'x')) ?? 0, y: getNumber(getAttribute(page.source, point, 'y')) ?? 0 }; });
    }
    return getRecord(mapped, metadata);
  });
  const rootCell = byId.get('0')!, rootMetadata = getWire(rootCell, 'graph', native);
  const root = getRecord({ id: page.id, mode, initialNodeId: null, data: getMappedData(rootCell) }, rootMetadata);
  const graph: Graph = { ...root, nodes, edges };
  getValidatedGraph(graph, FORMAT); graph.data = createNativeCarrier(graph.data, FORMAT, getInput(source, options), graph);
  return graph;
}
function getStyleString(entity: any, edge: boolean, graph: Graph): string {
  const style = { ...(entity.style ?? {}), html: 0 };
  if (entity.color !== undefined) style[edge ? 'strokeColor' : 'fillColor'] = entity.color;
  if (!edge && entity.shape !== undefined) style.shape = entity.shape;
  if (edge) { const mode = entity.mode ?? graph.mode; style.startArrow = mode === 'bidirectional' ? 'classic' : 'none'; style.endArrow = mode === 'undirected' ? 'none' : 'classic'; }
  return Object.entries(style).map(([key, value]) => {
    if (/[;=]/.test(key) || /;/.test(String(value))) throw new Error('draw.io: native style keys/values cannot contain separators');
    return `${key}=${typeof value === 'boolean' ? Number(value) : value};`;
  }).join('');
}
function getAttributeText(attributes: Record<string, any>): string {
  return Object.entries(attributes).filter(([, value]) => value !== undefined).map(([key, value]) => ` ${key}="${getEncodedXML(String(value), '"')}"`).join('');
}
function toRawDrawio(graph: Graph, options: DrawioExportOptions): string {
  getValidatedGraph(graph, FORMAT);
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
  const root: any = { id: '0' }, { nodes: _nodes, edges: _edges, ...rootEntity } = graph;
  const cells: Array<{ kind: 'graph' | 'node' | 'edge'; entity: any; wire: string }> = [{ kind: 'graph', entity: rootEntity, wire: '<mxCell id="0"/>' }];
  for (const node of graph.nodes) {
    if (node.parentId != null && !ids.has(node.parentId)) throw new Error('draw.io: missing parent');
    const geometry: Record<string, any> = { as: 'geometry' };
    for (const key of ['x', 'y', 'width', 'height']) if ((node as any)[key] !== undefined) { const value = (node as any)[key]; if (!Number.isFinite(value)) throw new Error('draw.io: nonfinite Graph geometry'); geometry[key] = value; }
    cells.push({ kind: 'node', entity: node, wire: `<UserObject${getAttributeText({ id: ids.get(node.id), label: node.label ?? undefined })}><mxCell${getAttributeText({ vertex: 1, parent: node.parentId == null ? '1' : ids.get(node.parentId), style: getStyleString(node, false, graph) })}><mxGeometry${getAttributeText(geometry)}/></mxCell></UserObject>` });
  }
  graph.edges.forEach((edge, index) => {
    const points = edge.points?.map((point) => { if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('draw.io: nonfinite waypoint'); return `<mxPoint${getAttributeText(point)}/>`; }).join('');
    cells.push({ kind: 'edge', entity: edge, wire: `<UserObject${getAttributeText({ id: `e${index}`, label: edge.label ?? undefined })}><mxCell${getAttributeText({ edge: 1, parent: '1', source: ids.get(edge.sourceId), target: ids.get(edge.targetId), style: getStyleString(edge, true, graph) })}><mxGeometry relative="1" as="geometry">${points === undefined ? '' : `<Array as="points">${points}</Array>`}</mxGeometry></mxCell></UserObject>` });
  });
  const pageId = options.pageId ?? 'stately', model = `<mxGraphModel><root>${cells[0].wire}<mxCell id="1" parent="0"/>${cells.slice(1).map((cell) => cell.wire).join('')}</root></mxGraphModel>`;
  const mapped = fromDrawio(model, { metadata: 'native' });
  const mappedRoot = { ...mapped }; delete (mappedRoot as any).nodes; delete (mappedRoot as any).edges; mappedRoot.data = getCarrierData(mapped.data, FORMAT);
  mappedRoot.id = pageId;
  const rootWire = `<UserObject${getAttributeText({ ...root, stately: JSON.stringify(createMetadata(`${FORMAT}.graph`, rootEntity, mappedRoot)) })}><mxCell/></UserObject>`;
  let nodeIndex = 0, edgeIndex = 0;
  const wires = cells.slice(1).map((cell) => {
    const before = cell.kind === 'node' ? mapped.nodes[nodeIndex++] : mapped.edges[edgeIndex++];
    const encoded = getEncodedXML(JSON.stringify(createMetadata(`${FORMAT}.${cell.kind}`, cell.entity, before)), '"');
    return cell.wire.replace('<UserObject', `<UserObject stately="${encoded}"`);
  });
  const result = `<mxGraphModel><root>${rootWire}<mxCell id="1" parent="0"/>${wires.join('')}</root></mxGraphModel>`;
  return `<mxfile compressed="${options.compressed ? 'true' : 'false'}"><diagram${getAttributeText({ id: pageId, name: 'Graph' })}>${options.compressed ? getCompressed(result) : result}</diagram></mxfile>`;
}
function getPageOutput(outerSource: string, page: DrawioPage, inner: string): string {
  if (!page.outer) return inner;
  if (page.compressed) return getEditedSource(outerSource, [{ start: page.outer.openEnd, end: page.outer.closeStart, text: getCompressed(inner) }]);
  return inner; // Uncompressed span positions already address the complete source.
}
function getDrawioPatch(context: GraphDocumentPatchContext<string>, options: DrawioImportOptions): GraphDocumentPatchResult<string> {
  const invalid = getLabelChangeError(context.changes); if (invalid) return invalid;
  const page = getPage(context.source, options), cells = getCells(page), imported = fromDrawio(context.source, options);
  const nodeCells = cells.filter((cell) => cell.attributes.vertex === '1'), edgeCells = cells.filter((cell) => cell.attributes.edge === '1');
  const importedNodes = new Map(imported.nodes.map((node, index) => [node.id, nodeCells[index]]));
  const importedEdges = new Map(imported.edges.map((edge, index) => [edge.id, edgeCells[index]]));
  const edits: TextEdit[] = [];
  for (const change of context.changes) {
    const cell = (change.entity === 'node' ? importedNodes : importedEdges).get(change.id!);
    if (!cell) return getUnsupported(change, 'draw.io: explicit unique cell identity required');
    const style = getStyle(cell.attributes.style);
    if (style.html === '1' || cell.user.placeholders === '1' || cell.attributes.placeholders === '1') return getUnsupported(change, 'draw.io: HTML/placeholder label edits are ambiguous');
    const target = cell.wrapper === cell.cell ? cell.cell : cell.wrapper, name = cell.wrapper === cell.cell ? 'value' : 'label';
    const attribute = getXMLAttribute(target, name), value = getEncodedXML(change.after as string, attribute?.quote ?? '"');
    edits.push(attribute ? { start: attribute.start, end: attribute.end, text: value } : { start: target.openEnd - (target.empty ? 2 : 1), end: target.openEnd - (target.empty ? 2 : 1), text: ` ${name}="${value}"` });
  }
  return { ok: true, source: getPageOutput(context.source, page, getEditedSource(page.source, edits)) };
}
/** Fresh XML uses collision-safe structural IDs; imported sources support safe labels only. */
export function toDrawio(graph: Graph, options: DrawioExportOptions = {}): string {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, FORMAT);
  if (!carrier) return toRawDrawio(graph, options);
  const current = { ...graph, data: getCarrierData(graph.data, FORMAT) }, native = carrier.native as ReturnType<typeof getInput>;
  const document = createDrawioDocumentConverter(native.options).from(native.source);
  document.graph = current;
  return createDrawioDocumentConverter(native.options).to(document);
}
export function createDrawioDocumentConverter(options: DrawioDocumentOptions = {}) {
  return createGraphDocumentConverter({ format: FORMAT, codec: { from: (source: string) => fromDrawio(source, options), to: (graph: Graph) => toDrawio(graph, { nativeCarrier: false }) },
    project: (source: string) => ({ graph: getNativeDocumentGraph(fromDrawio(source, options), FORMAT, getInput(source, options)), diagnostics: [{ code: 'projection-partial' as const, severity: 'warning' as const, message: 'Selected draw.io page projection; layers, native HTML and relative edge-label geometry remain source state' }] }),
    patch: (context) => getDrawioPatch(context, options) });
}
export const drawioConverter = createFormatConverter(toDrawio, fromDrawio);
export const drawioDocumentConverter = createDrawioDocumentConverter();
