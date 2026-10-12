---
"@statelyai/graph": minor
---

Expose separate Graph, native semantic and source-document preservation assessments in format support entries. Correct unrestricted round-trip claims and document known conversion limits. Existing feature keys remain available; the additive preservation field is optional for third-party entries.

Repair existing converter semantics: scoped XML attributes/defaults and edge modes, native GEXF weight/mutual edges, DOT declaration/cluster/port behavior, GML standard identity options, structured metadata/edit precedence, collision-free ELK endpoints and explicit hyperedge rejection, JGF version support, and adjacency/TGF boundaries.

Retain supported D2 key/reference/source abstractions and diagram annotations. Fix Mermaid styles/properties/edge identity, ordered sequence notes/lifecycle with stable note references, official participant configuration, ER entities/constraints, block shapes/columns and class/tree metadata. New metadata fields remain JSON-serializable; legacy input remains readable. Source annotations may be reformatted, and unsupported event references/topology fail explicitly.


Add `@statelyai/graph/document` and explicit native `*DocumentConverter` registrations. Plain JSON-serializable envelopes retain exact original text/native JSON values after persistence, independently of partial or unavailable semantic projections. Supported edits patch source with reparse proof; unsupported/conflicting edits fail explicitly. Custom codecs, including VisualGraph codecs, can register without eager optional peer imports. Source validation rejects non-JSON values rather than silently dropping them. Explicit lossy regeneration reparses its output and reports unrepresentable Graph field paths or an unavailable projection, alongside possible source loss. Expand the optional ELK peer range through 0.12 after runtime/type package verification.


Add a separate Node 24 native-validation suite with exact dev-only parser/compiler/schema dependencies and converter coverage gates. Independently validate external and emitted profiles, with native database/compiler semantic assertions. Correct native Mermaid class multiplicity placement, nested state transition scope, and literal backslash encoding/import counts discovered by those oracles. Core runtime support remains Node 20+; validators are absent from published runtime imports.

Add dependency-free `csv`, `graphology`, `graphlib` and `networkx` subpaths with explicit document registrations. CSV/TSV use separate node/edge tables, configurable typed columns and default JSON cells to distinguish missing/null/empty values. Bounded document cell edits preserve unrelated source columns and quoting. Native JSON adapters preserve selected attribute metadata and reject unsupported uniform-direction mappings. Validate emitted CSV cells with pinned csv-parse and NetworkX profiles with isolated Python oracles; these checks establish scoped interoperability, not unrestricted semantic losslessness.

Add scoped Mermaid Architecture, Requirement, Sankey, GitGraph, C4 and UseCase converters with serializable document registrations and native Mermaid12.1 database proof. Architecture sides map ports; GitGraph preserves ordered DAG actions and canonical main-branch configuration. Bounded label patches preserve comments; unsupported syntax/edits retain source or reject explicitly. Scope Sankey to the native parser's printable ASCII/trimmed-name profile; omit Requirement empty text tokens that native syntax rejects. Repair injective empty Mermaid IDs and empty-parent hierarchy references.

Add adjacency matrix, Matrix Market, Graphviz JSON, draw.io, Pajek and scoped PlantUML subpaths, explicit mappings/aggregation/direction policies, source document registrations and independent native oracles. draw.io compression uses optional fflate; native validation tools remain development-only, including checksum-pinned PlantUML/JRE and isolated Python dependencies.

Reject native display/wire strings that independent oracles replace: Mermaid NUL/lone-surrogate labels and D2 lone-surrogate labels/IDs. Preserve supported astral strings, D2 compiler-level NUL labels, safe encoded Mermaid IDs, JSON-escaped opaque data and exact unprojectable source strings.
