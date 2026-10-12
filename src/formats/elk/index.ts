import type { FormatExportOptions } from '../preservation';
import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { ElkNode, ElkExtendedEdge, ElkPrimitiveEdge, ElkPort } from 'elkjs/lib/elk-api';
import type { VisualGraph, VisualNode, VisualEdge, VisualPort, VisualGraphFormatConverter, EdgeRouting } from '../../types';
import { createMetadata, createNativeCarrier, getCarrierData, getClonedJSON, getMetadata,
  getNativeCarrier, getRestoredRecord, getMergedNative, isJSONEqual, type FormatMetadata, type FormatImportOptions } from '../preservation';
export type { ElkNode, ElkExtendedEdge, ElkEdge, ElkEdgeSection, ElkLabel, ElkPort, ElkPoint, ElkShape,
  ElkGraphElement, ElkPrimitiveEdge, LayoutOptions } from 'elkjs/lib/elk-api';
export interface ELKImportOptions extends FormatImportOptions {}
/** Native ELK input also permits the legacy primitive edge representation. */
export interface ELKInputNode extends Omit<ElkNode, 'edges' | 'children'> {
  edges?: Array<ElkExtendedEdge | ElkPrimitiveEdge>;
  children?: ELKInputNode[];
}
const METADATA_KEY = 'statelyai.metadata';
const TO_DIRECTION: Record<string, string> = { down: 'DOWN', up: 'UP', right: 'RIGHT', left: 'LEFT' };
const FROM_DIRECTION: Record<string, VisualGraph['direction']> = { DOWN: 'down', UP: 'up', RIGHT: 'right', LEFT: 'left' };
function getFields(value: any, fields: string[]): any {
  return Object.fromEntries(fields.filter((key) => value && Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}
function getWire(value: { layoutOptions?: Record<string, unknown> }, kind: string, options: ELKImportOptions): { metadata?: FormatMetadata; legacy?: any; raw?: any } {
  if (options.metadata === 'native') return {};
  const encoded = value.layoutOptions?.[METADATA_KEY];
  if (typeof encoded !== 'string') return {};
  let raw: any;
  try { raw = JSON.parse(encoded); } catch { return {}; }
  const metadata = getMetadata(raw, `elk.${kind}`);
  if (metadata) return { metadata, raw };
  const legacy = !raw.kind && raw[kind] && typeof raw[kind] === 'object' && Object.keys(raw).every((key) => key === kind) ? raw[kind] : undefined;
  return { legacy, raw };
}
function addWire(value: { layoutOptions?: Record<string, any> }, kind: string, original: object, mapped: object, extra = {}): void {
  value.layoutOptions = { ...value.layoutOptions, [METADATA_KEY]: JSON.stringify({ ...createMetadata(`elk.${kind}`, original, mapped), ...extra }) };
}
function getElkRoot(root: Pick<ElkNode, 'id' | 'layoutOptions'>, preserved: any = {}): Omit<VisualGraph, 'nodes' | 'edges'> {
  const direction = String(root.layoutOptions?.['elk.direction'] ?? root.layoutOptions?.['org.eclipse.elk.direction'] ?? '').toUpperCase();
  return { id: root.id, mode: preserved.mode ?? 'directed', initialNodeId: preserved.initialNodeId ?? null,
    data: preserved.data, direction: FROM_DIRECTION[direction] ?? preserved.direction ?? 'down', ...getFields(preserved, ['style']) };
}
function getElkPort(port: ElkPort, preserved: any = {}): VisualPort {
  const side = port.layoutOptions?.['org.eclipse.elk.port.side'] ?? port.layoutOptions?.['elk.port.side'];
  return { name: preserved.name ?? port.id, direction: side === 'WEST' ? 'in' : side === 'EAST' ? 'out' : 'inout',
    ...(port.labels?.[0]?.text !== undefined && { label: port.labels[0].text }),
    data: preserved.data, x: port.x ?? 0, y: port.y ?? 0, width: port.width ?? 0, height: port.height ?? 0,
    ...getFields(preserved, ['style']) };
}
function getElkNode(node: ELKInputNode, parentId: string | null, preserved: any = {}): VisualNode {
  return { type: 'node', id: node.id, parentId, initialNodeId: preserved.initialNodeId ?? null,
    label: node.labels?.[0]?.text ?? '', data: preserved.data,
    x: node.x ?? 0, y: node.y ?? 0, width: node.width ?? 0, height: node.height ?? 0,
    ...getFields(preserved, ['shape', 'color', 'style']) };
}
function getRouting(value: any, fallback: EdgeRouting = 'orthogonal'): EdgeRouting {
  const option = String(value?.layoutOptions?.['elk.edgeRouting'] ?? value?.layoutOptions?.['org.eclipse.elk.edgeRouting'] ?? '').toUpperCase();
  return option === 'SPLINES' ? 'splines' : option === 'POLYLINE' ? 'polyline' : option === 'ORTHOGONAL' ? 'orthogonal' : fallback;
}
function getElkEdge(edge: ElkExtendedEdge | ElkPrimitiveEdge, index: number, portOwners: Map<string, { nodeId: string; portName: string }>, nodeIds: Map<string, string>, routing: EdgeRouting, preserved: any = {}, legacy = false): VisualEdge {
  const extended = edge as ElkExtendedEdge;
  const primitive = edge as ElkPrimitiveEdge;
  if (extended.sources?.length > 1 || extended.targets?.length > 1) throw new Error('ELK: hyperedge cannot be represented by Graph; import a document instead');
  const source = extended.sources ? extended.sources[0] : primitive.source;
  const target = extended.targets ? extended.targets[0] : primitive.target;
  if (typeof source !== 'string' || typeof target !== 'string') throw new Error('ELK: edge requires one source and one target');
  const sourcePort = portOwners.get(primitive.sourcePort ?? source);
  const targetPort = portOwners.get(primitive.targetPort ?? target);
  const label = edge.labels?.[0];
  const section = extended.sections?.[0];
  const start = section?.startPoint ?? primitive.sourcePoint;
  const end = section?.endPoint ?? primitive.targetPoint;
  const bends = section?.bendPoints ?? primitive.bendPoints;
  return { type: 'edge', id: edge.id ?? `e${index}`,
    sourceId: legacy && preserved.sourceId !== undefined ? preserved.sourceId : sourcePort?.nodeId ?? nodeIds.get(source) ?? source,
    targetId: legacy && preserved.targetId !== undefined ? preserved.targetId : targetPort?.nodeId ?? nodeIds.get(target) ?? target,
    label: label?.text ?? '', data: preserved.data,
    x: label?.x ?? preserved.x ?? 0, y: label?.y ?? preserved.y ?? 0,
    width: label?.width ?? preserved.width ?? 0, height: label?.height ?? preserved.height ?? 0,
    ...getFields(preserved, ['mode', 'weight', 'color', 'style', 'routing']),
    ...(start && end ? { points: [start, ...(bends ?? []), end].map((point) => ({ x: point.x, y: point.y })), routing: getRouting(edge, routing) }
      : getFields(preserved, ['points'])),
    ...(sourcePort ? { sourcePort: sourcePort.portName } : getFields(preserved, ['sourcePort'])),
    ...(targetPort ? { targetPort: targetPort.portName } : getFields(preserved, ['targetPort'])),
  };
}

/** Export unique document-wide IDs and one copy of each edge at its containing ancestor. */
export interface ELKExportOptions extends FormatExportOptions {}

export function toELK(graph: VisualGraph, options: ELKExportOptions = {}): ElkNode {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'elk');
  if (carrier) {
    const before = toRawELK(carrier.baseline);
    const after = toRawELK({ ...graph, data: getCarrierData(graph.data, 'elk') });
    const nativeNodes = new Map<string, ELKInputNode>();
    const queue: ELKInputNode[] = [carrier.native];
    for (let i = 0; i < queue.length; i++) {
      nativeNodes.set(queue[i].id, queue[i]); queue.push(...(queue[i].children ?? []));
    }
    const ports = new Map<string, string>();
    const firstSections = new Map<string, string>();
    for (const node of nativeNodes.values()) for (const edge of node.edges ?? []) {
      const id = (edge as ElkExtendedEdge).sections?.[0]?.id;
      if (id !== undefined) firstSections.set(edge.id, id);
    }
    const projected: ElkNode[] = [before];
    for (let i = 0; i < projected.length; i++) {
      const node = projected[i];
      const original = nativeNodes.get(node.id);
      for (const port of node.ports ?? []) {
        const wire = getWire(port, 'port', {}).metadata;
        const nativePort = original?.ports?.find((value) => value.id === wire?.original.name);
        if (nativePort) ports.set(port.id, nativePort.id);
      }
      projected.push(...(node.children ?? []));
    }
    for (const root of [before, after]) {
      root.id = carrier.native.id;
      const nodes: ElkNode[] = [root];
      for (let i = 0; i < nodes.length; i++) {
        for (const port of nodes[i].ports ?? []) {
          const id = ports.get(port.id);
          if (id) {
            port.id = id;
            const wire = JSON.parse(port.layoutOptions![METADATA_KEY]);
            wire.nativeId = id; port.layoutOptions![METADATA_KEY] = JSON.stringify(wire);
          }
        }
        for (const edge of nodes[i].edges ?? []) {
          if (edge.sections?.[0] && firstSections.has(edge.id)) edge.sections[0].id = firstSections.get(edge.id)!;
          edge.sources = edge.sources.map((id) => ports.get(id) ?? id);
          edge.targets = edge.targets.map((id) => ports.get(id) ?? id);
        }
        nodes.push(...(nodes[i].children ?? []));
      }
    }
    const merged = getMergedNative(carrier.native, before, after) as ELKInputNode;
    const usedIds = new Set<string>();
    const elements: any[] = [merged];
    for (let i = 0; i < elements.length; i++) {
      if (typeof elements[i].id === 'string') usedIds.add(elements[i].id);
      for (const collection of ['children', 'ports', 'edges', 'sections', 'labels']) elements.push(...(elements[i][collection] ?? []));
    }
    function createSectionId(preferred: string): string {
      let id = preferred;
      for (let suffix = 1; usedIds.has(id); suffix++) id = `${preferred}__statelyai${suffix}`;
      usedIds.add(id); return id;
    }
    const normalized: ELKInputNode[] = [merged];
    for (let i = 0; i < normalized.length; i++) {
      normalized[i].edges = normalized[i].edges?.map((edge) => {
        if ('sources' in edge) return edge;
        const { source, target, sourcePort, targetPort, sourcePoint, targetPoint, bendPoints, ...rest } = edge;
        return { ...rest, sources: [sourcePort ?? source], targets: [targetPort ?? target],
          ...(sourcePoint && targetPoint && !(rest as ElkExtendedEdge).sections && { sections: [{ id: createSectionId(`${edge.id}__section`),
            startPoint: sourcePoint, endPoint: targetPoint, ...(bendPoints && { bendPoints }) }] }) } as ElkExtendedEdge;
      });
      normalized.push(...(normalized[i].children ?? []));
    }
    return merged as ElkNode;
  }
  return toRawELK(graph);
}

function toRawELK(graph: VisualGraph): ElkNode {
  const used = new Set(graph.nodes.map((node) => node.id));
  if (used.size !== graph.nodes.length) throw new Error('ELK: duplicate node ids');
  function createId(preferred: string): string {
    let id = preferred;
    for (let suffix = 1; used.has(id); suffix++) id = `${preferred}__statelyai${suffix}`;
    used.add(id);
    return id;
  }
  const root: ElkNode = { id: createId(graph.id), layoutOptions: { 'elk.direction': TO_DIRECTION[graph.direction] ?? 'DOWN' } };
  const edgeIds = graph.edges.map((edge) => createId(edge.id));
  const nativeNodes = new Map<string, ElkNode>();
  const parentIds = new Map(graph.nodes.map((node) => [node.id, node.parentId ?? null]));
  const portIds = new Map<string, string>();
  const owners = new Map<string, { nodeId: string; portName: string }>();
  for (const node of graph.nodes) {
    const native: ElkNode = { id: node.id, ...getFields(node, ['x', 'y', 'width', 'height']),
      ...(typeof node.label === 'string' && { labels: [{ text: node.label }] }) };
    if (Object.hasOwn(node, 'ports')) native.ports = (node.ports ?? []).map((port) => {
      const id = createId(`${node.id}__${port.name}`);
      portIds.set(JSON.stringify([node.id, port.name]), id);
      owners.set(id, { nodeId: node.id, portName: port.name });
      const nativePort: ElkPort = { id, ...getFields(port, ['x', 'y', 'width', 'height']),
        ...(port.label !== undefined && { labels: [{ text: port.label }] }),
        ...(port.direction !== 'inout' && { layoutOptions: { 'org.eclipse.elk.port.side': port.direction === 'in' ? 'WEST' : 'EAST' } }) };
      addWire(nativePort, 'port', port, getElkPort(nativePort, port), { nativeId: id });
      return nativePort;
    });
    const mapped = getElkNode(native, node.parentId ?? null, node);
    if (native.ports) mapped.ports = native.ports.map((port, index) => getElkPort(port, node.ports![index]));
    addWire(native, 'node', node, mapped);
    nativeNodes.set(node.id, native);
  }
  for (const node of graph.nodes) {
    const parentId = node.parentId ?? null;
    const parent = parentId === null ? root : nativeNodes.get(parentId);
    if (!parent) throw new Error(`ELK: missing parent node ${parentId}`);
    (parent.children ??= []).push(nativeNodes.get(node.id)!);
  }
  // Validate hierarchy iteratively, rather than silently omitting cyclic nodes.
  const reachable = new Set<string>();
  const pending = [...(root.children ?? [])];
  while (pending.length) {
    const node = pending.pop()!;
    if (reachable.has(node.id)) throw new Error('ELK: cyclic hierarchy');
    reachable.add(node.id); pending.push(...(node.children ?? []));
  }
  if (reachable.size !== graph.nodes.length) throw new Error('ELK: cyclic hierarchy');
  const idMap = new Map(graph.nodes.map((node) => [node.id, node.id]));
  graph.edges.forEach((edge, index) => {
    const getEndpoint = (nodeId: string, portName: string | undefined) => {
      if (portName === undefined) return nodeId;
      const id = portIds.get(JSON.stringify([nodeId, portName]));
      if (!id) throw new Error(`ELK: missing port ${nodeId}:${portName}`);
      return id;
    };
    const native: ElkExtendedEdge = { id: edgeIds[index], sources: [getEndpoint(edge.sourceId, edge.sourcePort)], targets: [getEndpoint(edge.targetId, edge.targetPort)],
      ...(typeof edge.label === 'string' && { labels: [{ text: edge.label, ...getFields(edge, ['x', 'y', 'width', 'height']) }] }),
      ...(edge.routing !== undefined && { layoutOptions: { 'elk.edgeRouting': edge.routing.toUpperCase() } }),
    };
    if (edge.points && edge.points.length >= 2) native.sections = [{ id: createId(`${native.id}__section`),
      startPoint: edge.points[0], endPoint: edge.points[edge.points.length - 1], bendPoints: edge.points.slice(1, -1) }];
    addWire(native, 'edge', edge, getElkEdge(native, index, owners, idMap, edge.routing ?? 'orthogonal', edge));
    const ancestors = new Set<string | null>([null]);
    for (let parent = parentIds.get(edge.sourceId) ?? null; parent !== null; parent = parentIds.get(parent) ?? null) ancestors.add(parent);
    let containerId = parentIds.get(edge.targetId) ?? null;
    while (!ancestors.has(containerId)) containerId = parentIds.get(containerId!) ?? null;
    const container = containerId === null ? root : nativeNodes.get(containerId)!;
    (container.edges ??= []).push(native);
  });
  const { nodes: _nodes, edges: _edges, ...original } = graph;
  const traversalNodes: string[] = [], traversalEdges: string[] = [];
  const traversal = [root];
  while (traversal.length) {
    const node = traversal.pop()!;
    if (node !== root) traversalNodes.push(node.id);
    traversalEdges.push(...(node.edges ?? []).map((edge) => edge.id));
    traversal.push(...[...(node.children ?? [])].reverse());
  }
  addWire(root, 'graph', original, getElkRoot(root, graph), { nodeOrder: graph.nodes.map((node) => node.id),
    edgeOrder: graph.edges.map((edge) => edge.id), nativeNodeOrder: traversalNodes, nativeEdgeOrder: traversalEdges });
  return getClonedJSON(root);
}

/** Import extended/primitive edges; hyperedges are explicitly unsupported by Graph. */
export function fromELK(root: ELKInputNode, options: ELKImportOptions = {}): VisualGraph {
  if (!root || typeof root !== 'object') throw new Error('ELK: expected a root node');
  const rootWire = getWire(root, 'graph', options);
  const rootPreserved = rootWire.metadata?.original ?? rootWire.legacy ?? {};
  const nodeIds = new Map<string, string>();
  const owners = new Map<string, { nodeId: string; portName: string }>();
  const nodes: VisualNode[] = [], edges: VisualEdge[] = [];
  const rawNodeIds: string[] = [], rawEdgeIds: string[] = [];
  const edgeEntries: Array<{ edge: ElkExtendedEdge | ElkPrimitiveEdge; routing: EdgeRouting }> = [];
  const pending = [{ native: root, parentId: null as string | null, isRoot: true, routing: getRouting(root) }];
  const seenNativeIds = new Set<string>();
  function addNativeId(id: string, legacy = false): void {
    if (typeof id !== 'string') throw new Error('ELK: element id must be a string');
    if (seenNativeIds.has(id) && !legacy) throw new Error(`ELK: duplicate element id ${id}`);
    seenNativeIds.add(id);
  }
  addNativeId(root.id);
  for (const port of root.ports ?? []) addNativeId(port.id, !!getWire(port, 'port', options).legacy);
  while (pending.length) {
    const { native, parentId, isRoot, routing } = pending.pop()!;
    const wire = getWire(native, 'node', options);
    const preserved = wire.metadata?.original ?? wire.legacy ?? {};
    let currentParent = parentId;
    if (!isRoot) {
      addNativeId(native.id, !!wire.legacy);
      const mapped = getElkNode(native, parentId, preserved);
      const ownerNodeId = getRestoredRecord(mapped, wire.metadata).id;
      if (Object.hasOwn(native, 'ports')) mapped.ports = (native.ports ?? []).map((port) => {
        const portWire = getWire(port, 'port', options);
        addNativeId(port.id, !!portWire.legacy);
        const original = { ...(portWire.metadata?.original ?? portWire.legacy ?? {}) };
        if (portWire.metadata && portWire.raw.nativeId !== undefined && port.id !== portWire.raw.nativeId) original.name = port.id;
        const restored = getRestoredRecord(getElkPort(port, original), portWire.metadata);
        owners.set(port.id, { nodeId: ownerNodeId, portName: restored.name });
        return restored;
      });
      const restored = getRestoredRecord(mapped, wire.metadata);
      nodes.push(restored); rawNodeIds.push(native.id);
      nodeIds.set(native.id, restored.id);
      currentParent = restored.id;
    }
    for (const edge of native.edges ?? []) {
      addNativeId(edge.id, !!getWire(edge, 'edge', options).legacy);
      edgeEntries.push({ edge: edge as ElkExtendedEdge | ElkPrimitiveEdge, routing });
    }
    pending.push(...[...(native.children ?? [])].reverse().map((child) => ({ native: child, parentId: isRoot ? null : currentParent, isRoot: false, routing: getRouting(child, routing) })));
  }
  edgeEntries.forEach(({ edge, routing }, index) => {
    const wire = getWire(edge, 'edge', options);
    const preserved = wire.metadata?.original ?? wire.legacy ?? {};
    const restored = getRestoredRecord(getElkEdge(edge, index, owners, nodeIds, routing, preserved, !!wire.legacy), wire.metadata);
    // Old adapters duplicated edges at several ancestors. Only legacy blobs
    // permit deduplication; native duplicate IDs are not silently conflated.
    if (wire.legacy && edges.some((existing) => existing.id === restored.id)) return;
    edges.push(restored); rawEdgeIds.push(edge.id);
  });
  const graph: VisualGraph = { ...getRestoredRecord(getElkRoot(root, rootPreserved), rootWire.metadata), nodes, edges };
  const order = rootWire.raw;
  if (rootWire.metadata && Array.isArray(order.nodeOrder) && isJSONEqual(rawNodeIds, order.nativeNodeOrder)) {
    const positions = new Map(order.nodeOrder.map((id: string, index: number) => [id, index]));
    graph.nodes.sort((a, b) => Number(positions.get(a.id)) - Number(positions.get(b.id)));
  }
  if (rootWire.metadata && Array.isArray(order.edgeOrder) && isJSONEqual(rawEdgeIds, order.nativeEdgeOrder)) {
    const positions = new Map(order.edgeOrder.map((id: string, index: number) => [id, index]));
    graph.edges.sort((a, b) => Number(positions.get(a.id)) - Number(positions.get(b.id)));
  }
  if (!rootWire.metadata) graph.data = createNativeCarrier(graph.data, 'elk', root, graph);
  return graph;
}

export const elkConverter: VisualGraphFormatConverter<ElkNode> = { to: toELK, from: fromELK };


/** Exact native source preservation, with strict verified field edits. */
export const elkDocumentConverter = createGraphDocumentConverter({
  format: 'elk',
  codec: { from: (source: ELKInputNode) => fromELK(source, { metadata: 'native' }), to: (graph: VisualGraph) => toELK(graph, { nativeCarrier: false }) },
  project: (source: ELKInputNode) => ({ graph: getStructuredDocumentProjectionGraph(fromELK(source, { metadata: 'native' }), source, 'elk') }),
  patch: (context) => getStructuredDocumentPatch(context, 'elk'),
});
