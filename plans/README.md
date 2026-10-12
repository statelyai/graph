# Conversion fidelity implementation

Planned at `de5ebf8`, 2026-10-12. User authorized implementation, common-sense API choices, and questions for consequential architecture decisions.

| Plan | Work | Depends on | Status |
| --- | --- | --- | --- |
| 001 | Honest claims and failing preservation regressions | None | DONE: 717 baseline tests pass; 39 regressions reproduce failures; types/check pass |
| 002 | Repair existing converter semantics | 001 | DONE: reviewer pnpm verify passed, 3517 tests plus packed runtime/types smoke; backward-compatible JGF default |
| 003 | Serializable document preservation and diagnostics | 002 | DONE: all21 document registrations; exact source/JSON persistence; strict diagnostics; reviewer full gate passed |
| 004 | Native validation and missing adapters | 003 | DONE: ten new adapters and six Mermaid kinds; reviewer full gate, 3994 Node20 core / 4222 Node24 combined tests; 97.10% lines / 86.44% branches |

Source edits belong to executors. All work uses `/Users/davidkpiano/.codex/worktrees/graph/conversion-fidelity`, branch `feature/conversion-fidelity`, based on fetched `origin/main`. Shared checkout remains untouched. Review every diff and run `pnpm verify` before publication. Changesets and affected READMEs required.

New format priorities: Graphology, Graphlib, NetworkX node-link, CSV/TSV first; Graphviz JSON, draw.io, Pajek, Matrix Market, PlantUML next. RDF, GraphSON, CX2, DGML are domain-dependent; define semantic profiles before claiming support. Mermaid graph-like additions: Architecture, Requirement, Sankey, GitGraph, C4, Use Case. Never equate source preservation with complete semantic interpretation.

Final [verification report](005-final-verification.md) records per-converter coverage, native evidence, remaining scope limits and mapping-gated follow-ups.
