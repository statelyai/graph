# Mermaid

Converters for [Mermaid](https://mermaid.js.org/) diagram syntax. Each diagram type has its own dedicated converter with type-specific node/edge data interfaces.

## Resources

- [Mermaid documentation](https://mermaid.js.org/intro/)
- [Mermaid live editor](https://mermaid.live/)

## API

<!-- exported symbols from src/formats/mermaid/index.ts -->

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

All converters follow the same pattern — `to*` exports a graph as Mermaid syntax, `from*` parses Mermaid syntax into a graph:

```ts
const graph = fromMermaidFlowchart(`flowchart LR
  A[Start] --> B{Decision}
  B -->|Yes| C[OK]
  B -->|No| D[Fail]
`);
// a graph containing:
// nodes: - A - B - C - D
// edges: - (A -> B) - (B -> C) - (B -> D)

const mermaid = toMermaidFlowchart(graph);
```

---

### Sequence Diagram

Actors are nodes, messages are edges. Activations/deactivations are self-edges with `data.kind`.

```ts
const graph = fromMermaidSequence(`sequenceDiagram
  participant Browser
  participant API
  participant DB
  Browser->>API: GET /users
  API->>DB: SELECT * FROM users
  DB-->>API: rows
  API-->>Browser: 200 OK
`);
// a graph containing:
// nodes: - Browser - API - DB
// edges: - (Browser -> API) - (API -> DB) - (DB -> API) - (API -> Browser)

const mermaid = toMermaidSequence(graph);
```

**Types:** `SequenceNodeData` (actorType, alias), `SequenceEdgeData` (kind, stroke, arrowType), `SequenceGraphData` (autoNumber, blocks), `SequenceBlock`

---

### Flowchart

Nodes with shapes, edges with arrows. Subgraphs map to compound nodes via `parentId`.

```ts
const graph = fromMermaidFlowchart(`flowchart TD
  subgraph CI[CI Pipeline]
    A[Push Code] --> B[Run Tests]
    B --> C{Pass?}
  end
  C -->|Yes| D[Deploy]
  C -->|No| E[Fix & Retry]
  E --> A
`);
// a graph containing:
// nodes: - CI - A - B - C - D - E
// edges: - (A -> B) - (B -> C) - (C -> D) - (C -> E) - (E -> A)

const mermaid = toMermaidFlowchart(graph);
```

**Types:** `FlowchartNodeData` (classes, link, tooltip), `FlowchartEdgeData` (stroke, arrowType, bidirectional), `FlowchartGraphData` (classDefs)

---

### State Diagram

State ID is the label. Descriptions go in `data.description`. `[*]` maps to start/end pseudo-nodes.

```ts
const graph = fromMermaidState(`stateDiagram-v2
  [*] --> Idle
  Idle --> Loading: fetch
  Loading --> Error: fail
  Loading --> Success: done
  Error --> Loading: retry
  Success --> [*]
  state Loading {
    Requesting --> Parsing
  }
`);
// a graph containing:
// nodes: - [*]_start - Idle - Loading - Error - Success - [*]_end - Requesting - Parsing
// edges: - ([*]_start -> Idle) - (Idle -> Loading) - (Loading -> Error) - (Loading -> Success) - (Error -> Loading) - (Success -> [*]_end) - (Requesting -> Parsing)

const mermaid = toMermaidState(graph);
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
  class Dog {
    +fetch() void
  }
  class Cat {
    +purr() void
  }
  Animal <|-- Dog
  Animal <|-- Cat
`);
// a graph containing:
// nodes: - Animal - Dog - Cat
// edges: - (Animal -> Dog) - (Animal -> Cat)

const mermaid = toMermaidClass(graph);
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
    int age
  }
  ORDER {
    int id PK
    date created
  }
`);
// a graph containing:
// nodes: - CUSTOMER - ORDER - LINE_ITEM
// edges: - (CUSTOMER -> ORDER) - (ORDER -> LINE_ITEM)

const mermaid = toMermaidER(graph);
```

**Types:** `ERNodeData` (attributes with type, name, key, comment), `EREdgeData` (sourceCardinality, targetCardinality, identifying)

---

### Mindmap

Indentation-based hierarchy. Parent-child relationships become edges; nesting uses `parentId`.

```ts
const graph = fromMermaidMindmap(`mindmap
  root((Project Plan))
    Design
      Wireframes
      Prototypes
    Development
      Frontend
      Backend
    Testing
`);
// a graph containing:
// nodes: - root - Design - Wireframes - Prototypes - Development - Frontend - Backend - Testing
// edges: - (root -> Design) - (Design -> Wireframes) - (Design -> Prototypes) - (root -> Development) - (Development -> Frontend) - (Development -> Backend) - (root -> Testing)

const mermaid = toMermaidMindmap(graph);
```

**Types:** `MindmapNodeData` (icon), `MindmapEdgeData`, `MindmapGraphData`

---

### Block Diagram

Grid-based layout with columns. Nested `block:id ... end` creates compound nodes.

```ts
const graph = fromMermaidBlock(`block-beta
  columns 3
  a["Frontend"] b["API Gateway"] c["Database"]
  a --> b
  b --> c
`);
// a graph containing:
// nodes: - a - b - c
// edges: - (a -> b) - (b -> c)

const mermaid = toMermaidBlock(graph);
```

**Types:** `BlockNodeData` (span), `BlockEdgeData` (stroke, arrowType), `BlockGraphData` (columns)
