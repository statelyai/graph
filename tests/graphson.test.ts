import { describe, it, expect } from "vitest";
import { createGraph } from "../src/graph";
import {
  fromGraphSON,
  toGraphSON,
  graphsonDocumentConverter,
  type GraphSONGraph,
} from "../src/formats/graphson";
import { getNativeDocumentGraph } from "../src/formats/preservation";
function getTyped(type: string, value: any): any {
  return { "@type": type, "@value": value };
}
function getPersisted<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function createNative(): GraphSONGraph {
  return getTyped("tinker:graph", {
    vertices: [
      getTyped("g:Vertex", {
        id: getTyped("g:Int32", 1),
        label: "person",
        properties: {
          name: [
            getTyped("g:VertexProperty", {
              id: "p1",
              label: "name",
              value: "Alpha",
              properties: { origin: "native" },
            }),
            getTyped("g:VertexProperty", {
              id: "p2",
              label: "name",
              value: "Other",
            }),
          ],
          typed: [
            getTyped("g:VertexProperty", {
              id: "p3",
              label: "typed",
              value: getTyped("g:Map", [
                getTyped("g:Int32", 1),
                "integer",
                "1",
                getTyped("g:Set", ["first", "second"]),
              ]),
            }),
          ],
        },
      }),
      getTyped("g:Vertex", {
        id: "1",
        label: "person",
        vendor: ["retained", null],
      }),
      getTyped("g:Vertex", {
        id: getTyped("g:Int64", "9007199254740993"),
        label: "large",
      }),
    ],
    edges: [
      getTyped("g:Edge", {
        id: "e",
        outV: getTyped("g:Int32", 1),
        inV: "1",
        label: "knows",
        outVLabel: "person",
        inVLabel: "person",
        properties: {
          weight: getTyped("g:Property", {
            key: "weight",
            value: getTyped("g:Double", 2),
          }),
          custom: getTyped("g:Property", {
            key: "custom",
            value: getTyped("vendor:opaque", { untouched: true }),
          }),
        },
      }),
    ],
    vendor: "opaque root",
  });
}
describe("explicit typed GraphSON3 tinker:graph", () => {
  it("fresh directed full Graph JSON retains data, hierarchy, ports, geometry, labels and presence via explicit convention", () => {
    const graph = createGraph<any, any, any>({
      id: "whole",
      data: [null, "root"],
      nodes: [
        { id: "a", label: null, data: 42, ports: [{ name: "p", data: null }] },
        {
          id: "__proto__",
          parentId: "a",
          label: "Target",
          data: {
            native: "actual user",
            "@type": "g:Int64",
            "@value": 9007199254740992,
          },
          x: 0,
          y: 1,
          style: { fill: "red" },
        },
      ],
      edges: [
        {
          id: "e",
          sourceId: "a",
          targetId: "__proto__",
          label: null,
          sourcePort: "p",
          weight: 0,
          data: ["edge"],
        },
        {
          id: "loop",
          sourceId: "a",
          targetId: "a",
          mode: "directed",
          data: null,
        },
      ],
    });
    const source = toGraphSON(graph);
    expect(source["@type"]).toBe("tinker:graph");
    expect(source["@value"].vertices[0]["@value"].label).toBe("vertex");
    expect(
      getPersisted(
        getNativeDocumentGraph(fromGraphSON(source), "graphson", source),
      ),
    ).toEqual(getPersisted(graph));
    const doc = getPersisted(graphsonDocumentConverter.from(source));
    expect(graphsonDocumentConverter.to(doc)).toEqual(source);
    doc.graph!.nodes[1].label = "Changed";
    expect(
      graphsonDocumentConverter.to(doc)["@value"].edges[0]["@value"].inVLabel,
    ).toBe("Changed");
    doc.graph!.nodes[1].data = { native: "changed user" };
    expect(
      fromGraphSON(graphsonDocumentConverter.to(doc)).nodes[1].data,
    ).toEqual({ native: "changed user" });
  });
  it("complete foreign source/property IDs, multi/meta-properties, typed maps/sets and unknown extensions survive JSON persistence", () => {
    const source = createNative(),
      doc = getPersisted(graphsonDocumentConverter.from(source));
    expect(doc.graph!.nodes).toHaveLength(3);
    expect(new Set(doc.graph!.nodes.map((node) => node.id)).size).toBe(3);
    expect(doc.graph!.nodes[0].data.properties.name[0]["@value"].id).toBe("p1");
    expect(
      doc.graph!.nodes[0].data.properties.name[0]["@value"].properties.origin,
    ).toBe("native");
    expect(graphsonDocumentConverter.to(doc)).toEqual(source);
    expect(toGraphSON(fromGraphSON(source))).toEqual(source);
    doc.graph!.nodes[0].label = "updated";
    const output = graphsonDocumentConverter.to(doc);
    expect(output["@value"].vertices[0]["@value"].properties).toEqual(
      source["@value"].vertices[0]["@value"].properties,
    );
    expect(output["@value"].edges[0]["@value"].outVLabel).toBe("updated");
    expect(output["@value"].edges[0]["@value"].properties!.custom).toEqual(
      source["@value"].edges[0]["@value"].properties!.custom,
    );
  });
  it("existing property-value edits preserve property identity, multiplicity, metadata and foreign fields", () => {
    const source = createNative(),
      doc = graphsonDocumentConverter.from(source);
    doc.graph!.nodes[0].data.properties.name[1]["@value"].value = "Updated";
    const output = graphsonDocumentConverter.to(doc);
    expect(
      output["@value"].vertices[0]["@value"].properties!.name[1]["@value"],
    ).toEqual({ id: "p2", label: "name", value: "Updated" });
    expect(output["@value"].vertices[0]["@value"].properties!.name[0]).toEqual(
      source["@value"].vertices[0]["@value"].properties!.name[0],
    );
    doc.graph!.nodes[0].data.properties.name[0]["@value"].properties.origin =
      "edit";
    expect(graphsonDocumentConverter.getUpdate(doc).ok).toBe(false);
  });
  it("native source edits are authoritative, independent source reorder/additions and Graph labels coexist, conflicts reject", () => {
    const source = createNative(),
      doc = graphsonDocumentConverter.from(source);
    doc.source["@value"].vertices.reverse();
    doc.source["@value"].vertices.push(
      getTyped("g:Vertex", { id: "isolated", label: "isolated", extra: true }),
    );
    doc.graph!.nodes[0].label = "Graph";
    const output = graphsonDocumentConverter.to(doc);
    expect(output["@value"].vertices.map((node) => node["@value"].id)).toEqual(
      doc.source["@value"].vertices.map((node) => node["@value"].id),
    );
    expect(output["@value"].vertices[2]["@value"].label).toBe("Graph");
    const conflict = graphsonDocumentConverter.from(source);
    conflict.source["@value"].vertices[0]["@value"].label = "Native";
    conflict.graph!.nodes[0].label = "Graph";
    expect(graphsonDocumentConverter.getUpdate(conflict).ok).toBe(false);
  });
  it("source JSON data edits override snapshot payload; native weight edits retain separate user data", () => {
    const source = toGraphSON(
      createGraph<any, any>({
        nodes: [
          { id: "a", data: 1 },
          { id: "b", data: { old: true } },
        ],
        edges: [{ id: "e", sourceId: "a", targetId: "b", data: 42, weight: 2 }],
      }),
    );
    source["@value"].vertices[0]["@value"].properties!.data[0]["@value"].value =
      '{"new":true}';
    source["@value"].vertices[1]["@value"].properties!.data[0]["@value"].value =
      "3";
    source["@value"].edges[0]["@value"].properties!.weight["@value"].value[
      "@value"
    ] = 4;
    const graph = fromGraphSON(source);
    expect(graph.nodes.map((node) => node.data)).toEqual([{ new: true }, 3]);
    expect(graph.edges[0].weight).toBe(4);
    expect(graph.edges[0].data).toBe(42);
    expect(toGraphSON(graph)).toEqual(source);
  });
  it("added unknown native properties survive label patches without replacing original user payload", () => {
    const source = toGraphSON(
      createGraph({ nodes: [{ id: "a", data: 42, label: "A" }] }),
    );
    source["@value"].vertices[0]["@value"].properties!.extra = [
      getTyped("g:VertexProperty", {
        id: "extra",
        label: "extra",
        value: "retained",
      }),
    ];
    const doc = graphsonDocumentConverter.from(source);
    expect(doc.graph!.nodes[0].data.graphData).toBe(42);
    doc.graph!.nodes[0].label = "Changed";
    expect(
      graphsonDocumentConverter.to(doc)["@value"].vertices[0]["@value"]
        .properties!.extra[0]["@value"].value,
    ).toBe("retained");
    doc.graph!.nodes[0].data.graphData = 3;
    expect(graphsonDocumentConverter.getUpdate(doc).ok).toBe(false);
  });
  it.each([
    ["g:Int32", -2147483648],
    ["g:Int64", "-9223372036854775808"],
    ["gx:BigInteger", "123456789012345678901234567890123456789"],
    ["g:UUID", "12345678-1234-1234-1234-123456789ABC"],
  ] as const)(
    "exact typed ID %s:%s is not coerced through JavaScript",
    (type, value) => {
      const source = getTyped("tinker:graph", {
        vertices: [
          getTyped("g:Vertex", { id: getTyped(type, value), label: "vertex" }),
        ],
        edges: [],
      });
      const graph = fromGraphSON(source);
      expect(graph.nodes[0].id).toContain(type);
      expect(toGraphSON(graph)).toEqual(source);
    },
  );
  it("aliases in runtime JSON objects serialize by value, while cycles/accessors/symbols/sparse arrays reject", () => {
    const id = getTyped("g:Int32", 1),
      source = getTyped("tinker:graph", {
        vertices: [getTyped("g:Vertex", { id, label: "one" })],
        edges: [
          getTyped("g:Edge", { id: "loop", outV: id, inV: id, label: "loop" }),
        ],
      });
    expect(fromGraphSON(source).edges).toHaveLength(1);
    const invalid: any[] = [];
    const cyclic = createNative();
    (cyclic as any).cycle = cyclic;
    invalid.push(cyclic);
    const getter = createNative();
    let called = false;
    Object.defineProperty(getter, "hidden", {
      enumerable: true,
      get() {
        called = true;
        return 1;
      },
    });
    invalid.push(getter);
    const symbol = createNative();
    (symbol as any)[Symbol("unknown")] = 1;
    invalid.push(symbol);
    const nonenum = createNative();
    Object.defineProperty(nonenum, "hidden", { value: 1 });
    invalid.push(nonenum);
    const sparse = createNative();
    delete sparse["@value"].vertices[0];
    invalid.push(sparse);
    const custom = createNative();
    (custom["@value"].vertices as any).extra = true;
    invalid.push(custom);
    for (const value of invalid) expect(() => fromGraphSON(value)).toThrow();
    expect(called).toBe(false);
  });
  it("invalid matching private protocol is ordinary data; metadata opt-out and native-carrier opt-out are explicit", () => {
    const source = toGraphSON(
      createGraph({ nodes: [{ id: "a", label: "A" }] }),
    );
    const marker = JSON.parse(source["@value"].__statelyai);
    marker.original.nodes[0].label = 42;
    source["@value"].__statelyai = JSON.stringify(marker);
    const graph = fromGraphSON(source);
    expect(graph.nodes[0].label).toBe("A");
    expect(toGraphSON(graph)).toEqual(source);
    const emitted = toGraphSON(
      createGraph({ id: "original", nodes: [{ id: "a", label: null }] }),
    );
    const native = fromGraphSON(emitted, { metadata: "native" });
    expect(native.nodes[0].label).toBe("vertex");
    expect(native.id).toBe("");
    expect(
      toGraphSON(native, { nativeCarrier: false })["@value"].vertices[0][
        "@value"
      ].id,
    ).toBe(native.nodes[0].id);
  });
  it.each(["mode", "weight", "nodes", "data"] as const)(
    "unrepresentable Graph edit %s receives a diagnostic rather than stale source",
    (field) => {
      const source = toGraphSON(
          createGraph({
            nodes: [{ id: "a" }, { id: "b" }],
            edges: [{ id: "e", sourceId: "a", targetId: "b", weight: 1 }],
          }),
        ),
        doc = graphsonDocumentConverter.from(source);
      if (field === "mode") doc.graph!.mode = "undirected";
      else if (field === "weight") doc.graph!.edges[0].weight = 2;
      else if (field === "nodes") doc.graph!.nodes.reverse();
      else doc.graph!.data = { root: "changed" };
      expect(graphsonDocumentConverter.getUpdate(doc).ok).toBe(false);
      expect(() => graphsonDocumentConverter.to(doc)).toThrow();
    },
  );
  it.each([
    null,
    1,
    { "@type": "g:Graph", "@value": {} },
    { vertices: [], edges: [] },
    {
      "@type": "tinker:graph",
      "@value": { vertices: [], edges: [] },
      bad: undefined,
    },
  ])("unsupported profile/non-JSON source rejects %#", (source) =>
    expect(() => fromGraphSON(source as any)).toThrow(),
  );
  it.each(["version", "profile"] as const)(
    "unsupported explicit %s rejects on import and export",
    (key) => {
      const options =
        key === "version" ? { version: 2 } : { profile: "adjacency" };
      expect(() => fromGraphSON(createNative(), options as any)).toThrow(
        "profile",
      );
      expect(() => toGraphSON(createGraph({}), options as any)).toThrow(
        "profile",
      );
    },
  );
  it.each([
    getTyped("g:Int64", 9007199254740992),
    getTyped("g:Int64", "9223372036854775808"),
    getTyped("g:Int32", 2147483648),
    getTyped("gx:BigInteger", 9007199254740992),
    getTyped("g:UUID", "invalid"),
    null,
    1,
    true,
    getTyped("vendor:id", "one"),
  ])("unsupported/malformed exact identity rejects %#", (id) => {
    const source = getTyped("tinker:graph", {
      vertices: [getTyped("g:Vertex", { id, label: "v" })],
      edges: [],
    });
    expect(() => fromGraphSON(source)).toThrow();
    const doc = graphsonDocumentConverter.from(source);
    expect(doc.graph).toBeNull();
    expect(graphsonDocumentConverter.to(getPersisted(doc))).toEqual(source);
  });
  it("typed duplicate/dangling/property collisions and malformed collections reject", () => {
    const cases: any[] = [];
    const duplicate = createNative();
    duplicate["@value"].vertices.push(
      getPersisted(duplicate["@value"].vertices[0]),
    );
    cases.push(duplicate);
    const edge = createNative();
    edge["@value"].edges.push(getPersisted(edge["@value"].edges[0]));
    cases.push(edge);
    const dangling = createNative();
    dangling["@value"].edges[0]["@value"].inV = "absent";
    cases.push(dangling);
    const properties = createNative();
    properties["@value"].vertices[0]["@value"].properties!.name[1][
      "@value"
    ].id = "p1";
    cases.push(properties);
    const mismatch = createNative();
    mismatch["@value"].vertices[0]["@value"].properties!.name[0][
      "@value"
    ].label = "wrong";
    cases.push(mismatch);
    const map = createNative();
    map["@value"].vertices[0]["@value"].properties!.typed[0]["@value"].value[
      "@value"
    ].pop();
    cases.push(map);
    for (const source of cases) expect(() => fromGraphSON(source)).toThrow();
  });
  it("native graph mutation never mutates imported source; opaque unavailable documents replay exact JSON", () => {
    const source = createNative(),
      before = getPersisted(source),
      graph = fromGraphSON(source);
    graph.nodes[0].data.properties.name[0]["@value"].value = "graph mutation";
    expect(source).toEqual(before);
    const unsupported = getTyped("g:Graph", { untouched: ["opaque", null] }),
      doc = graphsonDocumentConverter.from(unsupported);
    expect(doc.graph).toBeNull();
    expect(graphsonDocumentConverter.to(getPersisted(doc))).toEqual(
      unsupported,
    );
  });
  it.each(["undirected", "bidirectional"] as const)(
    "fresh %s mode rejects; empty labels and unsafe JSON controls reject",
    (mode) => {
      expect(() => toGraphSON(createGraph({ mode }))).toThrow("directed");
      expect(() =>
        toGraphSON(createGraph({ nodes: [{ id: "a", label: "" }] })),
      ).toThrow("nonempty");
      expect(() => toGraphSON(createGraph({ data: -0 }))).toThrow(
        "signed-zero",
      );
    },
  );
});

it('requires authored identities and retains an empty native string ID in its encoded namespace', () => {
  const source = getTyped('tinker:graph', {vertices:[getTyped('g:Vertex',{id:'',label:'Empty ID'})],edges:[]});
  const graph = fromGraphSON(source); expect(graph.nodes[0].id).not.toBe(''); expect(toGraphSON(graph)).toEqual(source);
  delete source['@value'].vertices[0]['@value'].id;
  expect(() => fromGraphSON(source)).toThrow('missing own id');
});
