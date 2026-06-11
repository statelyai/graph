# Research: pluggable layout for visual graphs (no layout algorithms of our own)

Date: 2026-06-11 · Status: research/design — nothing here is implemented.

**Goal.** Make @statelyai/graph the best graph library *for visual graphs* by being the best
**substrate under external layout engines** — ELK, Graphviz, dagre, d3-force, etc. — exposed as
plug-and-play pure functions (async where the engine is async, generators where layout is an
iterative physics simulation). Explicit non-goal: implementing layout, overlap removal, edge
routing, or rendering ourselves.

## 1. What we already have (inventory, verified against src/)

- `VisualGraph`/`VisualNode`/`VisualEdge`/`VisualPort` with **required** `x/y/width/height`;
  `direction: 'up'|'down'|'left'|'right'`; `createVisualGraph` resolving defaults.
- Ports with names, advisory `direction`, geometry; ELK adapter maps them to ELK ports + sides
  (now with document-unique ids).
- Format converters that double as engine I/O: `toELK`/`fromELK`, `toDOT`, d3 node/link shape,
  cytoscape elements, xyflow nodes/edges (parents-before-children).
- Unique synergies no competitor has: `getDiff`/`getPatches` + `isLayoutEqual`/`LAYOUT_KEYS`
  (layout-vs-content change classification) → animatable layout transitions; O(1) index reads +
  CSR (cheap relayout loops at 60fps); JSON-serializable everything (layouts can be cached,
  diffed, sent over the wire).

**What we do *not* have:** any code that *runs* a layout engine. Our own integration tests
hand-wire `forceSimulation` and would have to hand-wire `elk.layout()` — exactly the pain every
React Flow user has today. The converters are format I/O, not layout adapters.

## 2. Gap analysis (ranked)

### G1 — Edge routing geometry is dropped (model gap, foundation for everything)
`VisualEdge` carries only a bounding rect. ELK returns `sections` with `startPoint`/`bendPoints`/
`endPoint`; dagre returns `points[]`; Graphviz returns splines. **Our ELK adapter ignores
`sections` entirely** (verified: no `sections`/`bendPoints` handling in src/formats/elk) — the
single most valuable output of an orthogonal router is thrown away. Renderers cannot draw routed
edges without it.
**Fix:** additive optional field on edges — `points?: Array<{ x: number; y: number }>` (polyline
waypoints including endpoints) plus `routing?: 'polyline' | 'orthogonal' | 'splines'` as a
rendering hint. Bézier engines (Graphviz) either downsample to polyline or pass control points
with `routing: 'splines'` (document the convention). Wire through: types, `createGraphEdge`,
`toNodeConfig`/`toEdgeConfig` (compile-time guard forces completeness — the structural guard
pays off here), diff `EDGE_COMPARE_KEYS`, `LAYOUT_KEYS.edge`, ELK/xyflow adapters, schemas.

### G2 — Label geometry is dropped (model gap)
ELK and Graphviz compute positions for edge labels, node labels, and port labels; we emit label
*text* to ELK but ignore returned label coordinates. Without them, edge labels overlap in every
nontrivial diagram.
**Fix:** additive `labelPosition?: { x; y; width?; height? }` on `VisualEdge` (and optionally
`VisualNode`/`VisualPort` for external labels). Same wiring list as G1.

### G3 — No layout function contract (API gap, the core ask)
Nothing defines what "a layout" is. Proposed, fitting the existing prefix conventions:

```ts
// '@statelyai/graph/layout' — zero-dependency core
export interface LayoutOptions {
  direction?: 'up' | 'down' | 'left' | 'right';   // maps from graph.direction by default
  spacing?: { node?: number; layer?: number; edge?: number };
  /** Renderer-owned text measurement; layout engines need sizes, we don't guess them. */
  measure?: (node: GraphNode) => { width: number; height: number };
  /** Pinned nodes keep their current x/y (engines that support it). */
  isFixed?: (node: GraphNode) => boolean;
  /** Deterministic runs for engines with randomness (d3-force randomSource). */
  seed?: number;
}
// One-shot engines (sync or async — get* documented as possibly-async for adapters):
type LayoutFn<O extends LayoutOptions> =
  (graph: Graph | VisualGraph, options?: O) => VisualGraph | Promise<VisualGraph>;
// Iterative engines (physics): cancellable, frame-by-frame, pure per frame:
type IterativeLayoutFn<O extends LayoutOptions> =
  (graph: Graph | VisualGraph, options?: O) => Generator<LayoutFrame, VisualGraph>;
interface LayoutFrame { positions: Record<string, { x: number; y: number }>; alpha: number }
```

Plus pure helpers in the same subpath: `applyLayoutFrame(graph, frame): VisualGraph` (and a
mutable `updateEntities`-based variant for 60fps loops), `getLayoutBounds(graph)`,
`translateGraph`/`centerGraph(graph, rect)` — the utilities every renderer rewrites (G7).
Engine adapters live in subpaths with optional peers, the exact pattern formats already use.

### G4 — No iterative/physics contract
d3-force, ForceAtlas2, and WebCola are tick simulations, not functions. The generator shape above
covers them: each `next()` is one tick (caller controls requestAnimationFrame pacing and
cancellation by dropping the generator); `return` value is the settled `VisualGraph`; a
convenience `getForceLayout(graph, opts)` runs to completion. Pinning via `isFixed` → `fx`/`fy`.
Determinism via `simulation.randomSource()` (d3-force ≥3) seeded from `options.seed` —
deterministic force layout is a differentiator (testable, cacheable layouts).

### G5 — Size measurement contract
Engines need node sizes; text measurement belongs to the renderer (canvas/DOM). The `measure`
option plus "already-sized `VisualGraph` in → sizes respected" rule covers both worlds, with a
documented default (`width/height ?? a configurable constant`). No model change.

### G6 — Constraint vocabulary without model creep
Pinning, per-node engine options (ELK `layoutOptions`), incremental layout (ELK `interactive`
mode seeds from previous positions — we *have* previous positions, a natural fit). All exposed as
adapter options/callbacks (`isFixed`, `nodeOptions?(node)`), not new model fields.

### G7 — Geometry utilities — folded into G3's helper list.

### G8 — Layout ↔ diff/animation (synergy to surface, near-zero work)
`getPatches(before, after)` over two layouts already yields a tweenable position delta and
`isLayoutEqual` classifies it. One helper + docs (`getLayoutPatches`) and a demo make this the
headline feature: **animated transitions between any two engines' layouts** — e.g. dagre → ELK
orthogonal, or force → layered. No competitor has this renderer-agnostically.

### G9 — Graphviz: we emit DOT but can't read a layout back
`toDOT` exists; nothing parses Graphviz output positions. `@hpcc-js/wasm-graphviz` (async WASM)
supports `json`/`plain` output for all engines (dot, neato, fdp, sfdp, circo, twopi, osage,
patchwork) — `plain` format is a trivially parseable line format (node x y w h, edge spline
points). Adapter: `toDOT` → `graphviz.layout(dot, 'plain'|'json', engine)` → positions + splines
into `VisualGraph` (needs G1 for splines). This unlocks **eight engines through one adapter**.

### G10 — Workers (explicitly deferred)
elkjs accepts a worker factory; ForceAtlas2 ships a worker variant. Adapters should pass engine
options through untouched and stay worker-agnostic. Not our layer.

## 3. Engine survey

| Engine | Package (peer) | Mode | Hierarchy | Ports | Edge routing | Deterministic | Adapter effort |
|---|---|---|---|---|---|---|---|
| **ELK** (layered/mrtree/force/stress/radial/rectpacking) | `elkjs` (already a peer) | async | ✅ | ✅ | ✅ sections/bends | ✅ | **XS** — toELK/fromELK exist; run + G1/G2 capture |
| **Graphviz** (dot/neato/fdp/sfdp/circo/twopi/osage/patchwork) | `@hpcc-js/wasm-graphviz` | async (WASM) | clusters | DOT ports (partial) | ✅ splines | ✅ | **S–M** — toDOT exists; parse `plain`/`json` back |
| **dagre** | `@dagrejs/dagre` (already a devDep) | sync | limited | ❌ | ✅ points[] | ✅ | **XS** |
| **d3-force** | `d3-force` (already a peer) | iterative | ❌ | ❌ | ❌ | ✅ via `randomSource(seed)` | **S** — generator adapter |
| **ForceAtlas2 / noverlap** | `graphology-layout-forceatlas2` | iterative/worker | ❌ | ❌ | ❌ | ✅ | **S** (bridge via existing graphology interop) — stretch |
| **WebCola** (constraints, flow layout) | `webcola` | iterative | groups | ❌ | partial | ~ | **M** — stretch; low maintenance activity, verify before committing |
| **cytoscape layout ecosystem** (fcose, cose-bilkent, cola, klay…) | `cytoscape` + layout exts (peers) | mixed, headless-capable | ✅ (fcose) | ❌ | ❌ | varies | **S** — one bridge via existing cytoscape converter unlocks the whole ecosystem |
| Tidy tree (d3-hierarchy) | `d3-hierarchy` | sync | trees | ❌ | ❌ | ✅ | **XS** — stretch |

## 4. Competitive position for visual graphs

Renderer-locked layout is the industry norm: cytoscape layouts only run inside cytoscape; AntV
layouts inside G6; vis-network's physics inside vis-network; graphology's layouts are
graphology-coupled and have no ELK/Graphviz story. React Flow — the largest node-editor
audience — ships **no layout at all**; its docs tell users to hand-wire dagre or elkjs
(everyone's first day of pain). A typed, renderer-agnostic, plain-JSON layout contract with
first-class adapters for ELK + Graphviz + dagre + d3-force, plus diffable/animatable/cacheable
results, is an empty niche — and it composes with what we already won (fastest core, ports,
hierarchy, 15 formats, differential-tested correctness).

## 5. Proposed sequencing (research only — not started)

1. **G1 + G2 model fields** + capture routing/labels in `fromELK` (~0.5–1 d) — foundation;
   additive/non-breaking; the `toNodeConfig`/`toEdgeConfig` compile guard enforces full wiring.
2. **`@statelyai/graph/layout` core** — contract types + `applyLayoutFrame`/bounds/center
   helpers + measurement/pinning options (~0.5 d).
3. **ELK + dagre adapters** (`getElkLayout`, `getDagreLayout`) with round-trip tests against
   fixed fixtures (~0.5 d).
4. **d3-force generator adapter** (`genForceLayout`/`getForceLayout`) with seeded determinism
   tests (~0.5–1 d).
5. **Graphviz adapter** (`getGraphvizLayout`, engine option) parsing `plain`/`json` (~0.5–1 d).
6. **Layout-transition helper + demo** (G8) — feeds the deferred docs/adoption bundle.
7. Stretch: cytoscape-layout bridge, ForceAtlas2 bridge, tidy-tree.

Naming note for CLAUDE.md when implemented: `get*Layout` adapters may return Promises (engine
async-ness is not ours to hide); iterative engines use the existing `gen*` prefix — the
convention table needs that one-line extension.

## 6. Open questions (decide at implementation time)

- `points` as flat polyline vs ELK-style sections: polyline + `routing` hint chosen here for
  renderer simplicity; revisit if a consumer needs multi-section fidelity.
- Spline fidelity: downsample Graphviz béziers to polyline by default, raw control points behind
  an option?
- Should `getElkLayout` default to capturing port positions back onto `VisualPort` (yes, ELK
  computes them — currently partially wired)?
- Where do layout-engine peer deps stop: every adapter its own subpath + optional peer
  (established pattern) — no umbrella package.
