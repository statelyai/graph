---
'@statelyai/graph': minor
---

Pluggable layout: a renderer-agnostic layout contract with adapters for ELK, Graphviz, dagre, and d3-force — no layout algorithms of our own, just typed plug-and-play over the plain-JSON graph.

- **Model:** edges gain `points?: {x,y}[]` (route waypoints incl. endpoints, tail→head) and `routing?: 'polyline' | 'orthogonal' | 'splines'` (`splines` = Graphviz 3n+1 bezier control-point convention). Both round-trip through every full-fidelity format, diff/patch, and `LAYOUT_KEYS`. Edge `x/y/width/height` are now canonically the **edge-label rect** (top-left + size) — engines read `width`/`height` as label dimensions and write computed label positions back; this matches dagre's own convention and was previously undefined.
- **`@statelyai/graph/layout`** (zero-dep): `LayoutFn`/`IterativeLayoutFn`/`LayoutFrame`/`LayoutOptions` (direction, spacing, `measure` for renderer-owned text measurement, `isFixed` pinning, `seed`), plus `applyLayoutFrame` (per-animation-frame position writes, safe under the index contract), `getLayoutBounds`, `getNodeSize`.
- **`@statelyai/graph/layout/elk`** — `getElkLayout` (async; optional peer `elkjs`): hierarchy + ports first-class, orthogonal edge routes captured into `points`, computed edge label rects, all ELK algorithms via `algorithm`/`layoutOptions`, injectable ELK instance for web workers. (`fromELK` now also captures routed sections and label geometry for anyone running ELK manually.)
- **`@statelyai/graph/layout/dagre`** — `getDagreLayout` (sync; optional peer `@dagrejs/dagre`): polyline routes, label rects, multigraph parallel edges, compound support.
- **`@statelyai/graph/layout/d3-force`** — `genForceLayout` generator (one simulation tick per `next()`, caller owns pacing/cancellation; yields `LayoutFrame`s, returns the settled `VisualGraph`) + `getForceLayout`; seeded determinism (same seed ⇒ same layout), `isFixed` pinning; optional peer `d3-force`.
- **`@statelyai/graph/layout/graphviz`** — `getGraphvizLayout` (async WASM; optional peer `@hpcc-js/wasm-graphviz`): all eight Graphviz engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork), spline control points into `points`/`routing: 'splines'`, label positions, y-flip/center→top-left conversion handled.

The package smoke test exercises every adapter against the packed tarball.
