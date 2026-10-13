# Plan 008: Add lossless RDF dataset terms and scoped concrete syntaxes

Planned at `8d1b139`, 2026-10-12. Priority P2; effort L; risk MED; direction. Depends on DONE001–004 and RDF mapping decision. Dedicated `/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, feature/domain-formats from fetched main. Shared checkout untouched.

## Intent/current state

RDF is absent. Its typed/language-tagged literals and named graphs require more than a label-only mapping. `src/types.ts` Graph has generic JSON data; no new core fields needed. `src/formats/graphlib/index.ts` exemplifies native carrier and `createGraphDocumentConverter`; document core is synchronous. Plan defines terms/dataset plus N-Triples/N-Quads and Turtle/TriG using a maintained optional parser. JSON-LD processing is async and context-sensitive: record as follow-up, never pretend synchronous support. RDF1.2 triple terms/directional literals require verified parser support or explicit rejection, not silent downgrade. Use authoritative W3C current-status specs; explicitly version the implemented profile.

## Decision

Adopted recommended RDF subject/object term nodes and directed statement edges with predicate and named-graph term in data, following unanswered optional preference question and the user's authorization for common-sense choices; assumption announced before dependent implementation. Predicates/named graphs remain edge data with exact terms, document this scope. Literals retain lexical form, language and datatype; numeric lexical values never JS-coerce. Named graph identity is not hierarchy. Keep optional RDF1.1 dataset profile; no reasoning/entailment. If user subsequently selects property mapping, pause and reconcile this plan before implementation continues.

## Ownership

Own `src/formats/rdf/**`, `tests/rdf*.test.ts`, matching native tests/fixtures/helpers and RDF README. Other integration executor handles exports/dependencies/locks/support/build/config/contracts/root docs/Changeset; coordinate API and exact peers. Never edit other's files or plans; no commits before approval.

## Steps

1. Drift check `git diff --stat 8d1b139..HEAD -- src/types.ts src/formats/document src/formats/preservation.ts` empty. Read AGENTS and existing converter/document/preservation APIs. Wait for reviewer confirming RDF mapping before dependent implementation. Can research native syntax/parser meanwhile.
2. Define plain serializable term/quad DTOs and from/to dataset API. Preserve IRIs vs blank nodes vs literals, default/named graph identity, lexical datatype/language, repeated statement set semantics explicit, blank scope and duplicates. Validate RDF roles (predicate IRI, subject nonliteral) and dangling graph endpoints; native IDs collision-safe. No hidden class instances/BigInt values. Fresh arbitraryGraph→RDF requires explicit term/predicate data or throws; do not invent IRIs from labels.
3. Add scoped syntax APIs NTriples/NQuads/Turtle/TriG using maintained optional n3 parser; no handwritten partial Turtle grammar. Strict format selection and version rejection. NTriples export valid Turtle is acceptable scoped emitter; named graph→triple-only reject. Preserve exact source comments/prefixes/base on document no-op. Initially allow exact source edits and explicit regeneration; unsupported graph patches must reject with diagnostics instead of stale replay. JSON-LD remains explicit follow-up if sync boundary cannot be satisfied.
4. Tests: different numeric lexical forms, literal term identity vs IRI strings, tags/datatypes, blank node scope, named graphs, duplicate statements, RDF collections via parser, prefixed/base IRIs, escaped Unicode/control strings, invalid term positions/profile versions, document persistence/comments/source edits/conflicts/regen losses, sparse10k statements. Independent pinned RDFLib or W3C fixtures prove dataset isomorphism and syntax acceptance; parser and emitter selfroundtrip not sufficient. RDF1.2 unsupported terms reject while document source survives.
5. README symbolic references and concrete example; tell integration owner exports/peer versions/coverage floors. Run focused tests, types, independent native checks.

## Commands/done

Install exactdeps by integrationowner; `pnpm exec vitest run tests/rdf*.test.ts`; `pnpm typecheck`; `pnpm typecheck:repo`; focused actualNode24 native tests; reviewer full `pnpm verify` and combinedcoverage. All exit0, useful semantic native assertions, explicit RDF version/profile, no complete-semantic-interpretation claim, ownedfilesonly. Report COMPLETE/STOPPED with actualcommands/files/deviations.

STOP for user decision conflicting with mapping, required async coreAPI change, RDF term unsupported but currently being silently discarded, or required shared-file edits. Maintainer should gate future JSONLD/RDF1.2 additions with their own semantic/native proof.
