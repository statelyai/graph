# Plan 007: Add an explicit GraphSON profile and wire domain formats

Planned at `8d1b139`, 2026-10-12. Priority P2; effort L; risk MED; direction. Depends on DONE plans001–004. Worktree `/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, branch `feature/domain-formats`, fetched main base. Preserve shared checkout.

## Intent/current state

GraphSON remains absent from `package.json` exports and support registry. TinkerPop distinguishes GraphSON versions, type wrappers, whole-graph and adjacency forms; do not call arbitrary JSON GraphSON. `src/formats/graphlib/index.ts` shows native metadata/carrier/document conventions. `src/formats/index.ts`, `src/formats/support.ts`, `tsdown.config.ts`, `scripts/smoke-package.ts`, `tests/contracts.test.ts` and `vitest.config.ts` register format surface/build/coverage/contracts. Every function prefixed, Graph first except factories, Graph plain JSON. Never change defaults of existing formats.

## Ownership

Own `src/formats/graphson/**`, `tests/graphson*.test.ts`, matching native tests/fixtures/helpers/README. Also own shared integration files: `src/formats/index.ts`, `src/formats/support.ts`, `package.json`, `pnpm-lock.yaml`, `tsdown.config.ts`, `vitest.config.ts`, coverage/native config, `scripts/smoke-package.ts`, `tests/contracts.test.ts`, format-support tests, root README, `docs/native-validation.md`, optional domain ADR, one minor Changeset, requirements/CI only if independently needed. Other executors own DGML/CX2/RDF source/tests. You are not alone: do not revert others; coordinate public names before wiring. Root edits only plans. No commits until reviewer approval.

## Steps

1. Confirm `git diff --stat 8d1b139..HEAD -- src/formats/graphlib src/formats/document` empty. Install `pnpm install --frozen-lockfile` before diagnostics; tell other executors ready. Only you change dependency manifests/locks.
2. Use official https://tinkerpop.apache.org/docs/current/dev/io/ and maintained native implementation; pin version. Choose explicit GraphSON3 typed graph profile supported by native reader. Add adjacency/NDJSON only if independently verified; do not invent g:Graph vs g:TinkerGraph. Reject unsupported versions/profiles rather than guessing. Typed IDs, Int64/BigInteger/BigDecimal must not coerce through unsafe JS numbers; lossless wrappers remain JSON. Preserve vertex-property IDs, multi-properties/meta-properties, map keys/sets/type extensions as native data. Directed edges and endpoint identity exact; invalid duplicate IDs/dangling edges reject. Do not flatten typed maps into records.
3. Implement to/from/converter/document APIs matching existing carriers. Source unchanged after JSON persistence exact; source edit authoritative; bounded label/property edits require native proof; unsupported changes reject. Fresh Graph conversion must expose scoped representation/rejection, not silent loss of arbitrary Graph data. Tests include distinct typed IDs, unsafe numbers, parallel/selfloops, empty/native null, unknown wrappers, property identity, stale carrier vs mapped edits, document strict controls.
4. Independent oracle: pinned TinkerPop Python/JS reader or genuine Java runtime with committed upstream fixtures; verify native semantics, not own snapshots. Communicate dependency needs for DGML/CX2/RDF. Add coverage floors for all new modules without lowering existing floors. Integrate exports/support/contracts/package smoke after APIs settle, preserve optional peers lazy from root.
5. Review affected README symbolic sections with `/Users/davidkpiano/.agents/skills/readme/SKILL.md`. Document exact version/profile/native scope and add minor Changeset; refresh native report with actual measured evidence only.

## Commands/done

Focused `pnpm exec vitest run tests/graphson*.test.ts`; `pnpm typecheck`; `pnpm typecheck:repo`; `pnpm check:conventions`; `pnpm build`; `pnpm validate:package`; full `pnpm verify`; actualNode24 combined coverage `pnpm dlx node@24.15.0 node_modules/vitest/vitest.mjs run --config vitest.coverage.config.ts --coverage` with native environment configured. All pass; useful independent native tests; source/semantic limits truthful; no shared checkout mutations. Report COMPLETE/STOPPED, steps/commands, changed files and deviations.

STOP on impossible native profile assumptions, required breaking Graph API, or unresolved architectural mapping. Reviewer maintains plan index and approves publication. RDF JSON-LD asynchronous/network-context processing is deferred unless separately designed; don't guess synchronous support.
