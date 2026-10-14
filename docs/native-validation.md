# Native interoperability validation

<!-- native runner commands and environment from package.json, vitest.native.config.ts and .github/workflows/ci.yml -->

`pnpm test:native` runs the independent native suite in `tests/native/`. CI uses
Node 24 separately from core Node 20/22/24 checks. Use Node 24.15+ locally for the
current DOM validator. Standard `pnpm test` excludes native tests; repository
TypeScript checks include their source. Validators remain dev-only dependencies;
core and published format modules do not import them.

`pnpm test:coverage` runs standard and native tests together on Node 24 and
checks converter coverage against committed thresholds. Core Node 20 tests remain
separate and exclude native modules. The initial native-foundation corpus measured
96.30% lines, 92.55% statements, 95.29% functions and 85.90% branches. The latest
reviewed expanded corpus measured 97.10% lines, 92.26% statements, 95.23% functions
and 86.44% branches across 4,222 tests on Node 24.15.0. These are distinct snapshots.

<!-- converter coverage floors from vitest.config.ts and vitest.coverage.config.ts -->

Global floors remain 95% lines, 91% statements, 93% functions and 84% branches.
[The committed configuration](../vitest.config.ts) also sets line/branch floors
for selected D2, Mermaid, XML, ELK and primary CSV/JSON adapters, plus adjacency
matrix/core, Matrix Market, Graphviz JSON, draw.io, Pajek, PlantUML and all six
expanded Mermaid profiles with their shared parser helpers, plus scoped GraphSON,
DGML, CX2 and RDF core/syntax modules. Coverage output is
ignored. Native semantic assertions complement coverage; neither proves full
language coverage.

<!-- pinned native validator dependencies from package.json#devDependencies -->

| Oracle | Version | Scope |
| --- | --- | --- |
| Mermaid | 12.1.0 | Native syntax parsers and diagram databases |
| @terrastruct/d2 | 0.1.33 | Portable WASM compiler and compiled graph/diagram |
| Ajv | 8.20.0 | Pinned JSON schemas |
| ajv-draft-04 | 1.0.0 | Official draft-04 compatibility |
| xmllint-wasm | 5.3.0 | libxml2 XSD validation |
| jsdom | 30.1.2 | Browser DOM for Mermaid parsing/entity decoding |
| csv-parse | 7.0.3 | Exact external/emitted CSV and TSV cells |
| @maxgraph/core | 0.25.0 | Legacy mxGraph XML model import compatibility |
| NetworkX (Python) | 3.7 | Native node-link JSON and GML readers/writers |
| SciPy / NumPy (Python) | 1.18.1 / 2.5.4 | Matrix Market numeric/math interoperability |
| igraph (Python) | 1.0.0 | Pajek reader vertices/sections/attributes |
| Apache TinkerPop Java / Gremlin JavaScript | 3.8.2 | GraphSON3 typed TinkerGraph object/element/property semantics |
| NDEx ndex2 (Python) | 3.12.0 | CX2 native declarations/defaults/topology |
| RDFLib (Python) / N3 (JavaScript) | 7.6.0 / 2.13.12 | RDF1.1 selected syntax/dataset semantics |
| PlantUML | 1.2026.8 | Compiler-produced SVG and class XMI, scoped component/class dialect |

Python oracles use an isolated task environment, with exact versions in
`requirements/native.txt`. CI installs it before combined coverage; missing or
wrong versions fail explicitly. Local setup uses Python 3.12+:

```sh
python3 -m venv .venv-native
.venv-native/bin/python -m pip install -r requirements/native.txt
pnpm test:native
```

`GRAPH_NATIVE_PYTHON` can select another task-owned environment. No Python package
is needed by the library at runtime. CSV/TSV native checks assert exact cell
contents and the separate Graph projection; CSV parsing alone does not establish
graph-domain validity.

Draw.io fixtures exercise maxgraph 0.25.0's native legacy mxGraph model import,
including UserObject values, style records, grouping, routing and page inflation.
This proves import compatibility for asserted fields, rather than rendering in
the draw.io application. The unchanged draw.io generated-file XSD rejects the
compressed-page fixture; the suite records that negative result separately from
successful native inflation/import. Pinned Python igraph fixtures inspect Pajek
vertices, sections and attributes through the native reader. These oracles assert model import and selected native fields; they do not establish
complete draw.io rendering or unrestricted Pajek grammar. Graphviz fixtures
inspect actual Graphviz JSON output; Graphviz has no native JSON input reader, so
fresh structural JSON export has no such reader proof. PlantUML fixtures inspect
actual compiler SVG and class XMI rather than accepting syntax alone.

Installed Graphology, Graphlib, Cytoscape, D3 and ELK provide independent runtime
oracles. Their fixture tests record precise installed versions. XML/JSON schema
fixtures include their own official source and provenance. Invalid legacy output
profiles are tested explicitly; passing a negative validation control does not
promote that profile to standards compliance.

<!-- Mermaid and D2 native corpus assertions from tests/native/mermaid.test.ts, tests/native/d2.test.ts and fixtures -->

Mermaid fixtures are independently authored from official syntax documentation,
with URLs and oracle versions in `mermaid-profiles.json`. All eight base
diagram dialects validate both native input and emitted output. Database checks
assert selected graph labels, shapes, edge strokes, participant/message/note
order, namespaces/members/multiplicities, ER attributes/cardinalities, state
hierarchy/transitions, scoped block columns and tree structure. Exact Unicode,
quotes and backslash counts use the pinned native entity decoder plus browser
HTML decoding. This integration deliberately checks the native decoder's bundle
signature when locating it; version upgrades require review. It is test-only.
The corpus includes 251-node flow and 50-level tree profiles, adjacent quoted
block labels ending in literal backslashes, malformed controls
and edited document output. Native flow comments occupy separate lines; inline
`%%` after a declaration is rejected by the pinned parser.

D2 fixtures record official documentation and compiler version in
`d2-profiles.json`. Native compilation checks escaped labels, literal dotted
identity, isolated nodes, SQL column types/constraints and connection column
indices, mixed arrows/full arrowheads, scoped ancestor endpoints and variable/
class substitution. Additional profiles contain a 60-node chain and 20-level
scope. The D2 wrapper exposes no public worker shutdown API, so compilation runs
in a subprocess with a 25-second deadline and explicit exit after output flush.
No private worker termination API is used.

Native acceptance and selected semantic assertions do not prove unrestricted
Graph preservation or interpretation of all native syntax. Exact source-document
retention is a separate [contract](../src/formats/document/README.md).

Sources: [Mermaid usage](https://mermaid.js.org/config/usage),
[D2 JavaScript wrapper](https://github.com/d2lang/d2/tree/master/d2js), and the
per-fixture official documentation links.


<!-- additional scoped native tools and profiles from tests/native/mermaid-expanded.test.ts, scripts/native/plantuml-tools.json and .github/workflows/ci.yml -->

Six further Mermaid profiles cover Architecture, Requirement, Sankey, GitGraph,
C4 and UseCase. Native database snapshots are captured before reparse so shared
native database reset cannot create a false equivalence. Their assertions include
semantic modifiers, literal text, graph hierarchy, canonical direction, native
configuration and negative grammar controls. Mermaid12.1 Sankey has an ASCII-only
lexer and trims even quoted outer whitespace; Unicode names reject projection
and remain exact in GraphDocument source. Requirement empty text uses omission;
the native parser rejects an explicit `text: ""` field.

PlantUML is a checksum-pinned development JAR at `.tools-native/plantuml.jar`.
`scripts/native/plantuml-tools.json` records primary release URLs, hashes and
licenses. CI uses Temurin Java21; local macOS ARM64 setup can use the separately
checksum-pinned task JRE. No system Java installation or hosted renderer is needed:

```sh
pnpm setup:native:plantuml # existing JAVA_HOME / CI Java21
node scripts/native/setup-plantuml.mjs --jre # task-local macOS ARM64 JRE
```

The JAR/JRE, GPL development tooling and generated compiler outputs stay in ignored
`.tools-native/`; none enter library runtime imports or the published package.


String-domain controls distinguish Unicode scalars from opaque JSON strings.
Mermaid's native/DOM entity path replaces NUL and surrogate references; display
label emission/projection/patches reject them, while astral characters and safe ID
aliases remain supported. D2's compiler retains NUL label fields but replaces lone
surrogates; its adapters reject only that proven surrogate loss. These tests
inspect native compiled/display fields rather than asserting file-byte encoding.

<!-- domain profile tooling/proof from scripts/native/graphson-tools.json, tests/native/{graphson,dgml,cx2,rdf}.test.ts -->

GraphSON native setup uses `pnpm setup:native:graphson`: twelve Maven Central
JARs pinned individually by SHA256, derived from the verified official Apache
TinkerPop 3.8.2 distribution. The manifest records URLs, versions, distribution
provenance and licensing. Tools stay in ignored `.tools-native/` and never enter
runtime imports or package contents. Java subprocesses have a 20-second bound;
`GRAPH_NATIVE_JAVA` selects the task Java 21 executable. Actual Java mapper tests
use `TinkerIoRegistryV3` plus extended value types, preserve unsafe magnitudes in
raw serialized strings, and assert observed native topology/property semantics.
No GraphSON adjacency/writeGraph interoperability is claimed.

DGML uses the official Microsoft 2009 XSD with xmllint, including negative schema
controls for dynamic property attributes; this does not establish Windows renderer
behavior. CX2 uses the maintained NDEx Python reader with observed default/null
limitations. RDF uses N3 strict grammars and independent RDFLib parser/store
observations and dataset isomorphism; empty-graph and language-case distinctions
are checked before the native store normalizes them. Per-format READMEs and
fixture provenance describe each bounded interpretation claim. Exact document
source retention is separate from these native semantic assertions.

<!-- combined domain verification evidence from plans/011-domain-formats-verification.md -->

Final combined evidence belongs in the
[domain formats verification report](../plans/011-domain-formats-verification.md).
Isolated measurements do not establish a combined release gate; existing global
coverage thresholds remain unchanged.
