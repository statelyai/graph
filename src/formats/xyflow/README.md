# xyflow

Converter for [xyflow](https://xyflow.com/) (React Flow / Svelte Flow) node and edge objects. Works with `VisualGraph` since xyflow expects `position` and size.

## Resources

- [React Flow documentation](https://reactflow.dev/)
- [Svelte Flow documentation](https://svelteflow.dev/)

## API

<!-- exported symbols from src/formats/xyflow/index.ts -->

```ts
import { toXYFlow, fromXYFlow, xyflowConverter } from '@statelyai/graph/xyflow';
import { createVisualGraph } from '@statelyai/graph';

const graph = createVisualGraph({
  nodes: [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 200, y: 100, width: 100, height: 50 },
  ],
  edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
});

const flow = toXYFlow(graph);
// { nodes: [{ id: 'a', position: {x:0,y:0}, ... }], edges: [{ id: 'e0', source: 'a', target: 'b' }] }

const roundTripped = fromXYFlow(flow);
```

### Field mapping

| Graph | xyflow |
| --- | --- |
| `node.x`, `node.y` | `node.position` |
| `node.width`, `node.height` | `node.width`, `node.height` (reads `measured` / `initialWidth` on import) |
| `node.shape` | `node.type` |
| `node.parentId` | `node.parentId` |
| `edge.sourceId` / `edge.targetId` | `edge.source` / `edge.target` |
| `edge.sourcePort` / `edge.targetPort` | `edge.sourceHandle` / `edge.targetHandle` |
| `edge.label` | `edge.data.label` |

### `xyflowConverter`

Pre-built `VisualGraphFormatConverter<XYFlow>`:

```ts
const flow = xyflowConverter.to(graph);
const roundTripped = xyflowConverter.from(flow);
```

### Types

| Type | Description |
| --- | --- |
| `XYFlow` | `{ nodes: XYFlowNode[], edges: XYFlowEdge[] }` |
| `XYFlowNode` | Re-exported `NodeBase` from `@xyflow/system` |
| `XYFlowEdge` | Re-exported `EdgeBase` from `@xyflow/system` |

> **Note:** `fromXYFlow` always produces a `directed` graph with `direction: 'down'`.
