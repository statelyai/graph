# Plan 006: Add DGML and CX2 semantic profiles

Planned at `8d1b139`, 2026-10-12. Priority P2; effort L; risk MED; direction. Depends on DONE plans 001–004. Worktree `/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, branch `feature/domain-formats`, fetched main base. Never modify shared checkout.

## Why and current state

The merged verification report identifies DGML and CX2 as missing domain formats. Graph uses plain JSON nodes/edges; converters are prefixed standalone functions. `src/formats/graphlib/index.ts` exemplifies `createFormatConverter`, native carrier storage, and `createGraphDocumentConverter({format,codec,project,patch})`. The document API keeps original source independent of its partial projection, reparses edits, and rejects unsupported changes. `src/formats/structured-json.ts` and `preservation.ts` contain reusable validation/identity helpers. Follow these contracts; do not change Graph or document core.

## Scope and ownership

Executor owns `src/formats/dgml/**`, `src/formats/cx2/**`, `tests/dgml*.test.ts`, `tests/cx2*.test.ts`, matching `tests/native/*` tests/fixtures/helpers, and format READMEs. Another executor owns shared barrels, package/build/coverage/CI/contracts and root docs. Coordinate required dependencies with it. Do not edit plans or other converters; never revert others' edits. No commits until reviewer approval.

## Steps

1. Drift check: `git diff --stat 8d1b139..HEAD -- src/formats/document src/formats/preservation.ts src/formats/structured-json.ts` must be empty. Read local AGENTS and exemplars. Ask integration owner to install exact lockfile dependencies first.
2. Research authoritative DGML Microsoft reference and NDEx CX2 specification/current maintained reader. Pin source/version provenance. Define explicit profiles in README before coding. DGML maps Id/Label and directed links, category/property definitions, Contains membership, groups; reject multiple/cyclic containment rather than guessing. Native DGML implicitly creates undeclared link endpoint nodes: support with declaration provenance, exact no-op source, bounded explicit declaration edits only with reparse proof. CX2 maps aspect-oriented numeric IDs/topology and declared typed attributes/defaults/aliases; retain opaque visual/custom aspects. Native identities must remain distinct and exact; numeric unsafe IDs reject. Duplicate entities and CX2 dangling endpoints reject. Self-loops/parallel links supported when native permits.
3. Implement import/export with plain serializable typed native data; native carrier retains unknown fields/aspects. Live mapped fields authoritative over stale carrier. Do not silently change declared data types. Fresh Graph export either represent fields explicitly or reject unsupported semantics. Do not advertise full interpretation.
4. Add document registrations: exact source no-op after JSON persistence, unsupported source retains source with null projection; bounded label/property edits only when semantic proof available, otherwise strict rejection. Preserve comments/unknown XML or aspect records on edits. No broad regex that confuses nested elements/namespaces. Use shared lexical XML helpers where appropriate.
5. Regression tests: IDs, aliases/defaults/types, group/category distinction, missing vs null vs empty, unknown fields, opaque constructs, parallel/self-loop topology, invalid/cyclic native inputs, stale metadata precedence, exact source round-trip, supported edits and rejection/conflict controls, 10k topology performance guard. Native evidence must use official schema or maintained independent reader; self-roundtrip is insufficient. Record any unavailable oracle honestly, no fake native label.
6. Match readme skill `/Users/davidkpiano/.agents/skills/readme/SKILL.md`. Run focused tests and types; report shared wiring to integration owner.

## Commands and done criteria

`pnpm install --frozen-lockfile` once by integration owner. `pnpm exec vitest run tests/dgml*.test.ts tests/cx2*.test.ts`; `pnpm typecheck`; `pnpm typecheck:repo`; native tests via actual Node24 `pnpm dlx node@24.15.0 node_modules/vitest/vitest.mjs run --config vitest.native.config.ts` with focused files. Reviewer runs `pnpm verify` and full combined coverage. All exit0; meaningful independent semantic assertions and preservation tests; only owned files changed. Never claim Windows Visual Studio rendering without proof.

STOP and report if native specification contradicts a proposed mapping, existing API must break, domain behavior remains ambiguous, or dependencies require changing core runtime. Reviewer maintains index and approves publication. Future versions must preserve explicit profiles and evidence limitations.
