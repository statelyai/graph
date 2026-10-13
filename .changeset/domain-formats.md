---
"@statelyai/graph": minor
---

Add explicit GraphSON 3 typed TinkerGraph, DGML, CX2 and RDF 1.1 dataset/syntax adapters with strict native profiles and source-preserving document converters. RDF syntax uses optional N3; pure JSON/dataset modules remain dependency-free.

Fix wrong-entity document edits across 13 legacy converters and new DGML. Ambiguous source identity changes and unsupported mappings now reject with diagnostics rather than targeting another entity or replaying stale source. Expand pinned independent native validators, package subpath contracts and measured coverage gates.
