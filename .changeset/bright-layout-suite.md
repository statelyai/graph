---
'@statelyai/graph': minor
---

Layout suite round two: transitions, geometry utilities, portable constraints, and four more engines.

- **`genLayoutTransition(from, to, options?)`** (`@statelyai/graph/layout`, zero-dep) — tween between two layouts of the same graph: yields interpolated `LayoutFrame`s (drive with `applyLayoutFrame`, one per animation frame) and returns the target layout. Lay out with one engine, re-lay out with another, morph live. Options: `steps` (default 30), `ease` (default smoothstep).
- **Geometry utilities** (`@statelyai/graph/layout`) — `translateGraph(graph, dx, dy)` and `centerGraph(graph, rect)` (**mutable**, in place): shift/center node positions, edge route `points`, and edge label rects. Hierarchy-aware — parent-relative children and container-relative edge routes are left alone.
- **`LayoutOptions.constraints`** — portable, advisory layout constraints. First constraint: `layer(node)` assigns nodes to ordered layers along the flow axis. ELK maps it to partitions (`elk.partitioning.partition`); the Graphviz `dot` engine maps it to `{ rank=same; … }` groups; engines without a layer concept ignore it.
- **`@statelyai/graph/layout/forceatlas2`** — `getForceAtlas2Layout` (sync; optional peers `graphology` + `graphology-layout-forceatlas2`): seeded determinism, native pinning via `isFixed`, edge `weight` influence.
- **`@statelyai/graph/layout/d3-hierarchy`** — `getTidyTreeLayout` (sync; optional peer `d3-hierarchy`): Reingold–Tilford tidy tree. Root from `rootId` → `initialNodeId` → unique source; forests supported; non-tree extra edges preserved (spanning-tree layout).
- **`@statelyai/graph/layout/webcola`** — `getColaLayout` (sync; optional peer `webcola`): constraint-based layout with overlap avoidance, seeded determinism, `isFixed` pinning, DAG flow via `direction`.
- **`@statelyai/graph/layout/cytoscape`** — `getCytoscapeLayout` (async; optional peer `cytoscape`, headless): bridges cytoscape's layout ecosystem (`grid`, `circle`, `concentric`, `breadthfirst`, `cose`, plus caller-registered extensions via the injectable `cy` option). Compound nodes map to cytoscape parents.

The package smoke test exercises all nine layout entry points against the packed tarball.
