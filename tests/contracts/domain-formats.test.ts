import { describe, expect, it } from "vitest";
import { createGraph } from "../../src/graph";
import * as graphson from "../../src/formats/graphson";
import * as cx2 from "../../src/formats/cx2";
import * as dgml from "../../src/formats/dgml";
import * as rdf from "../../src/formats/rdf";
import * as syntax from "../../src/formats/rdf/syntax";
const contracts: Record<string, string> = {
  fromGraphSON: "Typed source/core/document validation and actual Java oracle",
  toGraphSON:
    "Directed immutable/repeatable fixture contracts plus Java oracle",
  fromCX2: "Numeric identity/declaration/default corpus and NDEx actual reader",
  toCX2: "Canonical profile, unsupported state rejection and native edits",
  fromDGML: "Category/containment/inferred endpoint corpus and official XSD",
  toDGML: "Explicit positional identity option and unsupported state rejection",
  getRDFTerm: "Domain value validator: term roles and malformed controls",
  getRDFTermId:
    "Domain value identity converter: scoped blanks and language/datatype",
  getRDFQuadId: "Domain quad identity converter: role order and set semantics",
  fromRDFDataset: "RDF1.1 term/dataset corpus and independent isomorphism",
  toRDFDataset: "Derived identity profile and arbitrary Graph rejection",
  fromRDF: "Required explicit syntax/options and independent RDFLib parsing",
  toRDF: "Required explicit syntax/options and native dataset/loss controls",
  createRDFDocumentConverter:
    "Explicit syntax factory: persisted source and unsupported edits",
};
describe("domain adapter public contract inventory", () => {
  it("all public functions have a specific domain contract", () => {
    const names = [graphson, cx2, dgml, rdf, syntax]
      .flatMap((module) =>
        Object.entries(module)
          .filter(([, value]) => typeof value === "function")
          .map(([name]) => name),
      )
      .sort();
    expect(names).toEqual(Object.keys(contracts).sort());
    for (const description of Object.values(contracts))
      expect(description.length).toBeGreaterThan(30);
  });
  it.each(["empty", "isolates", "loop", "parallel"] as const)(
    "GraphSON %s immutable and repeatable",
    (kind) => {
      const graph = createGraph({
        nodes: kind === "empty" ? [] : [{ id: "a" }, { id: "b" }],
        edges:
          kind === "loop"
            ? [{ id: "loop", sourceId: "a", targetId: "a" }]
            : kind === "parallel"
              ? [
                  { id: "e1", sourceId: "a", targetId: "b" },
                  { id: "e2", sourceId: "a", targetId: "b" },
                ]
              : [],
      });
      const before = JSON.stringify(graph),
        source = graphson.toGraphSON(graph);
      const restored = graphson.fromGraphSON(source);
      expect(restored.nodes).toEqual(graph.nodes);
      expect(restored.edges).toEqual(graph.edges);
      expect(graphson.toGraphSON(graph)).toEqual(source);
      expect(JSON.stringify(graph)).toBe(before);
    },
  );
});
