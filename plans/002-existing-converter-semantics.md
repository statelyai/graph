# 002: Repair existing converter semantics

Planned at `de5ebf8`, 2026-10-12. Priority P1; effort L; risk MED; dependency 001 regression signals.

## Why / current state

Own-dialect green tests hide valid native input corruption. This plan repairs semantic conversion first; comments/unknown source state get a separate document API later. No false guarantees, stale snapshot precedence, silent hyperedge truncation or test normalization hiding lost fields.

## Scope / ownership

XML/DOT executor owns `src/formats/{graphml,gexf,gml,dot}/**` and matching dedicated tests plus its named regression describe sections. Structured executor owns `{cytoscape,d3,elk,xyflow,jgf,adjacency-list,edge-list,tgf}/**` and matching tests. Syntax executor owns `{d2,mermaid}/**` and matching tests. Shared support/docs/Changeset final reconciliation assigned separately. No concurrent commits. Not alone: accommodate others and never revert unrelated edits.

## Repair requirements

- GraphML resolve scoped key ID/name/type/defaults; retain unknown data in namespaced metadata; namespaces and boolean 0/1; enclosing nested direction; preserve Graph bidirectional via metadata. Standard native ports/data; explicit policy for multiple graphs/hyperedges.
- GEXF native weight and mutual bidirectional, standard undirected default; scope declaration IDs by node/edge class; retain metadata/custom attributes/dynamics conservatively; native visual data and arbitrary Graph colors/optional geometry; schema-compatible extension policy.
- DOT merge repeated declarations and strict edge attributes; process rank-group contents; emit native clusters; preserve independent border/fill/style and inherited attribute semantics, HTML markers, port/compass state. Graph extensions must remain namespaced and JSON-safe. Report grammar additions that require a parser replacement.
- GML compliant entities and numeric native ID mapping while accepting existing dialect; unknown ordered values, malformed input rejection; preserve Graph IDs/presence/order via explicit metadata.
- All structured adapters preserve default null labels, independent geometry, empty strings and exact JSON field values where their private metadata permits. Preserve foreign user data safely.
- ELK collision-free document-wide IDs, primitive edges, complete labels/sections/options. Hyperedges must never truncate: reject at Graph boundary unless the pending document API supplies a faithful source carrier and explicit projection.
- xyflow version/discriminator for metadata; foreign reserved-key payload preserved; renderer-visible user edits take precedence where unambiguous.
- JGF explicit v1/v2 schema versions; standards-compatible default, backward-readable existing dialect; native relation/directedness and metadata.
- Adjacency null-prototype accumulator and tuple-safe dedup; per-edge directedness; explicit parallel-edge policy. TGF normalize CRLF and whitespace; reject unsupported embedded newlines. D3 numeric endpoint resolution.
- D2 inherited mode and overrides; preserve key segments/quoted identity, ancestor/connection references, chain attrs, structured common attrs, nested vars/classes/import kind/scope, arrowheads. Keep unknown constructs as preserved metadata/diagnostics, not fake nodes.
- Mermaid canonical directedness for applicable diagrams; preserve expanded flow shapes/properties/styles/IDs/declaration override semantics; sequence ordered lifecycle/notes and no exponential duplication; official participant configuration; ER isolated entities/multiple attribute keys; block quoted tokenization/shapes/scoped columns; class namespaces/notes/interfaces; tree identity/shape/classes and symmetric escaping. Comments/frontmatter retained where feasible but full document guarantee awaits plan 003.

## Verification

Install locked dependencies if absent. Write failing tests before each fix; run owned dedicated tests and owned sections of `fidelity-regressions.test.ts`; then `pnpm typecheck`, `pnpm typecheck:repo`, `pnpm check:conventions`, `git diff --check` all exit 0. Reviewer runs combined full `pnpm verify` after reconciling. Review relevant README and add source comments. No weakened/skipped tests, no blanket preservation claims.

## Stop / maintenance

Ask reviewer if a repair requires changing core Graph topology/API or ownership. Do not touch source schemas or unrelated algorithms. Preserve backwards import compatibility; any unavoidable serialization version change must be explicit and documented. Record remaining native features honestly; no claiming all syntax parsed just because raw content retained.
