import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGraph } from "../../src/graph";
import {
  fromGraphSON,
  toGraphSON,
  graphsonDocumentConverter,
  type GraphSONGraph,
} from "../../src/formats/graphson";
import { getGraphSONOracle } from "./graphson-oracle";
import { createRequire } from "node:module";
const gremlin = createRequire(import.meta.url)("gremlin");
function getTyped(type: string, value: any): any {
  return { "@type": type, "@value": value };
}
describe("Apache TinkerPop3.8.2 GraphSON3 TinkerIoRegistryV3 actual Java reader", () => {
  it("official modern graph fixture reads six vertices/edges with native categories, directions and typed property identity", async () => {
    const bytes = await readFile(
        new URL("./fixtures/graphson/modern.json", import.meta.url),
      ),
      provenance = JSON.parse(
        await readFile(
          new URL("./fixtures/graphson/provenance.json", import.meta.url),
          "utf8",
        ),
      );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      provenance.sha256,
    );
    const source = JSON.parse(bytes.toString()) as GraphSONGraph,
      native = await getGraphSONOracle(source);
    expect(native.version).toBe("3.8.2");
    expect(native.vertices).toHaveLength(6);
    expect(native.edges).toHaveLength(6);
    expect(native.edges.find((edge: any) => edge.id === "7")).toMatchObject({
      source: "1",
      target: "2",
      label: "knows",
    });
    expect(
      native.vertices
        .find((node: any) => node.id === "1")
        .properties.find((property: any) => property.key === "name"),
    ).toMatchObject({ value: '"marko"', valueClass: "java.lang.String" });
    const doc = JSON.parse(
      JSON.stringify(graphsonDocumentConverter.from(source)),
    );
    expect(graphsonDocumentConverter.to(doc)).toEqual(source);
    doc.graph.nodes[0].label = "updated-category";
    const changed = await getGraphSONOracle(graphsonDocumentConverter.to(doc));
    expect(changed.vertices.find((node: any) => node.id === "1").label).toBe(
      "updated-category",
    );
    expect(changed.edges).toHaveLength(6);
  });
  it("fresh Graph emits actual native directed parallels, loops, isolates, string identities and JSON data convention", async () => {
    const graph = createGraph<any, any, any>({
      data: [null, "root"],
      nodes: [
        { id: "a", label: null, data: { text: "雪", native: true } },
        { id: "b", label: "Target", data: 42 },
        { id: "isolated", label: "Isolated" },
      ],
      edges: [
        { id: "e0", sourceId: "a", targetId: "b", weight: 2 },
        { id: "e1", sourceId: "a", targetId: "b", weight: 0 },
        { id: "loop", sourceId: "a", targetId: "a", label: "Loop" },
      ],
    });
    const source = toGraphSON(graph),
      native = await getGraphSONOracle(source);
    expect(native.vertices.map((node: any) => node.id).sort()).toEqual([
      "a",
      "b",
      "isolated",
    ]);
    expect(
      native.edges
        .map((edge: any) => [edge.id, edge.source, edge.target])
        .sort(),
    ).toEqual([
      ["e0", "a", "b"],
      ["e1", "a", "b"],
      ["loop", "a", "a"],
    ]);
    const blob = native.vertices
      .find((node: any) => node.id === "a")
      .properties.find((property: any) => property.key === "data");
    expect(JSON.parse(JSON.parse(blob.value))).toEqual(graph.nodes[0].data);
    expect(blob.valueClass).toBe("java.lang.String");
    expect(
      native.edges
        .find((edge: any) => edge.id === "e1")
        .properties.find((property: any) => property.key === "weight").value,
    ).toContain('"@value":0.0');
    const doc = graphsonDocumentConverter.from(source);
    doc.graph!.nodes[0].data = { changed: true };
    const edited = await getGraphSONOracle(graphsonDocumentConverter.to(doc));
    expect(
      JSON.parse(
        JSON.parse(
          edited.vertices
            .find((node: any) => node.id === "a")
            .properties.find((property: any) => property.key === "data").value,
        ),
      ),
    ).toEqual({ changed: true });
  });
  it("native string/Int32/Int64 IDs remain distinct; unsafe Int64 and BigDecimal retain exact native magnitude", async () => {
    const ids = [
      "1",
      getTyped("g:Int32", 1),
      getTyped("g:Int64", "1"),
      getTyped("g:Int64", "9007199254740993"),
    ];
    const source = getTyped("tinker:graph", {
      vertices: ids.map((id, index) =>
        getTyped("g:Vertex", {
          id,
          label: `v${index}`,
          ...(index === 3 && {
            properties: {
              precise: [
                getTyped("g:VertexProperty", {
                  id: "p",
                  label: "precise",
                  value: getTyped("gx:BigDecimal", "1.234567890123456789"),
                  properties: { origin: "exact" },
                }),
              ],
            },
          }),
        }),
      ),
      edges: [
        getTyped("g:Edge", {
          id: "e",
          outV: ids[1],
          inV: ids[2],
          outVLabel: "v1",
          inVLabel: "v2",
          label: "typed",
        }),
      ],
    });
    const native = await getGraphSONOracle(source);
    expect(native.vertices).toHaveLength(4);
    expect(
      new Set(native.vertices.map((node: any) => `${node.type}:${node.id}`))
        .size,
    ).toBe(4);
    const large = native.vertices.find(
      (node: any) => node.id === "9007199254740993",
    );
    expect(large.type).toBe("java.lang.Long");
    expect(large.properties[0]).toMatchObject({
      valueClass: "java.math.BigDecimal",
      meta: [{ key: "origin", value: '"exact"' }],
    });
    expect(large.properties[0].value).toContain("1.234567890123456789");
    expect(native.roundTrip).toContain("9007199254740993");
    expect(
      new Set(fromGraphSON(source).nodes.map((node) => node.id)).size,
    ).toBe(4);
    expect(toGraphSON(fromGraphSON(source))).toEqual(source);
  });
  it("native typed maps with non-string keys, sets, multi-properties/meta-properties and property IDs are observed", async () => {
    const source = getTyped("tinker:graph", {
      vertices: [
        getTyped("g:Vertex", {
          id: "a",
          label: "Person",
          properties: {
            name: [
              getTyped("g:VertexProperty", {
                id: "p1",
                label: "name",
                value: "Alpha",
                properties: { origin: "first" },
              }),
              getTyped("g:VertexProperty", {
                id: "p2",
                label: "name",
                value: "Beta",
              }),
            ],
            map: [
              getTyped("g:VertexProperty", {
                id: "p3",
                label: "map",
                value: getTyped("g:Map", [
                  getTyped("g:Int32", 1),
                  "integer",
                  "1",
                  getTyped("g:Set", ["x", "y"]),
                ]),
              }),
            ],
          },
        }),
      ],
      edges: [],
    });
    const native = await getGraphSONOracle(source);
    expect(
      native.vertices[0].properties
        .filter((property: any) => property.key === "name")
        .map((property: any) => property.id)
        .sort(),
    ).toEqual(["p1", "p2"]);
    expect(
      native.vertices[0].properties.find(
        (property: any) => property.key === "map",
      ),
    ).toMatchObject({ valueClass: "java.util.LinkedHashMap" });
    const doc = graphsonDocumentConverter.from(source);
    doc.graph!.nodes[0].data.properties.name[1]["@value"].value = "Changed";
    const changed = await getGraphSONOracle(graphsonDocumentConverter.to(doc));
    expect(
      changed.vertices[0].properties.find(
        (property: any) => property.id === "p2",
      ).value,
    ).toBe('"Changed"');
    expect(
      changed.vertices[0].properties.find(
        (property: any) => property.id === "p1",
      ).meta,
    ).toEqual([{ key: "origin", value: '"first"' }]);
  });
  it("maintained JavaScript reader independently decodes supported typed graph elements and collections; wholeGraph registry is Java only", () => {
    const reader = new gremlin.structure.io.GraphSON3Reader(),
      value = reader.read(
        getTyped("g:Map", [
          getTyped("g:Int32", 1),
          "integer",
          "1",
          getTyped("g:Set", ["x", "y"]),
        ]),
      );
    expect(value).toBeInstanceOf(Map);
    expect(value.get(1)).toBe("integer");
    expect(value.get("1")).toBeInstanceOf(Set);
    expect([...value.get("1")]).toEqual(["x", "y"]);
    const vertex = reader.read(
        getTyped("g:Vertex", { id: "a", label: "Person" }),
      ),
      edge = reader.read(
        getTyped("g:Edge", {
          id: "e",
          outV: "a",
          inV: "a",
          outVLabel: "Person",
          inVLabel: "Person",
          label: "loop",
        }),
      );
    expect(vertex.id).toBe("a");
    expect(vertex.label).toBe("Person");
    expect(edge.outV.id).toBe("a");
    expect(edge.inV.id).toBe("a");
  });
});
