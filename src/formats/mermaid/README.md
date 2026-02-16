# Mermaid

Converters for [Mermaid](https://mermaid.js.org/) diagram syntax. Each diagram type has its own dedicated converter with type-specific node/edge data interfaces.

## Resources

- [Mermaid documentation](https://mermaid.js.org/intro/)
- [Mermaid live editor](https://mermaid.live/)

## API

```ts
import {
  // Sequence diagram
  fromMermaidSequence, toMermaidSequence, mermaidSequenceConverter,
  // Flowchart
  fromMermaidFlowchart, toMermaidFlowchart, mermaidFlowchartConverter,
  // State diagram
  fromMermaidState, toMermaidState, mermaidStateConverter,
  // Class diagram
  fromMermaidClass, toMermaidClass, mermaidClassConverter,
  // ER diagram
  fromMermaidER, toMermaidER, mermaidERConverter,
  // Mindmap
  fromMermaidMindmap, toMermaidMindmap, mermaidMindmapConverter,
  // Block diagram
  fromMermaidBlock, toMermaidBlock, mermaidBlockConverter,
} from '@statelyai/graph/mermaid';
```

All converters follow the same pattern:

```ts
const graph = fromMermaidFlowchart(`flowchart LR
  A[Start] --> B{Decision}
  B -->|Yes| C[OK]
  B -->|No| D[Fail]
`);

const mermaid = toMermaidFlowchart(graph);
```

---

### Sequence Diagram

Actors are nodes, messages are edges. Activations/deactivations are self-edges with `data.kind`.

```ts
const graph = fromMermaidSequence(`sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi back
  Alice->>+Alice: Think
`);
```

**Types:** `SequenceNodeData` (actorType, alias), `SequenceEdgeData` (kind, stroke, arrowType), `SequenceGraphData` (autoNumber, blocks), `SequenceBlock`

---

### Flowchart

Nodes with shapes, edges with arrows. Subgraphs map to compound nodes via `parentId`.

```ts
const graph = fromMermaidFlowchart(`flowchart TD
  subgraph sub1[Group]
    A[Box] --> B((Circle))
  end
  B --> C{Diamond}
`);
```

**Types:** `FlowchartNodeData` (classes, link, tooltip), `FlowchartEdgeData` (stroke, arrowType, bidirectional), `FlowchartGraphData` (classDefs)

---

### State Diagram

State ID is the label. Descriptions go in `data.description`. `[*]` maps to start/end pseudo-nodes.

```ts
const graph = fromMermaidState(`stateDiagram-v2
  [*] --> Idle
  Idle --> Processing: submit
  Processing --> [*]
  state Processing {
    Validating --> Saving
  }
`);
```

**Types:** `StateNodeData` (description, stateType, isStart, isEnd), `StateEdgeData`, `StateGraphData`

---

### Class Diagram

Classes are nodes with members. Relationships (inheritance, composition, etc.) are edges with cardinality.

```ts
const graph = fromMermaidClass(`classDiagram
  class Animal {
    +String name
    +makeSound() void
  }
  Animal <|-- Dog
  Animal <|-- Cat
`);
```

**Types:** `ClassNodeData` (members, annotation, genericType), `ClassEdgeData` (relationType, sourceCardinality, targetCardinality)

---

### ER Diagram

Entities are nodes with typed attributes. Relationships use crow's foot notation for cardinality.

```ts
const graph = fromMermaidER(`erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string name PK
    string email
  }
`);
```

**Types:** `ERNodeData` (attributes with type, name, key, comment), `EREdgeData` (sourceCardinality, targetCardinality, identifying)

---

### Mindmap

Indentation-based hierarchy. Parent-child relationships become edges; nesting uses `parentId`.

```ts
const graph = fromMermaidMindmap(`mindmap
  root((Central))
    Topic A
      Sub A1
    Topic B
`);
```

**Types:** `MindmapNodeData` (icon), `MindmapEdgeData`, `MindmapGraphData`

---

### Block Diagram

Grid-based layout with columns. Nested `block:id ... end` creates compound nodes.

```ts
const graph = fromMermaidBlock(`block-beta
  columns 3
  a["Block A"] b["Block B"] c["Block C"]
  a --> b
`);
```

**Types:** `BlockNodeData` (span), `BlockEdgeData` (stroke, arrowType), `BlockGraphData` (columns)
