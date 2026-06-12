# React Flow + ELK: automatic layout cookbook

A recipe for building a React Flow (xyflow v12) node-graph UI where layout is
computed by ELK and the graph — not React Flow's node array — is the single
source of truth.

## The pipeline

```
domain model ─createGraph→ @statelyai/graph ─getElkLayout→ VisualGraph
                    ▲                                          │ toXYFlow
                    └────── fromXYFlow ◄── user edits ◄── <ReactFlow>
```

Layout is a pure function: `getElkLayout(graph)` returns a new `VisualGraph`
with node positions/sizes, routed edge `points`, and edge-label rects. Child
node coordinates are parent-relative — the same convention React Flow uses, so
positions map 1:1.

## 1. Build the graph

```ts
import { createGraph } from '@statelyai/graph';

const graph = createGraph({
  id: 'pipeline',
  nodes: [
    { id: 'fetch', label: 'Fetch', ports: [{ name: 'result', direction: 'out' }] },
    { id: 'transform', label: 'Transform', parentId: 'stage' },
    { id: 'stage', label: 'Stage' }, // compound parent
    { id: 'render', label: 'Render', ports: [{ name: 'input', direction: 'in' }] },
  ],
  edges: [
    { id: 'e1', sourceId: 'fetch', sourcePort: 'result', targetId: 'transform' },
    { id: 'e2', sourceId: 'transform', targetId: 'render', targetPort: 'input' },
  ],
});
```

## 2. Layout, convert, render

```tsx
import { useEffect, useState } from 'react';
import { ReactFlow, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getElkLayout } from '@statelyai/graph/layout/elk';
import { toXYFlow } from '@statelyai/graph/xyflow';

export function Diagram() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    let cancelled = false;
    getElkLayout(graph, { algorithm: 'layered', direction: 'right' }).then(
      (laidOut) => {
        if (cancelled) return;
        const flow = toXYFlow(laidOut);
        setNodes(flow.nodes as Node[]);
        setEdges(flow.edges as Edge[]);
      },
    );
    return () => { cancelled = true; };
  }, []);

  return <ReactFlow nodes={nodes} edges={edges} fitView />;
}
```

`toXYFlow` maps `node.x/y → position.{x,y}` and `width`/`height` directly,
emits parents before children (a React Flow requirement), and maps
`edge.sourcePort/targetPort → sourceHandle/targetHandle`. Everything it can't
express natively (label, color, ports, weight, …) rides along under a reserved
`__statelyai` key in `data`, so `fromXYFlow` can round-trip it losslessly.

Two render-side notes:

- React Flow renders the *top-level* `edge.label`, but `toXYFlow` stores the
  label at `edge.data.label`. Lift it if you want built-in edge labels:
  `flow.edges.map((e) => ({ ...e, label: (e.data as any)?.label }))`.
- `node.shape` becomes React Flow's `type`. Only set `shape` to values you've
  registered in `nodeTypes`, or React Flow falls back to the default node.

## 3. Measure real node sizes (two-pass)

ELK needs node dimensions before it can lay anything out, but real dimensions
come from the DOM. The honest pattern is two passes: **render → measure →
layout → re-render**. React Flow measures nodes for you and exposes the result
on `node.measured`; `useNodesInitialized()` tells you when that's done.

```tsx
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { DEFAULT_NODE_SIZE } from '@statelyai/graph/layout';

function useElkLayout(setNodes: (n: Node[]) => void, setEdges: (e: Edge[]) => void) {
  const nodesInitialized = useNodesInitialized();
  const { getNodes } = useReactFlow();

  useEffect(() => {
    if (!nodesInitialized) return; // pass 1 rendered at (0,0); DOM now measured
    const sizes = new Map(getNodes().map((n) => [n.id, n.measured]));

    getElkLayout(graph, {
      measure: (node) => {
        const m = sizes.get(node.id);
        return m?.width && m?.height
          ? { width: m.width, height: m.height }
          : DEFAULT_NODE_SIZE;
      },
    }).then((laidOut) => {
      const flow = toXYFlow(laidOut);
      setNodes(flow.nodes as Node[]);
      setEdges(flow.edges as Edge[]);
    });
  }, [nodesInitialized]);
}
```

Pass 1 renders `toXYFlow(graph)` with whatever positions exist (all `0,0` for
a fresh graph — hide or fade the canvas to avoid a flash). Sizes resolve as
`measure` → the node's own `width`/`height` → `DEFAULT_NODE_SIZE` (100×50);
layout adapters never guess text sizes. Reuse measured sizes on later runs.

## 4. Layout in a web worker

ELK layouts of large graphs can block the main thread. `elkjs` can run in a
worker, and `getElkLayout` accepts any pre-constructed instance via its
**`elk`** option (anything with a `layout(graph): Promise` method):

```ts
import ELK from 'elkjs/lib/elk-api'; // slim API — no bundled engine
import { getElkLayout } from '@statelyai/graph/layout/elk';

const elk = new ELK({
  workerFactory: () =>
    new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url)),
});
// or, serving the worker file yourself:
// const elk = new ELK({ workerUrl: '/elk-worker.min.js' });

const laidOut = await getElkLayout(graph, { elk });
```

Without `elk`, the adapter constructs a default in-process `new ELK()` once
and reuses it.

## 5. Smooth re-layout

When the graph changes (node added, edge removed), lay out again and tween
between the old and new positions. `genLayoutTransition` yields interpolated
frames; `applyLayoutFrame` writes a frame's positions onto the graph in place.
Drive it with `requestAnimationFrame`:

```tsx
import {
  genLayoutTransition,
  applyLayoutFrame,
} from '@statelyai/graph/layout';

let current: VisualGraph = laidOut; // last settled layout

async function relayout() {
  const next = await getElkLayout(current, { elk });
  const frames = genLayoutTransition(current, next, { steps: 20 });

  const tick = () => {
    const { value, done } = frames.next();
    if (done) {
      current = value; // generator returns the settled VisualGraph
      const flow = toXYFlow(current);
      setNodes(flow.nodes as Node[]);
      setEdges(flow.edges as Edge[]);
      return;
    }
    applyLayoutFrame(current, value); // mutate positions in place
    setNodes(toXYFlow(current).nodes as Node[]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

Frames carry node positions only — edge routes are not interpolated, so apply
the final edge geometry once at the end (as above) or hide edges mid-tween.
Alternatively, skip the tween entirely and just `setNodes` with the new
layout; add CSS transitions on `.react-flow__node` if you want easing without
a loop. `getLayoutBounds(graph)` and `centerGraph(graph, rect)` help keep a
fresh layout centered in your viewport before converting.

## 6. Compound nodes and ports

**Compound:** ELK is the engine of choice here — `parentId` hierarchy is
first-class, parents are sized around their children, and child coordinates
come back parent-relative, which is exactly what React Flow expects.
`toXYFlow` sets `parentId` on child nodes and orders parents first. It does
*not* set `extent` — add it yourself if children should stay confined:

```ts
const nodes = flow.nodes.map((n) =>
  n.parentId ? { ...n, extent: 'parent' as const } : n,
) as Node[];
```

**Ports:** edges reference ports by name, and `toXYFlow` maps them to
`sourceHandle`/`targetHandle`. The port definitions themselves travel in node
metadata — render them as handles in a custom node, with `Handle.id` equal to
the port name:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';

function PortNode({ data }: NodeProps) {
  const meta = (data as any).__statelyai?.node;
  return (
    <div className="port-node">
      {meta?.label}
      {(meta?.ports ?? []).map((port: { name: string; direction?: string }) => (
        <Handle
          key={port.name}
          id={port.name} // must match — edges point at it via sourceHandle/targetHandle
          type={port.direction === 'in' ? 'target' : 'source'}
          position={port.direction === 'in' ? Position.Left : Position.Right}
        />
      ))}
    </div>
  );
}
```

Port `direction` is advisory; ELK uses it for port-side placement during
layout, and you choose how to render it.

## 7. Back to the graph

After the user drags nodes or rewires edges, fold React Flow's state back into
a graph with `fromXYFlow`. Keep the `data` blob from `toXYFlow` — it carries
graph-level metadata (`id`, `mode`, `direction`, …):

```ts
import { fromXYFlow } from '@statelyai/graph/xyflow';

const updated = fromXYFlow({
  nodes: getNodes(),
  edges: getEdges(),
  data: flowData, // the `data` returned by toXYFlow
});
```

`fromXYFlow` prefers `node.measured` sizes (React Flow's DOM measurements)
over declared `width`/`height`, maps `sourceHandle`/`targetHandle` back to
ports, and restores original node/edge `data` from the `__statelyai` metadata.
The result is a `VisualGraph` — your single source of truth — ready for the
next `getElkLayout` pass, persistence, or any of the library's queries and
algorithms.
