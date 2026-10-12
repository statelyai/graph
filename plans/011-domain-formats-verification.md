# Domain-format follow-up verification

Follow-up to merged PR53, reviewed 2026-10-12. Dedicated worktree
`/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, branch
`feature/domain-formats`; shared checkout preserved. Initial main base
`8d1b139`; advanced to current main `5141455` (version-only release) before
final verification.

## Scope

Four explicit domain mappings: DGML, CX2, GraphSON3 typed TinkerGraph objects,
and RDF1.1 datasets plus N-Triples/N-Quads/Turtle/TriG syntax. Five package
subpaths have runtime/declaration contracts. RDF dataset, GraphSON and CX2
modules remain dependency-free; DGML uses optional fast-xml-parser and RDF
syntax uses optional N3.

The identity audit reproduced wrong-target concurrent-source edits in thirteen
existing converters: DOT, TGF, Graphviz JSON, GraphML, GEXF, GML, D3,
Cytoscape, JGF, Graphology, NetworkX, PlantUML and Pajek. New DGML has the
same positional-identity boundary. Fixes reject ambiguous pending Graph edits
with `ambiguous-native-identity` and an entity path. Explicit IDs must establish
correspondence in both source snapshots; current-only declarations cannot
retroactively validate generated IDs. Occurrence-indexed private metadata cannot
identify an inserted parallel relationship. Source-only edits and verified stable
identities retain their documented behavior.

## Reviewer gates

- `pnpm install --frozen-lockfile`: passed with project pnpm10.28.2.
- `pnpm verify` on actual Node24.17.0: passed; 4,273 core tests / 111 files,
  source/repository types, generated-schema/convention checks, build, publint,
  packed runtime/type smoke including every added subpath.
- Actual Node20.20.2 core run: 4,273 tests / 111 files passed.
- Actual Node24.17.0 combined native/coverage run: 4,532 tests / 133 files passed,
  including 259 tests in native-validation suites. All committed coverage floors passed.
- Converter coverage: 96.78% lines, 86.92% branches, 95.42% functions,
  92.54% statements. Existing global thresholds were not lowered.
- Both legacy identity suites pass: 83 regressions/positive controls. New DGML
  identity controls also pass within its format suite.
- Focused executor checks: all source/repository types and conventions pass;
  no core/API redesign required. Reviewer reran the complete sequential gates.
- Shared checkout retains only its pre-existing untracked `docs/meta.json`.

Native tooling used isolated Python3.14.8 with pinned requirements and Java
21.0.12.1 / PlantUML1.2026.8. The first executor PlantUML command failed because
the new worktree lacked its default Java path; explicit existing pinned-runtime
overrides resolved it. Final combined validation uses those same overrides and
passes. No global runtime changes were made by this task.

## Per-converter code coverage

Measured by the final combined suite; source modules listed separately where
they provide distinct parsing, emission or document behavior. Export barrels
omitted. Values characterize code execution, not grammar completeness.

<!-- final combined coverage-summary.json, captured by reviewer -->

| Module | Lines % | Branches % |
| --- | ---: | ---: |
| adjacency-list/index.ts | 97.67 | 89.18 |
| adjacency-matrix/index.ts | 97.95 | 92.04 |
| converter/index.ts | 100.00 | 100.00 |
| csv/index.ts | 99.40 | 89.10 |
| cx2/index.ts | 93.72 | 88.67 |
| cytoscape/index.ts | 98.14 | 95.95 |
| d2/emitter.ts | 92.00 | 78.32 |
| d2/index.ts | 100.00 | 100.00 |
| d2/parser.ts | 91.88 | 75.73 |
| d3/index.ts | 97.22 | 87.17 |
| dgml/index.ts | 92.45 | 85.77 |
| document/index.ts | 98.74 | 90.08 |
| dot/document.ts | 100.00 | 87.43 |
| dot/index.ts | 97.77 | 90.54 |
| drawio/index.ts | 100.00 | 82.29 |
| edge-list/index.ts | 87.50 | 86.66 |
| elk/index.ts | 99.53 | 93.18 |
| gexf/index.ts | 99.20 | 92.75 |
| gml/document.ts | 100.00 | 84.61 |
| gml/index.ts | 98.55 | 93.03 |
| graphlib/index.ts | 98.75 | 94.64 |
| graphml/index.ts | 99.28 | 94.21 |
| graphology/index.ts | 98.73 | 86.15 |
| graphson/index.ts | 93.75 | 87.39 |
| graphviz-json/index.ts | 99.31 | 88.88 |
| index.ts | 100.00 | 100.00 |
| jgf/index.ts | 99.00 | 95.43 |
| matrix-market/index.ts | 96.89 | 83.13 |
| mermaid/architecture.ts | 100.00 | 88.52 |
| mermaid/block.ts | 95.52 | 80.95 |
| mermaid/c4.ts | 98.64 | 83.66 |
| mermaid/class-diagram.ts | 92.37 | 80.20 |
| mermaid/document.ts | 100.00 | 89.65 |
| mermaid/er-diagram.ts | 98.90 | 82.89 |
| mermaid/flowchart.ts | 92.87 | 80.51 |
| mermaid/git-graph.ts | 100.00 | 90.37 |
| mermaid/index.ts | 100.00 | 100.00 |
| mermaid/ishikawa.ts | 100.00 | 85.71 |
| mermaid/mindmap.ts | 100.00 | 89.55 |
| mermaid/profile-shared.ts | 100.00 | 87.50 |
| mermaid/requirement.ts | 100.00 | 89.21 |
| mermaid/sankey.ts | 100.00 | 88.09 |
| mermaid/sequence.ts | 95.32 | 83.08 |
| mermaid/shared.ts | 99.13 | 93.16 |
| mermaid/state.ts | 98.45 | 88.55 |
| mermaid/use-case.ts | 100.00 | 85.71 |
| networkx/index.ts | 98.87 | 96.59 |
| pajek/index.ts | 98.73 | 84.21 |
| plantuml/index.ts | 100.00 | 84.81 |
| preservation.ts | 93.63 | 77.52 |
| rdf/index.ts | 98.90 | 94.63 |
| rdf/syntax.ts | 97.46 | 83.87 |
| structured-json.ts | 96.99 | 87.50 |
| tgf/index.ts | 97.82 | 88.88 |
| xml-document.ts | 98.25 | 88.68 |
| xyflow/index.ts | 97.77 | 96.26 |


## Independent native evidence

| Profile | Validator | Evidence and limits |
| --- | --- | --- |
| GraphSON3 `tinker:graph` | Apache TinkerPop Java3.8.2; Gremlin JavaScript3.8.2 | Actual registered mapper reads topology, ID classes, unsafe magnitudes, multi/meta-properties, maps/sets and patched values. Java establishes whole-graph registry behavior. NDJSON/writeGraph/other providers remain outside scope. |
| DGML2009 | Official Microsoft XSD through libxml2; XML DOM | Selected native/emitted schema profiles and attribute normalization. Published XSD rejects dynamic property attributes documented by Microsoft; CLR property mapping is separately scoped. No Visual Studio renderer claim. |
| CX2 version2.0 | Maintained NDEx ndex2 3.12.0 | Topology, declarations/defaults and attributes. Reader omission of false/zero defaults and null typed values has negative controls. Adapter applies falsy defaults; null typed values reject projection. Visual/custom aspects remain opaque. |
| RDF1.1 | N3 2.13.12; independent RDFLib7.6.0 | Strict grammars, scoped blank-node dataset isomorphism and lexical/datatype/language fields. Native parser events observe empty-graph declarations and tag case before unchanged store equality normalizes them. Numeric shorthand normalization is outside author-profile proof. |

TinkerPop setup downloads twelve SHA256-pinned official Maven artifacts; no
development oracle enters runtime imports or the published package. Native
subprocess deadlines and existing global coverage floors remain unchanged.

## Preservation contract

Coverage measures executed code, not native-language grammar completeness.
No converter claims unrestricted 100% Graph/native semantic round-tripping.
Documents retain supplied source text or native JSON values exactly on unchanged
export after JSON persistence, including comments, ordering and opaque fields.
Projection can be partial or null. Supported edits require native identity and
reparse proof; unsupported/conflicting edits reject. Explicit regeneration can
change comments/spelling/blank IDs and reports losses. File-byte encodings and
runtime object alias identity lie outside string/JSON APIs.

Strict new profiles reject incompatible modes, identities, Graph-only fields or
types rather than guessing. GraphSON's string marker preserves additional Graph
fields as an application convention; a native TinkerPop rewrite discards it.
DGML native links lack stable IDs; `edgeIds: 'positional'` is an explicit identity
normalization choice. CX2 declarations govern types and all-node coordinates.
RDF subjects/objects are term nodes; edges retain exact predicates/graph names,
including scoped blanks and empty named graphs. It does not provide reasoning.

N3's explicit `^^rdf:dirLangString` RDF1.1 parser gap is tested/documented;
DTO/emission retain that ordinary datatype and unsupported syntax documents
retain exact source with unavailable projection. RDF IRI/language checks cover
the documented lexical profile, not a full RFC3987/registered-tag validator.

## Deferred representations

JSON-LD remote-context/asynchronous processing, RDF/XML, RDF1.2 terms,
GraphSON1/2/adjacency formats and graph6/digraph6/sparse6 remain separate work.
RDF syntax parsing/emission stays synchronous. These representations are not
advertised as implemented.

See the original [verification report](005-final-verification.md) for historical
PR53 evidence and the unchanged non-domain native-validator scopes.
See [native validation](../docs/native-validation.md),
[support inventory](../src/formats/support.ts), affected format READMEs and
plans006–010 for the precise mapped profiles and regression scopes.
