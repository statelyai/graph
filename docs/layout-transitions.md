# Layout transitions

In `@statelyai/graph`, a layout is not engine state — it's **data**. Every adapter returns a plain-JSON `VisualGraph`, and the graph itself stays the single source of truth. So "switch from dagre to ELK" is just two `VisualGraph`s, and `genLayoutTransition` tweens between them. Libraries that keep layout state inside engine or class instances can't do this — there's nothing to diff or interpolate; here it's two JSON values.

## Tween between two engines

```ts
import { createGraph } from '@statelyai/graph';
import { getDagreLayout } from '@statelyai/graph/layout/dagre';
import { getElkLayout } from '@statelyai/graph/layout/elk';
import { applyLayoutFrame, genLayoutTransition } from '@statelyai/graph/layout';

const graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b' },
    { id: 'e2', sourceId: 'a', targetId: 'c' },
    { id: 'e3', sourceId: 'b', targetId: 'd' },
    { id: 'e4', sourceId: 'c', targetId: 'd' },
  ],
});

// Same graph, two engines — both pure, the input is never mutated.
const before = getDagreLayout(graph, { direction: 'down' });
const after = await getElkLayout(graph, { direction: 'down' });

// Drive the tween: one frame per animation frame.
const transition = genLayoutTransition(before, after, {
  steps: 45, // default 30
  ease: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic (default: smoothstep)
});

function tick() {
  const step = transition.next();
  if (step.done) return; // step.value === after (the target VisualGraph)
  applyLayoutFrame(before, step.value);
  render(before);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Nodes are matched by id; nodes without a position in `from` (or absent from it) start at their `to` position. `alpha` cools linearly 1 → 0, like the physics layouts, so the same render loop handles both.

## Edges: be honest

From the `genLayoutTransition` JSDoc: *"Edge routes are not interpolated — frames carry node positions only; hide or re-route edges during the transition."* Interpolating a dagre polyline into an ELK orthogonal route point-by-point is meaningless. The usual moves:

- fade edges out, tween nodes, fade the target routes in, or
- draw straight source→target lines during the tween and restore `edge.points` when it finishes.

## Diff-driven transitions

Layouts are plain graphs, so `getPatches` / `updateGraphWithPatches` (from `@statelyai/graph`) work on them directly. A patch set between two layouts tells you exactly which nodes moved — e.g. to skip tweening unmoved nodes:

```ts
import { getPatches } from '@statelyai/graph';

const patches = getPatches(before, after);
const moved = new Set(
  patches
    .filter((p) => p.op === 'updateNode' && ('x' in p.data || 'y' in p.data))
    .map((p) => (p as { id: string }).id),
);

for (const frame of genLayoutTransition(before, after)) {
  for (const id of Object.keys(frame.positions)) {
    if (!moved.has(id)) delete frame.positions[id]; // applyLayoutFrame skips absent nodes
  }
  applyLayoutFrame(before, frame);
  render(before);
}
```

And because patches are first-class data, undo/redo falls out for free: keep the patch sets (or use `getDiff` + `getInvertedDiff`) and `updateGraphWithPatches` to step layout history in either direction.

## Physics handoff: the "tidy up" button

Let users fling nodes around with a force simulation, then snap the mess into a hierarchy — settle d3-force, lay out with ELK, tween between them:

```ts
import { getForceLayout } from '@statelyai/graph/layout/d3-force';
import { getElkLayout } from '@statelyai/graph/layout/elk';
import { applyLayoutFrame, genLayoutTransition } from '@statelyai/graph/layout';

const settled = getForceLayout(graph, { seed: 42 }); // run simulation to completion

async function tidyUp() {
  const tidy = await getElkLayout(settled, { algorithm: 'layered' });
  for (const frame of genLayoutTransition(settled, tidy)) {
    applyLayoutFrame(settled, frame);
    render(settled);
    await nextAnimationFrame();
  }
}
```

The reverse works too — `genLayoutTransition(tidy, settled)` — or hand the tidy positions back to `genForceLayout`, which seeds its simulation from existing positions for an incremental re-scatter. Engines compose, because the only thing passing between them is the graph.
