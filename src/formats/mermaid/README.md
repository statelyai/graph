# Mermaid

Converters for [Mermaid](https://mermaid.js.org/) diagram syntax. Each diagram type has its own dedicated converter with type-specific node/edge data interfaces.

## Preservation

<!-- preservation contract for mermaid/* derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **partial**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Each converter supports selected syntax. Comments, opaque YAML frontmatter and
JSON directives are retained in additive `graph.data.source` metadata and
re-emitted; exact source placement/formatting remains unsupported. Arbitrary
Graph fields still lack a complete native encoding.

<!-- source metadata behavior from src/formats/mermaid/shared.ts -->

For the original eight codecs, unknown statements retained in `source.unknownStatements` are available for
inspection, not silently treated as supported graph semantics. These codecs
remain synchronous and dependency-free; frontmatter retention does not imply
general YAML configuration evaluation. GitGraph interprets its scalar `mainBranchName` configuration; other frontmatter remains opaque. The six additional profiles reject unsupported grammar instead of creating misleading nodes; their document converters retain the unprojectable source with diagnostics.

## Resources

- [Mermaid documentation](https://mermaid.js.org/intro/)
- [Mermaid live editor](https://mermaid.live/)

## API

<!-- converter value exports from src/formats/mermaid/index.ts -->

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
  // Ishikawa diagram
  fromMermaidIshikawa, toMermaidIshikawa, mermaidIshikawaConverter,
  // Additional native graph profiles
  fromMermaidArchitecture, toMermaidArchitecture, mermaidArchitectureConverter,
  fromMermaidRequirement, toMermaidRequirement, mermaidRequirementConverter,
  fromMermaidSankey, toMermaidSankey, mermaidSankeyConverter,
  fromMermaidGitGraph, toMermaidGitGraph, mermaidGitGraphConverter,
  fromMermaidC4, toMermaidC4, mermaidC4Converter,
  fromMermaidUseCase, toMermaidUseCase, mermaidUseCaseConverter,
  // Exact native document retention with strict editing policies
  mermaidFlowchartDocumentConverter, mermaidSequenceDocumentConverter,
  mermaidStateDocumentConverter, mermaidClassDocumentConverter,
  mermaidERDocumentConverter, mermaidBlockDocumentConverter,
  mermaidMindmapDocumentConverter, mermaidIshikawaDocumentConverter,
  mermaidArchitectureDocumentConverter, mermaidRequirementDocumentConverter,
  mermaidSankeyDocumentConverter, mermaidGitGraphDocumentConverter,
  mermaidC4DocumentConverter, mermaidUseCaseDocumentConverter,
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

<!-- public type fields from src/formats/mermaid/sequence.ts -->

**Types:** `SequenceNodeData` (`actorType`, `alias`, `configuration`, `created`,
`destroyed`, `notes`, `box`), `SequenceNote` (`id`, `position`, `text`, `over`),
`SequenceEdgeData` (`kind`, `stroke`, `arrowType`, `bidirectional`,
`centralSource`, `centralTarget`, `sequenceNumber`), `SequenceGraphData`
(`autonumber`, `autonumberStart`, `autonumberIncrement`, `blocks`, `events`),
`SequenceBlock`, `SequenceEvent`

Notes and lifecycle directives use ordered events anchored to live edge IDs.
Notes carry stable IDs, so rearranging the convenience notes array does not
move them on the timeline. Spanning notes are emitted once; the event-linked
participant owns their editable text. Missing event participants, notes or
edge anchors fail explicitly. Legacy `noteIndex` events and lifecycle flags
remain readable. Participant stereotypes emit official `participant ID@{...}`
JSON syntax; legacy `database ID` and similar inputs remain readable.

---

### Flowchart

Nodes with shapes, edges with arrows. Subgraphs map to compound nodes via `parentId`.
Compact links such as `A & B --> C & D` expand across supported arrows and
pipe edge labels. Semicolon-separated statements and quoted node labels are
split or decoded on import.

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

<!-- public type fields from src/formats/mermaid/flowchart.ts -->

**Types:** `FlowchartNodeData` (`classes`, deprecated `link`, `tooltip`,
`direction`, `click`, `properties`), `FlowchartClick` (`kind`, `target`, `tooltip`,
`linkTarget`, `explicitCall`), `FlowchartEdgeData` (`stroke`, `arrowType`,
`endMarker`, `startMarker`, `bidirectional`, `linkStyle`, `properties`,
`explicitId`, `arrowToken`),
`FlowchartGraphData` (`diagramType`, `classDefs`, `defaultLinkStyle`, `init`)

Expanded shapes and image/icon properties retain their property maps. Canonical
labels/shapes/modes and live stroke edits take precedence during emission.
Explicit edge IDs, long connectors, direct node styles and declaration
overrides retain their supported semantics.

---

### State Diagram

State ID is the label. Descriptions go in `data.description`. `[*]` maps to start/end pseudo-nodes.
Quoted aliases with `<<choice>>`, `<<fork>>`, or `<<join>>` retain both their
decoded description and state type across import and export.

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

<!-- public type fields from src/formats/mermaid/state.ts -->

**Types:** `StateNodeData` (`description`, `stateType`, `notes`, `isStart`,
`isEnd`, `classes`, `direction`), `StateEdgeData`,
`StateGraphData` (`diagramType`, `classDefs`)

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

<!-- public type fields from src/formats/mermaid/class-diagram.ts -->

**Types:** `ClassNodeData` (`members`, `annotation`, `genericType`, `namespace`,
`notes`, `classes`), `ClassEdgeData` (`relationType`, `sourceCardinality`,
`targetCardinality`, `sourceMarker`, `targetMarker`, `lineStyle`),
`ClassGraphData` (`notes`, `classDefs`). Namespace hierarchy, display aliases,
notes, styles, lollipop interfaces and two-sided relationships are retained.

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

<!-- public type fields from src/formats/mermaid/er-diagram.ts -->

**Types:** `ERNodeData` (attributes with `type`, `name`, legacy `key`, multiple
`keys`, `comment`), `EREdgeData` (`sourceCardinality`, `targetCardinality`,
`identifying`). Isolated entities, display aliases and diagram direction emit.

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
// Authored ID root; anonymous text nodes receive generated mm_* IDs.
// Indentation defines parentId and parent-child edges.

const mermaid = toMermaidMindmap(graph);
```

<!-- public type fields from src/formats/mermaid/mindmap.ts -->

**Types:** `MindmapNodeData` (`icon`, `authoredId`, `classes`),
`MindmapEdgeData`, `MindmapGraphData`. Named shapes retain authored IDs;
icon/class decoration lines attach to their node.

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

<!-- public type fields from src/formats/mermaid/block.ts -->

**Types:** `BlockNodeData` (`span`, scoped `columns`), `BlockEdgeData`
(`stroke`, `arrowType`, `arrowToken`), `BlockGraphData` (`columns`).
Quote-aware declarations retain multiword labels, node shapes and row spans;
nested column counts remain on their container. Unsupported spacing/directive
syntax is retained for inspection instead of creating directive nodes.

### Ishikawa Diagram

Indentation-based cause hierarchy. The first node is the effect/problem; indented lines become cause nodes under the nearest less-indented parent.

```ts
const graph = fromMermaidIshikawa(`ishikawa-beta
Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
    User
        Shaky hands
`);
// a graph containing:
// Generated ish_* IDs; labels and indentation define cause hierarchy.

const mermaid = toMermaidIshikawa(graph);
```

**Types:** `IshikawaNodeData` (kind), `IshikawaEdgeData`, `IshikawaGraphData`


## Native documents

<!-- native document registrations and bounded patch policy from src/formats/mermaid/document.ts -->

Each diagram exports a matching `mermaid*DocumentConverter`: Flowchart, Sequence,
State, Class, ER, Block, Mindmap and Ishikawa. These retain exact original text,
including comments, frontmatter, unsupported syntax and whitespace, after JSON
persistence. Semantic projections remain partial; failed imports retain source
with a null projection and diagnostics.

Verified label edits cover standalone flowchart node declarations, quoted state
aliases, simple sequence participant aliases and uniquely identified messages.
Unedited source text remains exact. Duplicate declarations, expanded flow properties,
structural changes and other unsupported edits fail explicitly. Class, ER, Block,
Mindmap and Ishikawa currently support source editing and exact no-op export only.

Document projections expose one editable label where native syntax also stores
an alias/description/configuration label; native source retains those original
fields. Arbitrary new Graph data edits still count and can be rejected when no
native mapping exists. See [document API](../document/README.md).


## Native interoperability

<!-- native Mermaid profile oracle from tests/native/mermaid.test.ts and package.json#devDependencies -->

The Node 24 native suite uses pinned Mermaid 12.1.0 to parse external fixtures
and emitted output for all fourteen scoped dialects. Selected native database
assertions cover labels, shapes, relationships, participant/note order and
hierarchy. Output uses native numeric entities for literal backslashes; raw
native backslash counts are preserved on import. Class multiplicities use
native placement, and nested state transitions remain inside their common
container. These checks establish the tested profile, not complete native
language coverage. See [validation scope](../../../docs/native-validation.md).

Class/ER relation markers and cardinality metadata govern native relationships;
generic Graph edge mode edits do not yet have a complete mapping for those
semantic models. State profiles use directed transitions. Document export rejects
unsupported mode edits; explicit regeneration reports differing Graph fields.


## Additional native graph profiles

<!-- scoped dialect mappings and exported types from src/formats/mermaid/architecture.ts, requirement.ts, sankey.ts, git-graph.ts, c4.ts and use-case.ts -->

| Profile | Graph mapping | Explicit limits |
| --- | --- | --- |
| Architecture | Group/service/junction kinds, icon names, hierarchy, alignment and canonical arrows; L/R/T/B sides become ports | Edges have no label field; arbitrary ports reject. Icon resolution/layout are native renderer concerns. |
| Requirement | Requirement types, business ID, body text as `node.label`, risk, verification, typed relationships, selected styles/classes | Element display names are identities. Native field strings cannot be empty; empty body text emits by omitting `text`. Hierarchy/ports reject. |
| Sankey | Inferred name identities and numeric edge weights; parallels and zero weights | Mermaid12.1's native lexer accepts printable ASCII only and trims outer name whitespace even in quotes. Unicode, isolated nodes, ports and incompatible modes reject. Missing export weights default to 1, configurable through `defaultWeight`. |
| GitGraph | Ordered actions and child-to-parent commit DAG; merges and cherry-picks retain both parents | Requires `graph.data.actions`; arbitrary DAGs and inconsistent action/DAG edits reject. Anonymous commit IDs normalize. `mainBranch` controls native configuration and inherited main-branch references. Commit display identity cannot have an independent label. |
| C4 | Context/Container/Component/Dynamic/Deployment typed macros, boundaries, descriptions, technologies and positional/named relation arguments | Scoped supported macro list; renderer update/layout macros and executable external DSL reject. Native optional arguments and Graph field presence remain distinct. |
| UseCase | Actors/variants, one-level boundaries, include/extend/generalization, association markers/length, stereotypes, notes, JSON tables and selected styles/classes | Anonymous notes normalize after regular nodes/edges; JSON property spelling/order is source-only. Multiline Markdown/accessibility grammar is outside this parser profile. Note and relationship topology must agree. |

Bare Graph serialization still lacks a complete encoding for arbitrary user data,
null/presence, geometry, styles and entity order across these languages. Numeric
entity escaping supports labels; bare ID encoding is injective, including empty
IDs where the dialect permits aliases. Literal values matching the private ID
encoding convention have an ambiguity boundary; conflicting identities reject
rather than merge. Source documents remain the reliable place for original IDs,
comments, unknown syntax and metadata.

<!-- expanded document policies from src/formats/mermaid/document.ts -->

All six `*DocumentConverter` registrations preserve exact no-op source after JSON
persistence, including unprojectable syntax with `graph: null`. Architecture
standalone declaration labels, Requirement body text, C4 declaration labels and
UseCase actor/case/boundary declaration labels have verified text-span patches.
Untouched comments and text remain exact; output must reparse to the requested
Graph. Structural, ambiguous and other unsupported edits reject. Sankey/GitGraph
Graph edits currently require explicit source editing or explicit diagnostic
regeneration. Requirement empty text patches remove the field line while retaining
its comments; null labels are not silently converted into empty text.

<!-- expanded native assertions from tests/native/mermaid-expanded.test.ts and scripts/native/plantuml-tools.json -->

Native Mermaid12.1 database assertions inspect sides/arrowheads/groups, requirement
fields/styles, weighted flows, commit parents/branch configuration, C4 technology
and hierarchy, and UseCase modifiers/notes/JSON cells. Display text tests use
Mermaid's native decoder to check exact Unicode, quotes, backslashes and line
breaks where supported. Upstream-negative controls characterize Sankey Unicode
and Requirement explicit empty-string syntax. Bulk/deep fixtures exercise 2,000
native architecture services and 100 nested deployment nodes. These assertions
establish the stated profiles rather than complete language conformance.


<!-- native display-string limits from src/formats/mermaid/shared.ts and tests/native/mermaid-expanded.test.ts -->

Native display strings reject NUL and lone UTF-16 surrogates: Mermaid/DOM numeric
entity decoding substitutes a replacement character, so a round-trip would lose
the requested text. Astral surrogate pairs remain supported. Strict label edits
reject these unrepresentable values; exact document source and JSON-escaped
opaque data remain preservable. ID encoding still accepts arbitrary UTF-16 code
units when a dialect supports a separate native-safe alias. Architecture's native
empty label token is unsupported; null labels omit the optional label field.
Git commit/branch identity tokens retain literal Unicode, backslashes and `#`
characters; embedded quote/control characters reject where the native token
cannot encode them. Display tags use the normal numeric entity encoding.

C4 `Rel_Back` normalizes the native start arrow to reversed Graph endpoints.
Repeated native alias pairs are rejected: Mermaid replaces an existing relation
for that ordered pair. GraphDocument retains such source with an unavailable projection.
