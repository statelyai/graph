import type { Graph } from "../../types";
import { createFormatConverter } from "../converter";
import {
  createGraphDocumentConverter,
  type GraphDocumentPatchContext,
  type GraphDocumentPatchResult,
} from "../document";
import {
  createNativeCarrier,
  getNativeCarrier,
  getCarrierData,
  getNativeDocumentGraph,
  getClonedJSON,
  isJSONEqual,
  type FormatImportOptions,
  type FormatExportOptions,
} from "../preservation";
import {
  getValidatedGraph,
  isNativeMetadataRecord,
  isNativeField,
} from "../structured-json";

export interface GraphSONTypedValue<T = any> {
  "@type": string;
  "@value": T;
  [field: string]: any;
}
export interface GraphSONVertexProperty {
  "@type": "g:VertexProperty";
  "@value": {
    id: any;
    label: string;
    value: any;
    properties?: Record<string, any>;
    [field: string]: any;
  };
  [field: string]: any;
}
export interface GraphSONVertex {
  "@type": "g:Vertex";
  "@value": {
    id: any;
    label?: string;
    properties?: Record<string, GraphSONVertexProperty[]>;
    [field: string]: any;
  };
  [field: string]: any;
}
export interface GraphSONEdge {
  "@type": "g:Edge";
  "@value": {
    id: any;
    label?: string;
    outV: any;
    inV: any;
    outVLabel?: string;
    inVLabel?: string;
    properties?: Record<string, GraphSONTypedValue>;
    [field: string]: any;
  };
  [field: string]: any;
}
/** GraphSON3 object serialization with Apache TinkerIoRegistryV3; not writeGraph adjacency JSON. */
export interface GraphSONGraph {
  "@type": "tinker:graph";
  "@value": {
    vertices: GraphSONVertex[];
    edges: GraphSONEdge[];
    [field: string]: any;
  };
  [field: string]: any;
}
export interface GraphSONImportOptions extends FormatImportOptions {
  version?: 3;
  profile?: "tinker:graph";
}
export interface GraphSONExportOptions extends FormatExportOptions {
  version?: 3;
  profile?: "tinker:graph";
}
interface GraphSONState {
  kind: "@statelyai/graph/graphson";
  version: 1;
  profile: "tinker:graph";
  original: Graph;
  baseline: Graph;
}
interface GraphSONProjection {
  graph: Graph;
  vertices: Map<string, GraphSONVertex>;
  edges: Map<string, GraphSONEdge>;
  state?: GraphSONState;
}
const STATE = "__statelyai";

function getProfile(
  options: GraphSONImportOptions | GraphSONExportOptions,
): void {
  if (
    (options.version !== undefined && options.version !== 3) ||
    (options.profile !== undefined && options.profile !== "tinker:graph")
  )
    throw new Error(
      "GraphSON: only version3 typed tinker:graph object profile is supported",
    );
}
function getObject(value: any, label: string): Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`GraphSON: expected ${label} object`);
  return value;
}
function getWrapper(value: any, type: string): any {
  const record = getObject(value, type);
  if (
    !Object.hasOwn(record, "@type") ||
    record["@type"] !== type ||
    !Object.hasOwn(record, "@value")
  )
    throw new Error(`GraphSON: expected typed ${type}`);
  return record["@value"];
}
function getRequiredValue(record: Record<string, any>, field: string): any {
  if (!Object.hasOwn(record, field)) throw new Error(`GraphSON: missing own ${field}`);
  return record[field];
}
function getInteger(
  value: any,
  type: string,
  min: bigint,
  max: bigint,
): string {
  if (
    (typeof value !== "string" || !/^[+-]?\d+$/.test(value)) &&
    (typeof value !== "number" || !Number.isSafeInteger(value))
  )
    throw new Error(
      `GraphSON: ${type} requires an exact integer; unsafe JSON numbers reject`,
    );
  const number = BigInt(value);
  if (number < min || number > max)
    throw new Error(`GraphSON: ${type} is out of range`);
  return number.toString();
}
function getIdentity(value: any): string {
  let type: string, normalized: any;
  if (typeof value === "string") {
    type = "string";
    normalized = value;
  } else {
    const record = getObject(value, "typed ID");
    type = record["@type"];
    if (!Object.hasOwn(record, "@type") || !Object.hasOwn(record, "@value"))
      throw new Error("GraphSON: ID requires @value");
    const inner = record["@value"];
    if (type === "g:Int32")
      normalized = getInteger(inner, type, -2147483648n, 2147483647n);
    else if (type === "g:Int64")
      normalized = getInteger(
        inner,
        type,
        -9223372036854775808n,
        9223372036854775807n,
      );
    else if (type === "gx:BigInteger") {
      if (
        (typeof inner !== "string" || !/^[+-]?\d+$/.test(inner)) &&
        (typeof inner !== "number" || !Number.isSafeInteger(inner))
      )
        throw new Error("GraphSON: BigInteger ID must be exact");
      normalized = BigInt(inner).toString();
    } else if (
      type === "g:UUID" &&
      typeof inner === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        inner,
      )
    )
      normalized = inner.toLowerCase();
    else
      throw new Error(
        "GraphSON: IDs must be strings or supported typed Int32/Int64/BigInteger/UUID values",
      );
  }
  return `graphson:${JSON.stringify([type, normalized])}`;
}
function getValidatedValues(source: any, typed = true): void {
  const active = new Set<object>(),
    stack: Array<{ value: any; leave?: boolean }> = [{ value: source }];
  while (stack.length) {
    const frame = stack.pop()!,
      value = frame.value;
    if (frame.leave) {
      active.delete(value);
      continue;
    }
    if (value === null || ["string", "boolean"].includes(typeof value))
      continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new Error("GraphSON: non-finite/signed-zero JSON numbers reject");
      continue;
    }
    if (!value || typeof value !== "object")
      throw new Error("GraphSON: source values must be plain JSON");
    if (active.has(value))
      throw new Error(
        "GraphSON: cyclic values are outside the JSON source profile",
      );
    active.add(value);
    stack.push({ value, leave: true });
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (!(Array.isArray(value) && key === "length") &&
            (!descriptors[key].enumerable ||
              !Object.hasOwn(descriptors[key], "value"))),
      )
    )
      throw new Error(
        "GraphSON: symbol/accessor/nonenumerable source fields reject",
      );
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        keys.length !== value.length + 1 ||
        keys.some(
          (key) =>
            !(Array.isArray(value) && key === "length") &&
            (typeof key !== "string" ||
              !/^(?:0|[1-9]\d*)$/.test(key) ||
              Number(key) >= value.length),
        )
      )
        throw new Error("GraphSON: sparse/custom arrays reject");
    } else {
      getObject(value, "JSON");
      const type = typed ? value["@type"] : undefined,
        inner = value["@value"];
      if (type === "g:Int32")
        getInteger(inner, type, -2147483648n, 2147483647n);
      if (type === "g:Int64")
        getInteger(inner, type, -9223372036854775808n, 9223372036854775807n);
      if (
        type === "gx:BigInteger" &&
        (typeof inner !== "string" || !/^[+-]?\d+$/.test(inner)) &&
        (typeof inner !== "number" || !Number.isSafeInteger(inner))
      )
        throw new Error("GraphSON: BigInteger value must be exact");
      if (
        type === "gx:BigDecimal" &&
        (typeof inner !== "string" ||
          !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(inner))
      )
        throw new Error(
          "GraphSON: BigDecimal requires an exact decimal string",
        );
      if (
        ["g:Map", "g:List", "g:Set"].includes(type) &&
        (!Array.isArray(inner) || (type === "g:Map" && inner.length % 2))
      )
        throw new Error("GraphSON: malformed typed collection");
    }
    for (const key of keys)
      if (!(Array.isArray(value) && key === "length"))
        stack.push({ value: descriptors[key as string].value });
  }
}
function getLabel(value: any, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !value)
    throw new Error("GraphSON: native element labels must be nonempty strings");
  return value;
}
function getBodyData(body: Record<string, any>, fields: string[]): any {
  return getClonedJSON(
    Object.fromEntries(
      Object.entries(body).filter(([key]) => !fields.includes(key)),
    ),
  );
}
function isStateGraph(graph: any): boolean {
  return (
    graph &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    isNativeMetadataRecord(graph, "graph") &&
    graph.nodes.every(
      (node: any) =>
        isNativeMetadataRecord(node, "node") &&
        (!node.ports ||
          node.ports.every(
            (port: any) =>
              !Object.hasOwn(port, "style") ||
              isNativeField("style", port.style),
          )),
    ) &&
    graph.edges.every((edge: any) => isNativeMetadataRecord(edge, "edge"))
  );
}
function getState(
  source: GraphSONGraph,
  native: boolean,
): GraphSONState | undefined {
  if (native) return undefined;
  if (!Object.hasOwn(source["@value"], STATE)) return undefined;
  const text = source["@value"][STATE];
  if (typeof text !== "string") return undefined;
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    value?.kind !== "@statelyai/graph/graphson" ||
    value.version !== 1 ||
    value.profile !== "tinker:graph"
  )
    return undefined;
  for (const graph of [value.original, value.baseline]) {
    if (!isStateGraph(graph)) return undefined;
    try {
      getValidatedGraph(graph, "GraphSON state");
      getValidatedValues(graph, false);
    } catch {
      return undefined;
    }
  }
  if (
    value.original.mode !== "directed" ||
    value.original.edges.some(
      (edge: any) => edge.mode !== undefined && edge.mode !== "directed",
    )
  )
    return undefined;
  if (
    value.original.nodes.some(
      (node: any, index: number) =>
        getIdentity(node.id) !== value.baseline.nodes[index]?.id,
    ) ||
    value.original.edges.some(
      (edge: any, index: number) =>
        getIdentity(edge.id) !== value.baseline.edges[index]?.id ||
        getIdentity(edge.sourceId) !== value.baseline.edges[index]?.sourceId ||
        getIdentity(edge.targetId) !== value.baseline.edges[index]?.targetId,
    )
  )
    return undefined;
  if (
    value.original.nodes.length !== value.baseline.nodes.length ||
    value.original.edges.length !== value.baseline.edges.length
  )
    return undefined;
  return value;
}
function getRawProjection(
  source: GraphSONGraph,
  native: boolean,
): GraphSONProjection {
  getValidatedValues(source);
  const body = getObject(
    getWrapper(source, "tinker:graph"),
    "tinker:graph value",
  );
  if (
    !Object.hasOwn(body, "vertices") ||
    !Object.hasOwn(body, "edges") ||
    !Array.isArray(body.vertices) ||
    !Array.isArray(body.edges)
  )
    throw new Error(
      "GraphSON: typed whole graph requires vertices and edges arrays",
    );
  const state = getState(source, native),
    vertices = new Map<string, GraphSONVertex>(),
    edges = new Map<string, GraphSONEdge>();
  const graph: Graph = {
    id: "",
    mode: "directed",
    data: {
      ...getBodyData(source, ["@type", "@value"]),
      ...getBodyData(body, ["vertices", "edges", ...(state ? [STATE] : [])]),
    },
    nodes: [],
    edges: [],
  };
  const propertyIds = new Set<string>();
  for (const vertex of body.vertices) {
    const record = getObject(getWrapper(vertex, "g:Vertex"), "vertex value"),
      id = getIdentity(getRequiredValue(record, "id"));
    if (vertices.has(id))
      throw new Error("GraphSON: duplicate typed vertex ID");
    const label = getLabel(
      Object.hasOwn(record, "label") ? record.label : undefined,
      "vertex",
    );
    vertices.set(id, vertex);
    if (Object.hasOwn(record, "properties"))
      for (const [key, properties] of Object.entries(
        getObject(record.properties, "vertex properties"),
      )) {
        if (!key || !Array.isArray(properties))
          throw new Error("GraphSON: vertex properties require named arrays");
        for (const property of properties) {
          const item = getObject(
              getWrapper(property, "g:VertexProperty"),
              "vertex property value",
            ),
            propertyId = getIdentity(getRequiredValue(item, "id"));
          if (
            propertyIds.has(propertyId) ||
            item.label !== key ||
            !Object.hasOwn(item, "value") ||
            (item.vertex !== undefined && getIdentity(item.vertex) !== id)
          )
            throw new Error(
              "GraphSON: duplicate/mismatched vertex-property identity",
            );
          propertyIds.add(propertyId);
          if (item.properties !== undefined)
            getObject(item.properties, "meta-properties");
        }
      }
    graph.nodes.push({
      type: "node",
      id,
      label,
      data: getBodyData(record, ["id", "label"]),
    });
  }
  for (const edge of body.edges) {
    const record = getObject(getWrapper(edge, "g:Edge"), "edge value"),
      id = getIdentity(getRequiredValue(record, "id")),
      sourceId = getIdentity(getRequiredValue(record, "outV")),
      targetId = getIdentity(getRequiredValue(record, "inV"));
    if (edges.has(id)) throw new Error("GraphSON: duplicate typed edge ID");
    if (!vertices.has(sourceId) || !vertices.has(targetId))
      throw new Error("GraphSON: dangling typed endpoint");
    if (Object.hasOwn(record, "properties"))
      for (const [key, property] of Object.entries(
        getObject(record.properties, "edge properties"),
      )) {
        const item = getObject(
          getWrapper(property, "g:Property"),
          "edge property value",
        );
        if (!key || item.key !== key || !Object.hasOwn(item, "value"))
          throw new Error("GraphSON: mismatched edge property");
      }
    const weight = record.properties?.weight?.["@value"]?.value;
    const numericWeight =
      weight?.["@type"] === "g:Double" || weight?.["@type"] === "g:Float"
        ? weight["@value"]
        : undefined;
    edges.set(id, edge);
    graph.edges.push({
      type: "edge",
      id,
      sourceId,
      targetId,
      label: getLabel(
        Object.hasOwn(record, "label") ? record.label : undefined,
        "edge",
      ),
      data: getBodyData(record, [
        "id",
        "label",
        "outV",
        "inV",
        "outVLabel",
        "inVLabel",
      ]),
      ...(typeof numericWeight === "number" &&
        Number.isFinite(numericWeight) && { weight: numericWeight }),
    });
  }
  return { graph, vertices, edges, state };
}
function getDataComparison(
  data: any,
  baseline: any,
  entity: "node" | "edge",
): { before: any; current: any; property: any; prior: any } {
  const before = getClonedJSON(baseline),
    current = getClonedJSON(data);
  const property =
    entity === "node"
      ? current?.properties?.data?.[0]
      : current?.properties?.data;
  const prior =
    entity === "node"
      ? before?.properties?.data?.[0]
      : before?.properties?.data;
  if (
    property &&
    prior &&
    isJSONEqual(
      { ...property, "@value": { ...property["@value"], value: null } },
      { ...prior, "@value": { ...prior["@value"], value: null } },
    )
  )
    property["@value"].value = prior["@value"].value;
  if (entity === "edge") {
    const weight = data?.properties?.weight?.["@value"]?.value;
    if (
      weight === undefined ||
      (["g:Double", "g:Float"].includes(weight?.["@type"]) &&
        typeof weight?.["@value"] === "number" &&
        Number.isFinite(weight["@value"]))
    ) {
      for (const record of [before, current])
        if (record?.properties) {
          delete record.properties.weight;
          if (!Object.keys(record.properties).length) delete record.properties;
        }
    }
  }
  return { before, current, property, prior };
}
function getDataValue(
  data: any,
  original: any,
  baseline: any,
  entity: "node" | "edge",
): any {
  if (isJSONEqual(data, baseline)) return getClonedJSON(original);
  const compared = getDataComparison(data, baseline, entity);
  let userData = getClonedJSON(original);
  const property =
    entity === "node" ? data?.properties?.data?.[0] : data?.properties?.data;
  if (
    property &&
    compared.prior &&
    isJSONEqual(
      { ...property, "@value": { ...property["@value"], value: null } },
      {
        ...compared.prior,
        "@value": { ...compared.prior["@value"], value: null },
      },
    )
  ) {
    const value = property["@value"]?.value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        getValidatedValues(parsed, false);
        userData = parsed;
      } catch {
        userData = value;
      }
    }
  }
  return isJSONEqual(compared.before, compared.current)
    ? userData
    : { graphData: userData, native: getClonedJSON(data) };
}
function getProjection(
  source: GraphSONGraph,
  options: GraphSONImportOptions = {},
): GraphSONProjection {
  getProfile(options);
  const projection = getRawProjection(source, options.metadata === "native"),
    state = projection.state;
  if (!state) return projection;
  const root = getClonedJSON(state.original);
  const originals = new Map(
    state.baseline.nodes.map((node, index) => [
      node.id,
      { before: node, original: state.original.nodes[index] },
    ]),
  );
  const restoredNodes = projection.graph.nodes.map((node) => {
    const item = originals.get(node.id);
    if (!item) return node;
    const restored = getClonedJSON(item.original);
    if (node.label !== item.before.label) restored.label = node.label;
    restored.data = getDataValue(
      node.data,
      item.original.data,
      item.before.data,
      "node",
    );
    return restored;
  });
  const ids = new Map(
    projection.graph.nodes.map((node, index) => [
      node.id,
      restoredNodes[index].id,
    ]),
  );
  const priorEdges = new Map(
    state.baseline.edges.map((edge, index) => [
      edge.id,
      { before: edge, original: state.original.edges[index] },
    ]),
  );
  const restoredEdges = projection.graph.edges.map((edge) => {
    const item = priorEdges.get(edge.id);
    if (!item)
      return {
        ...edge,
        sourceId: ids.get(edge.sourceId)!,
        targetId: ids.get(edge.targetId)!,
      };
    const restored = getClonedJSON(item.original);
    if (edge.label !== item.before.label) restored.label = edge.label;
    if (edge.weight !== item.before.weight) {
      if (edge.weight === undefined) delete restored.weight;
      else restored.weight = edge.weight;
    }
    restored.sourceId = ids.get(edge.sourceId)!;
    restored.targetId = ids.get(edge.targetId)!;
    restored.data = getDataValue(
      edge.data,
      item.original.data,
      item.before.data,
      "edge",
    );
    return restored;
  });
  if (!isJSONEqual(projection.graph.data, state.baseline.data))
    root.data = { graphData: root.data, native: projection.graph.data };
  root.nodes = restoredNodes;
  root.edges = restoredEdges;
  getValidatedGraph(root, "GraphSON");
  return { ...projection, graph: root };
}

/** Only typed GraphSON3 tinker:graph; typed IDs and properties remain lossless JSON wrappers. */
export function fromGraphSON(
  source: GraphSONGraph,
  options: GraphSONImportOptions = {},
): Graph {
  const graph = getProjection(source, options).graph;
  graph.data = createNativeCarrier(graph.data, "graphson", source, graph);
  (graph.data as any).__statelyaiNative.baselineNative =
    getClonedJSON(source);
  return graph;
}
function getProperty(value: any, key: string): GraphSONTypedValue {
  return { "@type": "g:Property", "@value": { key, value } };
}
function toRawGraphSON(
  graph: Graph,
  options: GraphSONExportOptions = {},
): GraphSONGraph {
  getProfile(options);
  getValidatedValues(graph, false);
  getValidatedGraph(graph, "GraphSON");
  if (!isStateGraph(graph))
    throw new Error("GraphSON: invalid typed Graph fields");
  if (
    graph.mode !== "directed" ||
    graph.edges.some(
      (edge) => edge.mode !== undefined && edge.mode !== "directed",
    )
  )
    throw new Error("GraphSON: only directed graphs are representable");
  const labels = new Map(
    graph.nodes.map((node) => [
      node.id,
      getLabel(node.label ?? undefined, "vertex"),
    ]),
  );
  const source: GraphSONGraph = {
    "@type": "tinker:graph",
    "@value": {
      vertices: graph.nodes.map((node, index) => {
        const body: GraphSONVertex["@value"] = {
          id: node.id,
          label: labels.get(node.id)!,
        };
        if (node.data !== undefined)
          body.properties = {
            data: [
              {
                "@type": "g:VertexProperty",
                "@value": {
                  id: `@statelyai/data/${index}`,
                  label: "data",
                  value: JSON.stringify(node.data),
                },
              },
            ],
          };
        return { "@type": "g:Vertex", "@value": body };
      }),
      edges: graph.edges.map((edge) => {
        const body: GraphSONEdge["@value"] = {
          id: edge.id,
          label: getLabel(edge.label ?? undefined, "edge"),
          outV: edge.sourceId,
          inV: edge.targetId,
          outVLabel: labels.get(edge.sourceId)!,
          inVLabel: labels.get(edge.targetId)!,
        };
        if (edge.data !== undefined || edge.weight !== undefined)
          body.properties = {
            ...(edge.data !== undefined && {
              data: getProperty(JSON.stringify(edge.data), "data"),
            }),
            ...(edge.weight !== undefined && {
              weight: getProperty(
                { "@type": "g:Double", "@value": edge.weight },
                "weight",
              ),
            }),
          };
        return { "@type": "g:Edge", "@value": body };
      }),
    },
  };
  const baseline = getRawProjection(source, true).graph;
  const state: GraphSONState = {
    kind: "@statelyai/graph/graphson",
    version: 1,
    profile: "tinker:graph",
    original: getClonedJSON(graph),
    baseline,
  };
  source["@value"][STATE] = JSON.stringify(state);
  return source;
}
function getPropertyPatch(
  before: any,
  after: any,
  entity: "node" | "edge",
): any | undefined {
  const copy = getClonedJSON(before);
  if (
    !before ||
    !after ||
    !isJSONEqual(
      Object.keys(before.properties ?? {}),
      Object.keys(after.properties ?? {}),
    )
  )
    return undefined;
  for (const key of Object.keys(before.properties ?? {})) {
    const originals =
        entity === "node" ? before.properties[key] : [before.properties[key]],
      updates =
        entity === "node" ? after.properties[key] : [after.properties[key]];
    if (!Array.isArray(updates) || originals.length !== updates.length)
      return undefined;
    for (let index = 0; index < originals.length; index++) {
      const old = originals[index],
        update = updates[index];
      if (!old?.["@value"] || !update?.["@value"]) return undefined;
      if (
        !isJSONEqual(
          { ...old, "@value": { ...old["@value"], value: null } },
          { ...update, "@value": { ...update["@value"], value: null } },
        )
      )
        return undefined;
      const property =
        entity === "node" ? copy.properties[key][index] : copy.properties[key];
      property["@value"].value = getClonedJSON(update["@value"].value);
    }
  }
  return isJSONEqual(copy, after) ? copy : undefined;
}
function getPatch(
  context: GraphDocumentPatchContext<GraphSONGraph>,
): GraphDocumentPatchResult<GraphSONGraph> {
  const source = getClonedJSON(context.source),
    projection = getProjection(source),
    state = projection.state;
  const nativeBaselines = new Map(
    [...(state?.baseline.nodes ?? []), ...(state?.baseline.edges ?? [])].map(
      (entity) => [`${entity.type}:${entity.id}`, entity.data],
    ),
  );
  const endpointLabels = new Map<
    string,
    Array<{ body: GraphSONEdge["@value"]; field: "outVLabel" | "inVLabel" }>
  >();
  for (const edge of source["@value"].edges)
    for (const field of ["outV", "inV"] as const) {
      const id = getIdentity(edge["@value"][field]),
        entries = endpointLabels.get(id) ?? [];
      entries.push({
        body: edge["@value"],
        field: field === "outV" ? "outVLabel" : "inVLabel",
      });
      endpointLabels.set(id, entries);
    }
  const nodes = new Map(context.graph.nodes.map((node) => [node.id, node])),
    edges = new Map(context.graph.edges.map((edge) => [edge.id, edge]));
  const nodeRecords = new Map<string, GraphSONVertex>(),
    edgeRecords = new Map<string, GraphSONEdge>();
  const nodeIds = new Map(
    state?.baseline.nodes.map((node, index) => [
      node.id,
      state.original.nodes[index].id,
    ]),
  );
  const edgeIds = new Map(
    state?.baseline.edges.map((edge, index) => [
      edge.id,
      state.original.edges[index].id,
    ]),
  );
  for (const [id, record] of projection.vertices)
    nodeRecords.set(nodeIds.get(id) ?? id, record);
  for (const [id, record] of projection.edges)
    edgeRecords.set(edgeIds.get(id) ?? id, record);
  for (const change of context.changes) {
    const entity =
      change.entity === "node" ? nodes.get(change.id!) : edges.get(change.id!);
    const record =
      change.entity === "node"
        ? nodeRecords.get(change.id!)
        : edgeRecords.get(change.id!);
    if (!entity || !record || change.entity === "graph")
      return {
        ok: false,
        diagnostics: [
          {
            code: "unsupported-native-edit",
            severity: "error",
            path: change.path,
            message:
              "GraphSON Graph-only/structural fields have no bounded native patch",
          },
        ],
      };
    const body = record["@value"];
    if (change.field === "label") {
      if (!entity.label || typeof entity.label !== "string")
        return {
          ok: false,
          diagnostics: [
            {
              code: "unsupported-native-edit",
              severity: "error",
              message: "GraphSON label patches require a nonempty native label",
            },
          ],
        };
      if (
        change.entity === "node" &&
        (endpointLabels.get(getIdentity(body.id)) ?? []).some(
          (entry) =>
            entry.body[entry.field] !== undefined &&
            entry.body[entry.field] !== getLabel(body.label, "vertex"),
        )
      )
        return {
          ok: false,
          diagnostics: [
            {
              code: "ambiguous-native-mirror",
              severity: "error",
              message:
                "Native endpoint-label edits disagree with their vertex; label patch would overwrite an independent source field",
            },
          ],
        };
      body.label = entity.label;
      if (change.entity === "node")
        for (const entry of endpointLabels.get(getIdentity(body.id)) ?? [])
          entry.body[entry.field] = entity.label;
    } else if (change.field === "data") {
      if (state) {
        const property =
          change.entity === "node"
            ? (record as GraphSONVertex)["@value"].properties?.data?.[0]
            : (record as GraphSONEdge)["@value"].properties?.data;
        const compared = getDataComparison(
          getBodyData(
            body,
            change.entity === "node"
              ? ["id", "label"]
              : ["id", "label", "outV", "inV", "outVLabel", "inVLabel"],
          ),
          nativeBaselines.get(`${change.entity}:${getIdentity(body.id)}`),
          change.entity as "node" | "edge",
        );
        if (!property || !isJSONEqual(compared.before, compared.current))
          return {
            ok: false,
            diagnostics: [
              {
                code: "unsupported-native-edit",
                severity: "error",
                message:
                  "Native data extension/absence has no unambiguous user JSON property mapping",
              },
            ],
          };
        property["@value"].value = JSON.stringify(entity.data);
      } else {
        const before = getBodyData(
          body,
          change.entity === "node"
            ? ["id", "label"]
            : ["id", "label", "outV", "inV", "outVLabel", "inVLabel"],
        );
        const patched = getPropertyPatch(
          before,
          entity.data,
          change.entity as "node" | "edge",
        );
        if (!patched)
          return {
            ok: false,
            diagnostics: [
              {
                code: "unsupported-native-edit",
                severity: "error",
                message:
                  "Only existing stable native property values can be changed; property IDs/order/meta-properties remain intact",
              },
            ],
          };
        Object.assign(body, patched);
      }
    } else
      return {
        ok: false,
        diagnostics: [
          {
            code: "unsupported-native-edit",
            severity: "error",
            path: change.path,
            message:
              "Only native labels and bounded existing property data edits are supported",
          },
        ],
      };
  }
  return { ok: true, source };
}
export const graphsonDocumentConverter = createGraphDocumentConverter({
  format: "graphson:3:tinker:graph",
  codec: { from: fromGraphSON, to: (graph: Graph) => toRawGraphSON(graph) },
  project: (source: GraphSONGraph) => ({
    graph: getNativeDocumentGraph(fromGraphSON(source), "graphson", source),
  }),
  patch: getPatch,
});
/** Native imports retain exact source and apply strict verified patches; nativeCarrier:false regenerates. */
export function toGraphSON(
  graph: Graph,
  options: GraphSONExportOptions = {},
): GraphSONGraph {
  getProfile(options);
  getValidatedValues(graph, false);
  const carrier =
    options.nativeCarrier === false
      ? undefined
      : getNativeCarrier(graph.data, "graphson");
  if (!carrier) return toRawGraphSON(graph, options);
  const originalSource = (
    carrier as typeof carrier & { baselineNative?: GraphSONGraph }
  ).baselineNative;
  if (originalSource === undefined)
    throw new Error("GraphSON: missing native provenance baseline");
  const document = graphsonDocumentConverter.from(originalSource);
  if (!isJSONEqual(document.baseline.graph, carrier.baseline))
    throw new Error("GraphSON: invalid native provenance baseline");
  document.source = carrier.native;
  document.graph = {
    ...getClonedJSON(graph),
    data: getCarrierData(graph.data, "graphson"),
  };
  return graphsonDocumentConverter.to(document);
}
export const graphsonConverter = createFormatConverter(
  toGraphSON,
  fromGraphSON,
);
