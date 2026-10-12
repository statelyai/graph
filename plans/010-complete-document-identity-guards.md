# Plan 010: Close the remaining verified document identity gaps

Planned at `8d1b139`, 2026-10-12. P1 bug; effort M; risk MED; HIGH confidence. Depends on 009's frozen eight-format helper fixes. Worktree `/Users/davidkpiano/.codex/worktrees/graph/domain-formats`, feature/domain-formats; no shared checkout changes.

## Why/current state

Read-only audit found five further successful wrong-target updates: JGF, Graphology, NetworkX implicit multigraph keys, PlantUML and Pajek. A pending Graph label edit modifies an inserted edge after source insertion; intended original remains unchanged. Root inspected JGF `index.ts:71` (`edge.id ?? e${index}`), Graphology `index.ts:47` (missing-key generated IDs), NetworkX `index.ts:49` (per-pair implicit keys), PlantUML `index.ts:196` (current projected index to relationship line), Pajek `index.ts:186` (only compares nonlabel token contents), and shared `getAttributeDocumentPatch`. Reparse proof cannot establish identity when the same generated key changes referent.

## Ownership/scope

Own `src/formats/structured-json.ts` scoped Graphology/NetworkX identity guards; format-specific Graphology/NetworkX document callback guards if needed; `src/formats/preservation.ts` **JGF document guard only** (009 changes frozen, preserve them); `src/formats/plantuml/index.ts` and `src/formats/pajek/index.ts` scoped document identity guards; new `tests/document-identity-additional.test.ts`, affected native controls if useful, five affected format README sections. Shared integration/support/native docs/Changeset is structured_adapters' responsibility; root maintains plans. DGML/CX2/RDF remain frozen. You are not alone; do not revert others or edit document core. No commits/push before review.

## Steps

1. Read AGENTS and README skill. Compare `git diff 8d1b139 --` scoped paths to current code; shared preservation already contains 009, adapt to it. Exact dependencies installed. Host default Node changed to22.11; use `env PATH=/Users/davidkpiano/.nvm/versions/node/v24.17.0/bin:$PATH pnpm ...` (verified project pnpm10.28.2), not global environment edits.
2. RED tests using exact audit inputs:
   - JGF: `{graph:{nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b',label:'Same',metadata:{Marker:'original'}}]}}`; prepend same ends/label `id:'e0',metadata:{Marker:'inserted'}`.
   - Graphology: `{options:{type:'directed',multi:true},attributes:{},nodes:[{key:'a'},{key:'b'}],edges:[{source:'a',target:'b',attributes:{label:'Same',Marker:'original'}}]}`; prepend same ends/label `key:'e0',attributes:{label:'Same',Marker:'inserted'}`.
   - NetworkX: `{directed:true,multigraph:true,graph:{},nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b',label:'Same',Marker:'original'}]}`; prepend same ends/label `key:0,Marker:'inserted'`.
   - PlantUML: `@startuml\ncomponent "A" as a\ncomponent "B" as b\n' original\na --> b : Same\n@enduml`; prepend `' inserted` and identical relationship before original comment/relationship.
   - Pajek: `*Vertices 2\n1 "A"\n2 "B"\n*Arcs\n1 2 1 l "Same"\n`; replace relationship with `% inserted` identical row then `% original` identical row.
   In each `.from(base)`, mutate `.source`, then `graph.edges[0].label='Graph edit'`; `.to` currently succeeds on inserted record. Also test deletion/reorder, source-only updates, stable explicit IDs and unaffected stable node patches. Add genuine private sidecar replay controls, particularly Pajek/PlantUML occurrence-based sidecars that might still attach an old ID to a new physical row.
3. Explicit/native identities must be verified in BOTH baseline/current sources. Never let a current explicit ID/key retroactively legitimize a generated baseline identity. NetworkX simple endpoints are intrinsic stable keys; multigraph missing keys are generated and need guards. Honor Python-equivalent key identity where already supported. Missing Graphology/JGF keys may allow patches only with unchanged corresponding native edge sequence. PlantUML/Pajek native relationships are ordinal/occurrence based: conservative unchanged raw relationship section/sequence guard is acceptable, including comments that distinguish otherwise identical rows. Versioned metadata keyed by occurrence alone is not durable after parallel insertion; guard it too. Preserve source-only authority and existing nonambiguous stable-ID operations. Return path/code diagnostics, no lossy fallback or stale replay.
4. Precompute maps/sequences once, no per-label rescanning. Avoid changes to imports/emission/native schema outside identity needs. Update README strict editing scopes, and inform shared owner of fixes/evidence.
5. GREEN focused tests plus existing new/legacy identity suites, source/repo types/conventions/diffcheck; reviewer reruns full verify and actualNode24 native coverage, no floor reductions. Optional native controls may characterize supported inputs but no renderer/full-losslessness claims.

## Commands/done

With explicit Node24 PATH: `pnpm exec vitest run tests/document-identity-additional.test.ts tests/document-identity.test.ts`; relevant converter/document tests; `pnpm typecheck`, `pnpm typecheck:repo`, `pnpm check:conventions`, `git diff --check`. All pass, five original wrong-target cases reject, stable source-only/ID controls pass, only scoped edits. Report STATUS COMPLETE/STOPPED, actual command results, files and deviations. Shared coverage dir may be used by another executor; coordinate before native coverage.

STOP if fixing requires core API changes, a stable native identity operation breaks without justification, or more source ownership is required. Audit controls already found no failures in Graphlib, explicit-ID ELK/drawio, D2/supported Mermaid node patches, matrices or CSV required IDs; do not broaden those without concrete evidence.
