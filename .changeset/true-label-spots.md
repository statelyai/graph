---
'@statelyai/graph': minor
---

xyflow: labels now land where the renderers actually read them. `toXYFlow` emits edge labels as the top-level `edge.label` (the prop React Flow / Svelte Flow render — previously the label went to `edge.data.label`, which built-in edges ignore) and node labels as `data.label` (what React Flow's default node renders). `fromXYFlow` reads both spots back for external React Flow input, and full-fidelity round-tripping via the `__statelyai` metadata is unchanged. If you relied on `edge.data.label` in `toXYFlow` output, read `edge.label` instead.
