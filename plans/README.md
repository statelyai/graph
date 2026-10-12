# Conversion fidelity implementation

Planned at `de5ebf8`, 2026-10-12. User authorized implementation, common-sense API choices, and questions for consequential architecture decisions.

| Plan | Work | Depends on | Status |
| --- | --- | --- | --- |
| 001 | Honest claims and failing preservation regressions | None | DONE: 717 baseline tests pass; 39 regressions reproduce failures; types/check pass |
| 002 | Repair existing converter semantics | 001 | DONE: reviewer pnpm verify passed, 3517 tests plus packed runtime/types smoke; backward-compatible JGF default |
| 003 | Serializable document preservation and diagnostics | 002 | DONE: all21 document registrations; exact source/JSON persistence; strict diagnostics; reviewer full gate passed |
| 004 | Native validation and missing adapters | 003 | DONE: ten new adapters and six Mermaid kinds; reviewer full gate, 3994 Node20 core / 4222 Node24 combined tests; 97.10% lines / 86.44% branches |

Source edits belong to executors. Plans001–004 used `/Users/davidkpiano/.codex/worktrees/graph/conversion-fidelity`, branch `feature/conversion-fidelity`, based on fetched `origin/main`. Shared checkout remains untouched. Review every diff and run `pnpm verify` before publication. Changesets and affected READMEs required.

New format priorities: Graphology, Graphlib, NetworkX node-link, CSV/TSV first; Graphviz JSON, draw.io, Pajek, Matrix Market, PlantUML next. RDF, GraphSON, CX2, DGML are domain-dependent; define semantic profiles before claiming support. Mermaid graph-like additions: Architecture, Requirement, Sankey, GitGraph, C4, Use Case. Never equate source preservation with complete semantic interpretation.

Final [verification report](005-final-verification.md) records per-converter coverage, native evidence, remaining scope limits and mapping-gated follow-ups.

## Post-merge follow-up

PR53 merged at `8d1b139`. New isolated worktree `/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, branch `feature/domain-formats`, fetched main base. Advanced to main `5141455` (version-only release) before final gates. Original worktree retained.

| Plan | Work | Depends on | Status |
| --- | --- | --- | --- |
| 006 | DGML and CX2 explicit semantic profiles | 001–004 | DONE: strict profiles, native validators, reviewer full gates pass |
| 007 | GraphSON explicit profile and shared integration | 001–004; integration after 006/008 | DONE: typed TinkerGraph, native mapper, all subpath/runtime/type contracts pass |
| 008 | RDF dataset/NTriples/NQuads/Turtle/TriG | 001–004; term-node profile adopted | DONE: term-node profile, strict syntax, independent native proof; full gates pass |
| 009 | Reject concurrent-source wrong-entity document edits | 003 | DONE: eight legacy guards; DGML guarded in 006; full gates pass |
| 010 | Complete identity guards in five additional converters | 009 helpers frozen | DONE: five additional guards; 83 total legacy identity controls; full gates pass |
| 011 | Independent final verification and scope report | 006–010 | DONE: 4,273 Node20 core / 4,532 Node24 combined tests, package gate, 96.78% lines / 86.92% branches |

JSON-LD asynchronous/context processing, full RDF1.2 terms and graph6 family remain explicitly scoped follow-ups. No new format may equate source retention with full semantic interpretation.

009/010 take precedence over publication: native generated/ordinal IDs cannot be treated as stable entity identity across source insertion/reordering. Existing stable-ID edits and source-only updates remain supported.

Current [verification report](011-domain-formats-verification.md) includes every
converter's measured coverage, independent native evidence and remaining limits.
