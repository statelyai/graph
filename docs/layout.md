# Layout

`@statelyai/graph` ships **no layout algorithms of its own**. Layout is a set of thin, pure adapters over proven external engines: a plain-JSON `Graph` goes in, a positioned `VisualGraph` comes out, and the engine stays an optional peer dependency on its own subpath. Engine character is not hidden — async engines give you a `Promise`, iterative engines give you a `Generator`, sync engines return directly.

| Engine | Subpath | Function | Character | Peer dep(s) | Best for |
|---|---|---|---|---|---|
| ELK | `@statelyai/graph/layout/elk` | `getElkLayout` | async | `elkjs` | hierarchical/compound graphs, ports |
| dagre | `@statelyai/graph/layout/dagre` | `getDagreLayout` | sync | `@dagrejs/dagre` | quick DAG layout |
| Graphviz | `@statelyai/graph/layout/graphviz` | `getGraphvizLayout` | async (WASM) | `@hpcc-js/wasm-graphviz` | 8 classic engines, spline edge routing |
| d3-force | `@statelyai/graph/layout/d3-force` | `genForceLayout`, `getForceLayout` | generator / sync | `d3-force` | physics, tick-by-tick animation |
| ForceAtlas2 | `@statelyai/graph/layout/forceatlas2` | `getForceAtlas2Layout` | sync | `graphology`, `graphology-layout-forceatlas2` | large-graph physics |
| d3-hierarchy | `@statelyai/graph/layout/d3-hierarchy` | `getTidyTreeLayout` | sync | `d3-hierarchy` | trees (Reingold–Tilford) |
| WebCola | `@statelyai/graph/layout/webcola` | `getColaLayout` | sync | `webcola` | constraint-based, overlap-free |
| Cytoscape | `@statelyai/graph/layout/cytoscape` | `getCytoscapeLayout` | async | `cytoscape` | the cytoscape layout ecosystem |

Shared utilities and types live on `@statelyai/graph/layout`: `LayoutOptions`, `LayoutConstraints`, `LayoutFn`, `IterativeLayoutFn`, `LayoutFrame`, `DEFAULT_NODE_SIZE`, `getNodeSize`, `applyLayoutFrame`, `getLayoutBounds`, `genLayoutTransition`, `translateGraph`, `centerGraph`.

## The contract

Every adapter is a `LayoutFn`: `(graph, options?) => VisualGraph | Promise<VisualGraph>`. The input graph is never mutated.

**Node geometry.** `node.x`/`node.y` are the **top-left** corner (engines that report centers — dagre, Graphviz, d3, cola, cytoscape — are converted for you).

**Edge routes.** Engines that route edges write `edge.points` (waypoints ordered **tail → head**) and `edge.routing`:

- `'polyline'` — straight segments through the points (dagre).
- `'orthogonal'` — axis-aligned segments (ELK layered routing).
- `'splines'` — bezier control points in the Graphviz convention: 3n+1 chained cubic beziers, endpoints included.

d3-force, ForceAtlas2, d3-hierarchy, WebCola, and Cytoscape position nodes only — no `points`.

**Edge labels.** `edge.x`/`edge.y`/`edge.width`/`edge.height` are canonically the **edge-label rect**. Give an edge a label plus `width`/`height` and label-aware engines (ELK, dagre, Graphviz) reserve space and write the placed rect back.

**Coordinate systems.** ELK is the one engine that produces **parent-relative** child coordinates (a node with `parentId` is positioned within its parent — the xyflow convention). dagre and cytoscape support compound graphs but emit **absolute** coordinates; all flat engines are absolute. Graphviz rejects compound graphs (throws — use ELK or `getFlattenedGraph()` first).

## Sizing: the `measure` callback

Text measurement belongs to the renderer, so adapters never guess. `getNodeSize(node, options)` resolves every node's size through a fixed chain:

1. `options.measure(node)` — your callback (e.g. canvas `measureText`),
2. the node's own `width`/`height`,
3. `DEFAULT_NODE_SIZE` (`{ width: 100, height: 50 }`).

Zero or absent dimensions count as **unset** and fall through — layout engines overlap zero-sized nodes.

```ts
import { getElkLayout } from '@statelyai/graph/layout/elk';

const laidOut = await getElkLayout(graph, {
  measure: (node) => measureText(node.label), // renderer owns text metrics
});
```

## Common options

All adapters accept `LayoutOptions`; each extends it with engine-specific fields.

- **`direction`** — `'up' | 'down' | 'left' | 'right'`, defaulting to `graph.direction ?? 'down'`. Maps to dagre/Graphviz `rankdir`, ELK direction, d3-hierarchy axes, and WebCola `flowLayout`. Caveat: cola only separates source-before-target along the axis, so `'up'`/`'left'` flow the same as `'down'`/`'right'`. Cytoscape ignores it (use `layoutOptions`).
- **`spacing`** — `{ node?, layer? }` hints. ELK: `elk.spacing.nodeNode` / `elk.layered.spacing.nodeNodeBetweenLayers`; dagre: `nodesep` / `ranksep`; Graphviz: `nodesep` / `ranksep` (converted to inches); d3-hierarchy: breadth/depth steps; WebCola: `spacing.layer` is the flow gap. Force engines use `linkDistance` instead; cytoscape ignores it.
- **`seed`** — determinism for engines with randomness; same seed, same layout.
  - **Honored:** d3-force (drives `randomSource` *and* the initial scatter), ForceAtlas2 and WebCola (seeded initial scatter for unpositioned nodes — both engines are otherwise deterministic), Graphviz (maps to the `start` attribute, used by the randomized engines `neato`/`fdp`/`sfdp`).
  - **Ignored:** dagre, ELK, d3-hierarchy (deterministic anyway), and cytoscape — the discrete layouts are deterministic and **cose is not seedable**.
- **`isFixed`** — pin nodes at their current `x`/`y`:
  - d3-force: `fx`/`fy` (exact). ForceAtlas2: the `fixed` node attribute (native). Cytoscape: `locked: true` (layouts skip locked nodes; only nodes that already have a position). WebCola: cola's `fixed` flag — held with a large-but-finite weight during overlap projection, so pinning is within a small tolerance, not exact. Pinning also disables cola's final centering.
  - Not supported by ELK, dagre, Graphviz, or d3-hierarchy.

Positioned input also matters to the physics engines: d3-force, ForceAtlas2, and WebCola seed their simulations from existing node positions, so re-running them is an **incremental relayout** from the current arrangement.

## Constraints

`options.constraints` is a portable, **advisory** vocabulary (like port `direction`): engines that can express a constraint honor it, the rest ignore it.

`constraints.layer: (node) => number | undefined` assigns nodes to ordered layers along the flow axis. Same value → same layer; smaller values come earlier; `undefined` leaves the node unconstrained.

| Constraint | ELK | Graphviz (`dot`) | dagre | force engines |
|---|---|---|---|---|
| `layer` | partitions (`elk.partitioning.partition` + `elk.partitioning.activate`) | `{ rank=same; … }` groups | ignored | ignored |

Note Graphviz's semantics: `rank=same` groups nodes into the same layer, but ordering *between* constrained layers still follows the edges. Only the `dot` engine has ranks.

For anything beyond the portable vocabulary, every adapter has a raw escape hatch, always applied **last** (overrides everything the adapter computed):

- ELK: `layoutOptions` (raw ELK options) — plus `algorithm` (`'layered'` default, `'mrtree'`, `'force'`, `'stress'`, `'radial'`, `'rectpacking'`).
- dagre: `graphOptions` (raw `setGraph` options).
- Graphviz: `graphAttributes` (raw graph attributes) — plus `engine` (`'dot'`, `'neato'`, `'fdp'`, `'sfdp'`, `'circo'`, `'twopi'`, `'osage'`, `'patchwork'`).
- ForceAtlas2: `settings` (`scalingRatio`, `gravity`, `linLogMode`, `barnesHutOptimize`, …).
- Cytoscape: `layoutOptions` (raw per-layout options — `boundingBox`, `roots`, iteration counts) plus `name`.

## Iterative layouts

`genForceLayout` is an `IterativeLayoutFn`: each `next()` advances one simulation tick and yields a `LayoutFrame` — `{ positions: Record<string, Point>, alpha }` with top-left positions by node id and `alpha` cooling 1 → 0. **You own pacing** (one tick per animation frame) **and cancellation** (just stop iterating / drop the generator). The generator's *return value* is the settled `VisualGraph`.

```ts
import { genForceLayout } from '@statelyai/graph/layout/d3-force';
import { applyLayoutFrame } from '@statelyai/graph/layout';

const sim = genForceLayout(graph, { seed: 42 });
let cancelled = false;

function tick() {
  if (cancelled) return; // cancellation = stop calling next()
  const step = sim.next();
  if (step.done) return; // step.value is the settled VisualGraph
  applyLayoutFrame(graph, step.value); // mutates node x/y in place — cheap, index-safe
  render(graph);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

`applyLayoutFrame` writes positions onto the graph in place; positions are non-structural, so no `invalidateIndex()` is needed and it's cheap enough for per-frame use. Nodes absent from a frame are left untouched. `getForceLayout` runs the same generator to completion when you don't need animation.

## Geometry utilities

**`getLayoutBounds(graph)`** — bounding rect of all positioned nodes *and* edge route points; zero rect when there's no geometry. Ideal for an SVG viewBox:

```ts
import { getLayoutBounds } from '@statelyai/graph/layout';

const b = getLayoutBounds(laidOut);
svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
```

**`translateGraph(graph, dx, dy)`** — mutable shift of node positions, edge `points`, and edge label rects. It is **hierarchy-aware**: children (`parentId` set) use parent-relative coordinates (the ELK/xyflow convention), so only top-level nodes are shifted — children ride along with their parents. Likewise an edge's geometry is shifted only when its containing coordinate system is the root (the LCA of its endpoints is no node).

**`centerGraph(graph, rect)`** — translate in place so the layout bounds' center coincides with `rect`'s center; no-op for graphs without geometry.

```ts
import { centerGraph } from '@statelyai/graph/layout';

centerGraph(laidOut, { x: 0, y: 0, width: canvas.width, height: canvas.height });
```

## Web workers

**ELK** has worker support built into `elkjs` — inject a worker-backed instance via the `elk` option (any object with `layout(graph): Promise<ElkNode>` satisfies `ElkLike`):

```ts
import ELK from 'elkjs/lib/elk-api';
import { getElkLayout } from '@statelyai/graph/layout/elk';

const elk = new ELK({
  workerFactory: () =>
    new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)),
  // or: workerUrl: '...'
});

const laidOut = await getElkLayout(graph, { elk });
```

**Cytoscape** uses the same injection pattern via the `cy` option — pass your own `cytoscape` factory (e.g. one with extensions registered via `cytoscape.use(...)` for cola/fcose/dagre layouts).

**The sync engines** (dagre, WebCola, ForceAtlas2, d3-hierarchy) block the thread they run on — but graphs are plain JSON, which is exactly the point of the serializable model: `postMessage` the graph to your own worker (structured clone is free), run the whole layout call there, and post the `VisualGraph` back. No serialization layer to write.

## Choosing an engine

- **Compound graphs or ports?** ELK — hierarchy and ports are first-class; it's the only engine producing parent-relative coordinates.
- **A quick synchronous DAG?** dagre. Note it ignores per-edge `mode` (mixed graphs → ELK).
- **Classic looks or spline edges?** Graphviz — eight engines behind one option.
- **Animated physics?** d3-force, driven frame-by-frame.
- **Physics on big graphs?** ForceAtlas2 (Barnes–Hut via `settings.barnesHutOptimize`).
- **Strict trees?** d3-hierarchy tidy tree (non-trees fall back to a spanning tree; cyclic graphs need `rootId`).
- **No overlaps, flow constraints?** WebCola — overlap avoidance is always on.
- **Something exotic (concentric, fcose, …)?** Cytoscape — one adapter, the whole ecosystem.

Switching later is cheap: layouts are data. See [layout-transitions.md](./layout-transitions.md).
