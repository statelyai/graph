---
"@statelyai/graph": minor
---

Make `parentId`, `initialNodeId`, and `shape` optional on `GraphNode`. These fields are no longer defaulted to `null`/`'rectangle'` by `createGraph`/`createVisualGraph`, they are simply omitted when not provided.

Add empty string validation for node/edge IDs, `parentId`, `sourceId`, and `targetId`.
