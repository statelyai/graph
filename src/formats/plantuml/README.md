# PlantUML

Dependency-free component/class graph subset. Default dialect is `component`; `{ dialect: 'class' }` enables class, interface, enum and abstract class declarations. Activity, state and sequence execution semantics are outside this projection.

<!-- exported API and dialect profile from src/formats/plantuml/index.ts -->
```ts
import { toPlantUML, fromPlantUML, createPlantUMLDocumentConverter } from '@statelyai/graph/plantuml';
const source = toPlantUML(graph, { dialect: 'class' });
const restored = fromPlantUML(source, { dialect: 'class' });
const converter = createPlantUMLDocumentConverter({ dialect: 'class' });
const document = converter.from(source);
document.graph!.nodes[0].label = 'Changed';
const updated = converter.to(document);
```

`plantumlConverter` exposes `.to(graph)` and `.from(source)`. `plantumlDocumentConverter` uses component scope; the factory chooses class scope. Packages/namespaces map hierarchy. Binary connectors map directed, undirected and bidirectional relationships; reversed connectors normalize endpoint multiplicities. Class members, stereotypes and connector spelling are native data. Aliased class/enum/abstract-class declarations require quoted display names; verified unquoted component/interface/package aliases are accepted. Fresh output uses qualified stable aliases and Smetana layout; no runtime PlantUML/JVM dependency is imported.

Fresh node and relationship display labels encode literal quotes, backslashes, markup punctuation and HTML entities using numeric display entities verified against native SVG. LF produces multiple display lines. Empty display names, C0 controls except LF, DEL and lone surrogates reject; Graph JSON data may still contain those strings. Native escaped quotes retain their displayed backslash rather than assuming JSON escape rules. Relationship labels are single-line text; apostrophes that start comments reject. Rich escaped bracket declarations are outside the supported parser profile; use quoted aliases.

<!-- native metadata and source patches from src/formats/plantuml/index.ts -->
A versioned comment sidecar retains JSON-domain Graph IDs, data, ports, geometry and optional-field presence. Native readers see component/class topology and mapped display fields; Graph-only fields remain metadata. Live native labels and relationships take precedence over baselines; ambiguous relationship insertion/retargeting rejects. Private comments follow a documented convention, not collision-free provenance. Import `{ metadata: 'native' }` treats them as ordinary comments; export `{ nativeCarrier: false }` explicitly regenerates source from the Graph.

Documents retain exact original source, line endings, comments, class bodies, grouping, style directives and opaque unsupported dialects through no-op and JSON persistence. Unsupported projections use `graph: null`. Strict single-line node/relationship label patches keep unknown source text and stable aliases, then verify the new Graph projection. Structural, members, style, geometry and data edits reject with diagnostics; no stale source replay hides requested edits. `.getUpdate(document)` returns diagnostics. Native-source bare exports use the same verified patch path. Multiline/empty label patches require explicit regeneration or another representation.

<!-- independent compiler and semantic tests from tests/native/plantuml.test.ts and tests/native/plantuml-oracle.ts; core tests from tests/formats/plantuml.test.ts -->
Native proof uses the pinned official PlantUML 1.2026.8 compiler with Java 21: local SVG entity/endpoint identities, hierarchy, display encoding, multiplicities and class XMI members/generalization (`--xmi:star`; default XMI omits relationships). The compiler/JVM are development-only validation tools. [Component syntax](https://plantuml.com/component-diagram) and [class syntax](https://plantuml.com/class-diagram).
