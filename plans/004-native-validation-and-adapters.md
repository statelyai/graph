# 004: Validate native interoperability and add missing adapters

Planned at `de5ebf8`, 2026-10-12. Priority P2; effort L; risk MED. Depends on 003.

## Objective

Native-reader/schema-backed test corpus plus adapters ordered by existing domain fit. Graphology, Graphlib, NetworkX node-link JSON, CSV/TSV first. Graphviz JSON, draw.io, Pajek, Matrix Market, scoped PlantUML follow. Mermaid Architecture, Requirement, Sankey, GitGraph, C4, Use Case follow their current official grammar. Domain-specific RDF/GraphSON/CX2/DGML require explicit mappings before implementation.

## Scope / requirements

Executor owns each assigned new src/formats directory and its tests/README, coordinates package exports, tsdown entries, support inventory, contract exclusions and Changesets. No new runtime dependency unless needed for authoritative parser integration; optional peers stay optional, lazy document registry does not load them from root.

Use installed Graphology/Graphlib as independent oracles. Pin current official JGF JSON schemas and Mermaid/D2 parser or compiler fixtures with provenance/version; validate external native documents and emitted outputs, never converter-against-itself alone. Include null/presence/order/mixed-mode/parallel-edge/isolated-node/port/custom metadata, reserved names, arbitrary Unicode/escaping, large/deep iterative graphs, hostile malformed inputs, document no-op/edited preservation and diagnostics.

Native validation choices: dev-only Ajv for pinned JGF schemas; dev-only `xmllint-wasm` (libxml2) with vendored official XSD dependencies and provenance for XML. Mermaid current v12 requires Node >=22.12 whereas existing core CI covers Node20/22/24: preserve core runtime support and run a separate native-validation script/job on Node24, with exact native parser versions. Do not make optional validators runtime dependencies or silently skip unsupported inputs. Prefer portable WASM D2 compiler validation in a subprocess with bounded lifetime, because its worker can keep the event loop alive. Dependency installation/lockfile updates belong to one designated integrator, not concurrent workers.

CSV/TSV uses explicit node/edge tables and schema/configuration for IDs, endpoints, data, types, direction and ports. Parse quoting/newlines correctly; retain unknown columns and metadata in document mode. Matrix family needs clear parallel-edge aggregation and node ID sidecar. draw.io needs page/group/style/routing/native carrier. PlantUML requires honest scoped dialect support; never flatten executable process/statechart semantics.

## Verification / completion

Milestones: native foundation independently passed 3807 tests. Primary Graphology,
Graphlib, NetworkX and CSV/TSV independently passed `pnpm verify` and 3955 combined
Node24 tests (96.53% lines / 86.45% branches). Review caught and repaired new-edge
identity loss after foreign simple/multigraph imports, metadata suffix overflow,
GML empty labels and native CR/LF/TAB normalization. Remaining follow-on adapters
and six Mermaid dialects are executor-owned; no domain-specific schema claims.

Follow-on review: fresh Graphviz JSON, draw.io and Pajek exports preserve complete
Graph equality for structural IDs 0/1, hierarchy, ports, null/empty labels, zero
weights and arbitrary JSON data. GraphML strict label edits reject XML-invalid
NUL characters. Count-coefficient edits now reject instead of becoming weights;
reviewer independently passed 110 focused tests and seven actual SciPy tests on
Node 24. Asymmetric stored-zero undirected coordinates need a matching-presence
guard, now implemented. Empty-ID Mermaid Architecture groups retain child
membership. Chunked XML patch assembly reduced a 10k draw.io bulk-label benchmark
from 15.58s to 3.91s. Actual Graphviz 15 fdp output proves cluster endpoints;
dot instead creates ordinary cluster-named endpoint nodes. XML worker final gate:
173 focused core tests, 26 actual Node 24 native tests, both type checks and
conventions pass. DOT native wire strings now reject NUL/lone surrogates while
JSON-escaped user data remains intact. Supplied source strings are preserved
exactly; arbitrary original file byte encoding is outside the API.

`pnpm verify` passes plus native validation suite, selected format coverage thresholds checked in CI. README inventories match actual exports. Document exact supported dialect/version and losses. Each adapter independent native oracle tests; no blanket 100% claims. If native schema/domain representation is unclear, produce concrete API options for user rather than guess. Task branch based on integration main; commits/push allowed after verification; never direct-push main or touch shared checkout.

Completed: reviewer sequential `pnpm verify`, actual Node20.20.2 core3994 and
Node24.15.0 combined4222 tests passed. Converter coverage97.10% lines/86.44%
branches; all global and selected new-module floors passed. Ten new adapters,
six Mermaid profiles, document registrations, scoped READMEs, native provenance,
CI and packed runtime/types are verified. Domain-specific mappings remain explicit
follow-ups. See [final verification](005-final-verification.md).
