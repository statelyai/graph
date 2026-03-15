---
"@statelyai/graph": minor
---

Add walk generators and coverage utilities for model-based testing.

- `genRandomWalk()`, `genWeightedRandomWalk()`, `genQuickRandomWalk()`, `genPredefinedWalk()` — step-by-step graph traversal generators that yield `GraphStep`, with optional `seed` for deterministic replay
- Composable stop conditions: `takeSteps()`, `takeUntilNode()`, `takeUntilEdge()`, `takeUntilNodeCoverage()`, `takeUntilEdgeCoverage()`
- `getCoverage()` computes node/edge coverage stats from a walk
- `filter` option for edge guards, `onStep` callback for actions — keeps graph JSON-serializable
