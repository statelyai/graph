# Conversion fidelity verification

Reviewed 2026-10-12, integration base `de5ebf8`, branch `feature/conversion-fidelity`.

## Final gates

- `pnpm verify`: passed; 3,994 core tests, source/repository types, generated checks, conventions, build, publint, packed runtime/types.
- Actual Node 20.20.2: 3,994 core tests / 103 files passed.
- Actual Node 24.15.0: 4,222 combined core/native tests / 121 files passed; all committed coverage floors passed.
- Converter coverage: 97.10% lines, 86.44% branches, 95.23% functions, 92.26% statements.
- Shared checkout preserved; only its pre-existing untracked `docs/meta.json` remains.

One concurrent full-gate run exceeded the default five-second limit on a 10,000-edge matrix test. The exact isolated test completed in 1.42s. Its test-specific timeout now matches other large-workload tests at 30s; assertions, global limits and native subprocess limits remain unchanged. The sequential full gate and final Node 20 run passed.

## Interpretation

These percentages measure executed converter code, **not native grammar coverage**. No bare Graph converter claims unrestricted 100% Graph/native losslessness. GraphDocument retains supplied source strings/native JSON values exactly on unchanged export after JSON persistence, including unsupported constructs and comments. Projection can be partial/null. Supported edits preserve surrounding source and require reparse proof; unsupported/conflicting edits reject. Explicit regeneration reports losses. Original file byte encoding lies outside string/JSON APIs.

## Per-converter code coverage

Measured from the final combined suite. D2 parser/emitter shown separately; export-only barrels omitted.

| Converter | Lines % | Branches % |
| --- | ---: | ---: |
| Adjacency list | 97.67 | 89.18 |
| Adjacency matrix | 97.95 | 92.04 |
| CSV/TSV | 99.40 | 89.10 |
| Cytoscape | 98.14 | 94.94 |
| D2 parser | 91.88 | 75.73 |
| D2 emitter | 92.00 | 78.32 |
| D3 | 97.22 | 87.17 |
| Document API | 98.74 | 87.60 |
| DOT | 97.53 | 90.35 |
| draw.io | 100.00 | 82.29 |
| Edge list | 87.50 | 86.66 |
| ELK | 99.53 | 93.18 |
| GEXF | 99.20 | 92.75 |
| GML | 98.19 | 92.28 |
| Graphlib JSON | 98.75 | 94.64 |
| GraphML | 99.28 | 94.21 |
| Graphology JSON | 98.73 | 86.15 |
| Graphviz JSON | 100.00 | 88.61 |
| JGF | 99.00 | 95.43 |
| Matrix Market | 96.89 | 83.13 |
| Mermaid Architecture | 100.00 | 88.52 |
| Mermaid Block | 95.52 | 80.95 |
| Mermaid C4 | 98.64 | 83.66 |
| Mermaid Class | 92.37 | 80.20 |
| Mermaid ER | 98.90 | 82.89 |
| Mermaid Flowchart | 92.87 | 80.51 |
| Mermaid GitGraph | 100.00 | 90.37 |
| Mermaid Ishikawa | 100.00 | 85.71 |
| Mermaid Mindmap | 100.00 | 89.55 |
| Mermaid Requirement | 100.00 | 89.21 |
| Mermaid Sankey | 100.00 | 88.09 |
| Mermaid Sequence | 95.32 | 83.08 |
| Mermaid State | 98.45 | 88.55 |
| Mermaid UseCase | 100.00 | 85.71 |
| NetworkX node-link | 98.87 | 96.59 |
| Pajek | 98.68 | 83.81 |
| PlantUML | 100.00 | 83.74 |
| TGF | 97.82 | 88.88 |
| xyflow | 97.77 | 96.26 |

## Native evidence and limits

Pinned native parsers/runtime libraries, official schemas and independently authored fixtures supplement converter tests. See [native validation](../docs/native-validation.md), [support inventory](../src/formats/support.ts) and each format README for exact scope.

- Mermaid 12.1.0: fourteen scoped dialects, database semantics and decoded display text. Sankey is ASCII/trimmed-name scoped; C4 reverse directions normalized and duplicate ordered native relation pairs reject.
- D2 0.1.33: actual compiler graph/diagram semantics; opaque imports/substitutions do not become fabricated Graph semantics.
- Graphviz 15.0.0: actual DOT and JSON output; `fdp` cluster endpoints independently verified. JSON is an output profile, with no native JSON input reader.
- GraphML/GEXF/JGF: byte-pinned official schemas with unchanged upstream limitations; standard XML/JGF profiles are explicit options. Schema acceptance alone does not prove full semantics.
- CSV, Graphology, Graphlib, NetworkX, Cytoscape, D3 and ELK: independent reader/runtime assertions for documented mappings.
- draw.io: actual maxgraph model import and uncompressed generation XSD; no draw.io application rendering claim. Compressed models have independent inflation/import proof; that published XSD rejects compressed outer pages.
- Pajek: igraph plus the narrower NetworkX subset; duplicate labels, comments and fixed-count records expose reader differences.
- Matrices: actual SciPy/NumPy math, stored zeros, symmetry, duplicates and a 20,000-node sparse matrix. Ambiguous aggregate/count edits reject.
- PlantUML 1.2026.8 / Java 21: actual SVG identities/displays/direction and class XMI. Default XMI omits relationships; `xmi:star` verifies Generalization. Headless JVM fixes macOS AWT shutdown stalls without increasing native deadlines.

The 10,000-node draw.io bulk-label probe improved from 15.58s to 3.91s after chunked source-span assembly. Timings characterize this machine; they are not universal latency guarantees.

## Mapping-gated follow-ups

RDF/Turtle/N-Triples/JSON-LD, GraphSON, CX2 and DGML still need explicit semantic profiles. RDF literal properties versus literal nodes remains an architectural choice. graph6/digraph6/sparse6 remains lower priority. None is advertised as implemented.
