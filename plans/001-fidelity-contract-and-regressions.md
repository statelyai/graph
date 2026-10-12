# 001: Establish truthful claims and regression signals

Planned at `de5ebf8`, 2026-10-12. Priority P1; effort M; risk LOW; dependency none.

## Why

Current format tests pass while ordinary native inputs lose topology, labels, weights, metadata and comments. `roundTrip: full` mixes Graph field preservation with native/document preservation. Fixtures sort arrays and ignore edge.mode. Preserve public compatibility while making the guarantee explicit.

## Current state

`src/formats/support.ts` has one roundTrip feature and marks D2 plus eight structured formats full. `tests/formats/support-matrix.test.ts` excludes D2 from full fixture conformance; projected edge keys omit mode. `tests/formats/fixture-roundtrip.ts` sorts arrays. DOT stability helper compares two emissions after the first potentially lossy import. README derives its format inventory/support matrix from source using symbolic comments.

## Scope

Own `src/formats/support.ts`, `src/format-support.ts`, `tests/formats/support-matrix.test.ts`, new `tests/formats/fidelity-regressions.test.ts`, root README, converter READMEs, `.changeset/conversion-fidelity.md`, optionally `vitest.config.ts` to exclude nested worktrees. No converter implementation edits, package dependency edits, core model edits or user checkout changes. Other executors will own individual converters after this plan.

## Steps

1. Install exact lockfile dependencies: `pnpm install --frozen-lockfile --ignore-scripts` (exit 0). Read repo AGENTS, README skill and verify current source against excerpts.
2. Keep legacy feature shape; add explicit Graph/native semantic/document preservation capability fields or an adjacent additive contract, with clear JSDoc. No full unrestricted preservation claims. Retain selected fixture tests as narrower characterization tests, without implying conformance. Update READMEs/symbolic comments and Changeset.
3. Add meaningful integration regressions exercising actual converters: GraphML arbitrary key IDs/defaults/nested directedness; GEXF native weight/mutual/default direction; DOT repeated declarations/strict/rank contents/clusters; ELK hyperedge rejection or faithful representation/ID collisions; default null labels; D3 numeric endpoints; xyflow reserved metadata and native edits; adjacency delimiter/prototype IDs; TGF CRLF/whitespace; D2 inherited modes/comments; Mermaid spanning-note stability/styles/isolated ER/block quoted labels. Existing topology/model limits need explicit rejection rather than silent truncation, until a document API exists. Group tests by ownership so later workers can target them.
4. Run `pnpm exec vitest run tests/formats/support-matrix.test.ts` expecting PASS, then fidelity regressions expecting the audited failures. Record exact failing cases; do not weaken assertions or leave skipped/todo tests. The temporary red suite is the handoff to plan 002.

## Done criteria

Truthful claims/docs; baseline tests passing; new failures reproducibly demonstrate audit defects; `pnpm typecheck` and `pnpm typecheck:repo` exit 0; no out-of-scope changes. Report tool-backed results. Do not commit failing tests or push. Reviewer maintains plan index.

## Conventions / stop conditions

All public functions prefixed, graph first, plain JSON data, source contracts in `tests/contracts.test.ts` if root public exports change; preserve existing exports. Stop for core Graph redesign or contradictory API decisions. No secrets. Match existing Vitest patterns. Do not revert others' edits.
