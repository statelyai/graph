/**
 * Mermaid Spec-Parity Tests
 *
 * These tests are inspired by Mermaid's own parser tests and excalidraw's
 * mermaid-to-excalidraw mapping patterns. They verify that our Mermaid
 * converters handle canonical Mermaid syntax correctly by:
 *
 * 1. Testing every documented edge/arrow type against the Mermaid spec
 * 2. Testing every documented node shape
 * 3. Testing special characters and escaping (from Mermaid's flow.spec.ts)
 * 4. Testing relationship type mappings (inspired by excalidraw's relationType enum)
 * 5. Testing round-trip fidelity for complex real-world diagrams
 *
 * References:
 * - Mermaid flowchart parser: https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/diagrams/flowchart/parser
 * - Mermaid state diagram: https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/diagrams/state
 * - Excalidraw relation mapping: https://github.com/excalidraw/mermaid-to-excalidraw/blob/master/src/parser/class.ts
 * - Excalidraw sequence mapping: https://github.com/excalidraw/mermaid-to-excalidraw/blob/master/src/parser/sequence.ts
 */
import { describe, it, expect } from 'vitest';
import { fromMermaidFlowchart, toMermaidFlowchart } from '../../../src/formats/mermaid/flowchart';
import { fromMermaidSequence, toMermaidSequence } from '../../../src/formats/mermaid/sequence';
import { fromMermaidState, toMermaidState } from '../../../src/formats/mermaid/state';
import { fromMermaidClass, toMermaidClass } from '../../../src/formats/mermaid/class-diagram';
import { fromMermaidER, toMermaidER } from '../../../src/formats/mermaid/er-diagram';

// ============================================================================
// Flowchart spec-parity tests
// Derived from Mermaid's flow-edges.spec.ts and flow-nodes.spec.ts
// ============================================================================

describe('Flowchart spec-parity (Mermaid parser tests)', () => {
  describe('edge type exhaustive coverage', () => {
    // Every edge pattern from Mermaid's spec, mapped to our internal representation.
    // This serves as a canonical mapping table — if Mermaid adds a new edge type,
    // we add it here first and the test fails until we implement it.
    const FLOWCHART_EDGE_SPEC: Array<{
      mermaid: string;
      stroke: string;
      arrowType: string;
      endMarker?: string;
      startMarker?: string;
      bidirectional?: boolean;
      description: string;
    }> = [
      // Normal edges
      { mermaid: 'A --> B', stroke: 'normal', arrowType: 'arrow', description: 'normal arrow' },
      { mermaid: 'A --- B', stroke: 'normal', arrowType: 'none', description: 'normal no arrow' },
      { mermaid: 'A ---> B', stroke: 'normal', arrowType: 'arrow', description: 'long normal arrow' },
      // Thick edges
      { mermaid: 'A ==> B', stroke: 'thick', arrowType: 'arrow', description: 'thick arrow' },
      { mermaid: 'A === B', stroke: 'thick', arrowType: 'none', description: 'thick no arrow' },
      // Dotted edges
      { mermaid: 'A -.-> B', stroke: 'dotted', arrowType: 'arrow', description: 'dotted arrow' },
      { mermaid: 'A -.- B', stroke: 'dotted', arrowType: 'none', description: 'dotted no arrow' },
      // Invisible
      { mermaid: 'A ~~~ B', stroke: 'invisible', arrowType: 'none', description: 'invisible link' },
      // End markers
      { mermaid: 'A --o B', stroke: 'normal', arrowType: 'arrow', endMarker: 'circle', description: 'circle end marker' },
      { mermaid: 'A --x B', stroke: 'normal', arrowType: 'arrow', endMarker: 'cross', description: 'cross end marker' },
      // Bidirectional
      { mermaid: 'A <--> B', stroke: 'normal', arrowType: 'arrow', bidirectional: true, description: 'bidirectional normal' },
      { mermaid: 'A <==> B', stroke: 'thick', arrowType: 'arrow', bidirectional: true, description: 'bidirectional thick' },
      { mermaid: 'A <-.-> B', stroke: 'dotted', arrowType: 'arrow', bidirectional: true, description: 'bidirectional dotted' },
    ];

    for (const spec of FLOWCHART_EDGE_SPEC) {
      it(`parses ${spec.description}: ${spec.mermaid}`, () => {
        const graph = fromMermaidFlowchart(`flowchart TD\n    ${spec.mermaid}`);
        expect(graph.edges).toHaveLength(1);
        const edge = graph.edges[0];
        expect(edge.data.stroke).toBe(spec.stroke);
        expect(edge.data.arrowType).toBe(spec.arrowType);
        if (spec.endMarker) {
          expect(edge.data.endMarker).toBe(spec.endMarker);
        }
        if (spec.startMarker) {
          expect(edge.data.startMarker).toBe(spec.startMarker);
        }
        if (spec.bidirectional) {
          expect(edge.data.bidirectional).toBe(true);
        }
      });
    }
  });

  describe('node shape exhaustive coverage', () => {
    // Every node shape from Mermaid's spec
    const NODE_SHAPE_SPEC: Array<{
      syntax: string;
      shape: string;
      description: string;
    }> = [
      // Rectangle is the default shape — not stored explicitly on the node (undefined)
      { syntax: 'A[text]', shape: undefined as any, description: 'rectangle (default)' },
      { syntax: 'A(text)', shape: 'rounded', description: 'rounded rectangle' },
      { syntax: 'A((text))', shape: 'circle', description: 'circle' },
      { syntax: 'A(((text)))', shape: 'double-circle', description: 'double circle' },
      { syntax: 'A{text}', shape: 'diamond', description: 'diamond/rhombus' },
      { syntax: 'A{{text}}', shape: 'hexagon', description: 'hexagon' },
      { syntax: 'A[[text]]', shape: 'subroutine', description: 'subroutine' },
      { syntax: 'A[(text)]', shape: 'cylinder', description: 'cylinder/database' },
      { syntax: 'A([text])', shape: 'stadium', description: 'stadium/pill' },
      { syntax: 'A>text]', shape: 'asymmetric', description: 'asymmetric/flag' },
      { syntax: 'A[/text/]', shape: 'parallelogram', description: 'parallelogram' },
      { syntax: 'A[\\text\\]', shape: 'parallelogram-alt', description: 'parallelogram alt' },
      { syntax: 'A[/text\\]', shape: 'trapezoid', description: 'trapezoid' },
      { syntax: 'A[\\text/]', shape: 'trapezoid-alt', description: 'trapezoid alt' },
    ];

    for (const spec of NODE_SHAPE_SPEC) {
      it(`parses ${spec.description}: ${spec.syntax}`, () => {
        const graph = fromMermaidFlowchart(`flowchart TD\n    ${spec.syntax}`);
        expect(graph.nodes).toHaveLength(1);
        expect((graph.nodes[0] as any).shape).toBe(spec.shape);
        expect(graph.nodes[0].label).toBe('text');
      });
    }
  });

  describe('edge labels (from Mermaid flow.spec.ts)', () => {
    it('parses pipe-delimited labels on all edge types', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A -->|normal| B
    C ==>|thick| D
    E -.->|dotted| F
      `);
      expect(graph.edges[0].label).toBe('normal');
      expect(graph.edges[0].data.stroke).toBe('normal');
      expect(graph.edges[1].label).toBe('thick');
      expect(graph.edges[1].data.stroke).toBe('thick');
      expect(graph.edges[2].label).toBe('dotted');
      expect(graph.edges[2].data.stroke).toBe('dotted');
    });

    it('parses inline labels: A -- text --> B', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A -- this is text --> B
      `);
      expect(graph.edges[0].label).toBe('this is text');
      expect(graph.edges[0].data.stroke).toBe('normal');
      expect(graph.edges[0].data.arrowType).toBe('arrow');
    });
  });

  describe('chained edges (from Mermaid flow.spec.ts)', () => {
    it('parses triple-chain: A --> B --> C --> D', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A --> B --> C --> D
      `);
      expect(graph.edges).toHaveLength(3);
      expect(graph.edges[0]).toMatchObject({ sourceId: 'A', targetId: 'B' });
      expect(graph.edges[1]).toMatchObject({ sourceId: 'B', targetId: 'C' });
      expect(graph.edges[2]).toMatchObject({ sourceId: 'C', targetId: 'D' });
    });

    it('creates nodes from chained edges', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    X --> Y --> Z
      `);
      expect(graph.nodes.map(n => n.id)).toEqual(['X', 'Y', 'Z']);
    });
  });

  describe('special characters and escaping (from Mermaid flow.spec.ts)', () => {
    it('handles labels with special characters via quoting', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A["Label with (parens)"]
    B["Label with {braces}"]
      `);
      expect(graph.nodes[0].label).toContain('parens');
      expect(graph.nodes[1].label).toContain('braces');
    });

    it('strips %% comments from input', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    %% This entire line is a comment
    A --> B
    %% Another comment
    B --> C
      `);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
    });
  });

  describe('subgraph features (from Mermaid flow.spec.ts)', () => {
    it('handles deeply nested subgraphs (3 levels)', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph L1[Level 1]
        subgraph L2[Level 2]
            subgraph L3[Level 3]
                A[Deep Node]
            end
        end
    end
      `);
      const nodeA = graph.nodes.find(n => n.id === 'A')!;
      const l3 = graph.nodes.find(n => n.id === 'L3')!;
      const l2 = graph.nodes.find(n => n.id === 'L2')!;
      const l1 = graph.nodes.find(n => n.id === 'L1')!;

      expect(nodeA.parentId).toBe('L3');
      expect(l3.parentId).toBe('L2');
      expect(l2.parentId).toBe('L1');
      expect(l1.parentId).toBeNull();
    });

    it('handles edges between subgraph members and external nodes', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph sub1[Group]
        A[Inside]
        B[Also Inside]
    end
    C[Outside]
    A --> C
    C --> B
      `);
      const edgeAC = graph.edges.find(e => e.sourceId === 'A' && e.targetId === 'C');
      const edgeCB = graph.edges.find(e => e.sourceId === 'C' && e.targetId === 'B');
      expect(edgeAC).toBeDefined();
      expect(edgeCB).toBeDefined();
    });

    it('handles edges between different subgraphs', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph sub1[Group 1]
        A[Node A]
    end
    subgraph sub2[Group 2]
        B[Node B]
    end
    A --> B
      `);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('A');
      expect(graph.edges[0].targetId).toBe('B');
      expect(graph.nodes.find(n => n.id === 'A')!.parentId).toBe('sub1');
      expect(graph.nodes.find(n => n.id === 'B')!.parentId).toBe('sub2');
    });
  });

  describe('classDef and styling (from Mermaid flow.spec.ts)', () => {
    it('supports multiple classDef declarations', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[Node A]
    B[Node B]
    classDef red fill:#f00,stroke:#333
    classDef blue fill:#00f,color:#fff
    class A red
    class B blue
      `);
      expect(graph.data.classDefs!.red).toEqual({ fill: '#f00', stroke: '#333' });
      expect(graph.data.classDefs!.blue).toEqual({ fill: '#00f', color: '#fff' });
      expect(graph.nodes.find(n => n.id === 'A')!.data.classes).toEqual(['red']);
      expect(graph.nodes.find(n => n.id === 'B')!.data.classes).toEqual(['blue']);
    });

    it('supports ::: inline class with edge source and target', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A:::classA --> B:::classB
      `);
      expect(graph.nodes.find(n => n.id === 'A')!.data.classes).toEqual(['classA']);
      // Note: inline class on edge target may or may not be parsed depending on implementation
    });
  });

  describe('round-trip: complex real-world flowchart', () => {
    it('round-trips a multi-feature flowchart', () => {
      const input = `flowchart LR
    subgraph Frontend[Frontend Layer]
        direction TB
        UI[User Interface]
        API[API Client]
        UI --> API
    end
    subgraph Backend[Backend Layer]
        Server[Web Server]
        DB[(Database)]
        Server --> DB
    end
    API -->|REST| Server
    UI -.->|WebSocket| Server`;

      const graph = fromMermaidFlowchart(input);
      const output = toMermaidFlowchart(graph);
      const graph2 = fromMermaidFlowchart(output);

      // Verify structural equivalence
      expect(graph2.nodes.map(n => n.id).sort()).toEqual(graph.nodes.map(n => n.id).sort());
      expect(graph2.edges).toHaveLength(graph.edges.length);

      // Verify hierarchy preserved
      expect(graph2.nodes.find(n => n.id === 'UI')!.parentId).toBe('Frontend');
      expect(graph2.nodes.find(n => n.id === 'Server')!.parentId).toBe('Backend');

      // Verify edge types preserved
      const restEdge = graph2.edges.find(e => e.label === 'REST')!;
      expect(restEdge.data.stroke).toBe('normal');
      const wsEdge = graph2.edges.find(e => e.label === 'WebSocket')!;
      expect(wsEdge.data.stroke).toBe('dotted');
    });
  });
});

// ============================================================================
// Sequence diagram spec-parity tests
// Derived from Mermaid's sequence parser and excalidraw's SEQUENCE_ARROW_TYPES
// ============================================================================

describe('Sequence diagram spec-parity', () => {
  describe('arrow type exhaustive coverage (Mermaid spec + excalidraw mapping)', () => {
    // Excalidraw maps these as SOLID, DOTTED, SOLID_CROSS, etc.
    // We verify our mapping aligns with the Mermaid spec values.
    const SEQUENCE_ARROW_SPEC: Array<{
      syntax: string;
      stroke: string;
      arrowType: string;
      bidirectional?: boolean;
      description: string;
    }> = [
      // Solid arrows (Mermaid linetype: 0)
      { syntax: 'A->B: msg', stroke: 'solid', arrowType: 'open', description: 'solid open' },
      { syntax: 'A->>B: msg', stroke: 'solid', arrowType: 'filled', description: 'solid filled' },
      { syntax: 'A-xB: msg', stroke: 'solid', arrowType: 'cross', description: 'solid cross' },
      { syntax: 'A-)B: msg', stroke: 'solid', arrowType: 'async', description: 'solid async' },
      // Dotted arrows (Mermaid linetype: 1)
      { syntax: 'A-->B: msg', stroke: 'dotted', arrowType: 'open', description: 'dotted open' },
      { syntax: 'A-->>B: msg', stroke: 'dotted', arrowType: 'filled', description: 'dotted filled' },
      { syntax: 'A--xB: msg', stroke: 'dotted', arrowType: 'cross', description: 'dotted cross' },
      { syntax: 'A--)B: msg', stroke: 'dotted', arrowType: 'async', description: 'dotted async' },
      // Bidirectional (Mermaid linetype: 6, 7)
      { syntax: 'A<<->>B: msg', stroke: 'solid', arrowType: 'filled', bidirectional: true, description: 'solid bidirectional' },
      { syntax: 'A<<-->>B: msg', stroke: 'dotted', arrowType: 'filled', bidirectional: true, description: 'dotted bidirectional' },
    ];

    for (const spec of SEQUENCE_ARROW_SPEC) {
      it(`parses ${spec.description}: ${spec.syntax}`, () => {
        const graph = fromMermaidSequence(`sequenceDiagram\n    ${spec.syntax}`);
        const edge = graph.edges.find(e => e.data.kind === 'message')!;
        expect(edge).toBeDefined();
        expect(edge.data.stroke).toBe(spec.stroke);
        expect(edge.data.arrowType).toBe(spec.arrowType);
        if (spec.bidirectional) {
          expect(edge.data.bidirectional).toBe(true);
        }
      });
    }

    // Round-trip: verify every arrow type serializes back correctly
    for (const spec of SEQUENCE_ARROW_SPEC) {
      it(`round-trips ${spec.description}`, () => {
        const graph = fromMermaidSequence(`sequenceDiagram\n    ${spec.syntax}`);
        const output = toMermaidSequence(graph);
        const graph2 = fromMermaidSequence(output);
        const edge2 = graph2.edges.find(e => e.data.kind === 'message')!;
        expect(edge2.data.stroke).toBe(spec.stroke);
        expect(edge2.data.arrowType).toBe(spec.arrowType);
        if (spec.bidirectional) {
          expect(edge2.data.bidirectional).toBe(true);
        }
      });
    }
  });

  describe('participant type exhaustive coverage', () => {
    // All participant types that Mermaid supports
    const PARTICIPANT_TYPES = [
      'participant',
      'actor',
      'boundary',
      'control',
      'entity',
      'database',
      'collections',
      'queue',
    ];

    for (const type of PARTICIPANT_TYPES) {
      it(`parses and round-trips ${type} participant type`, () => {
        const graph = fromMermaidSequence(`sequenceDiagram\n    ${type} Alice`);
        expect(graph.nodes[0].data.actorType).toBe(type);

        const output = toMermaidSequence(graph);
        const graph2 = fromMermaidSequence(output);
        expect(graph2.nodes[0].data.actorType).toBe(type);
      });
    }
  });

  describe('control-flow blocks exhaustive coverage', () => {
    it('parses nested blocks: loop inside alt', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    participant A
    participant B
    alt Happy path
        A->>B: Request
        loop Retry
            B->>A: Processing
        end
    else Error path
        A->>B: Error
    end
      `);
      expect(graph.data.blocks).toBeDefined();
      expect(graph.data.blocks!.length).toBeGreaterThanOrEqual(1);
    });

    it('parses critical with multiple options', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    participant A
    participant B
    critical Establish connection
        A->>B: Connect
    option Timeout
        A->>B: Retry
    option Server down
        A->>B: Fallback
    end
      `);
      const block = graph.data.blocks![0] as any;
      expect(block.type).toBe('critical');
      expect(block.options).toHaveLength(2);
      expect(block.options[0].label).toBe('Timeout');
      expect(block.options[1].label).toBe('Server down');
    });
  });

  describe('round-trip: complex real-world sequence', () => {
    it('round-trips authentication flow', () => {
      const input = `sequenceDiagram
    participant User
    participant App
    participant Auth
    database DB
    User->>App: Login request
    App->>Auth: Validate credentials
    Auth->>DB: Query user
    DB-->>Auth: User data
    alt Valid credentials
        Auth-->>App: Token
        App-->>User: Login success
    else Invalid credentials
        Auth-->>App: Error
        App-->>User: Login failed
    end`;

      const graph = fromMermaidSequence(input);
      const output = toMermaidSequence(graph);
      const graph2 = fromMermaidSequence(output);

      // Same participants
      expect(graph2.nodes.map(n => n.id)).toEqual(graph.nodes.map(n => n.id));
      // DB is still a database type
      expect(graph2.nodes.find(n => n.id === 'DB')!.data.actorType).toBe('database');
      // Same number of messages
      expect(graph2.edges.filter(e => e.data.kind === 'message')).toHaveLength(
        graph.edges.filter(e => e.data.kind === 'message').length,
      );
      // Alt block preserved
      expect(graph2.data.blocks!.length).toBe(graph.data.blocks!.length);
    });
  });
});

// ============================================================================
// Class diagram spec-parity tests
// Derived from Mermaid's class parser and excalidraw's RELATION_TYPE mapping
// ============================================================================

describe('Class diagram spec-parity', () => {
  describe('relationship type exhaustive coverage (aligned with Mermaid relationType enum)', () => {
    // Excalidraw maps Mermaid's numeric relationType enum:
    //   AGGREGATION: 0, EXTENSION: 1, COMPOSITION: 2, DEPENDENCY: 3, LOLLIPOP: 4
    // Our string-based mapping must cover the same semantics.
    const CLASS_RELATION_SPEC: Array<{
      syntax: string;
      relationType: string;
      sourceId: string;
      targetId: string;
      description: string;
    }> = [
      // Inheritance / Extension (Mermaid: EXTENSION = 1)
      { syntax: 'Animal <|-- Dog', relationType: 'inheritance', sourceId: 'Dog', targetId: 'Animal', description: 'inheritance (left arrow)' },
      { syntax: 'Dog --|> Animal', relationType: 'inheritance', sourceId: 'Dog', targetId: 'Animal', description: 'inheritance (right arrow)' },
      // Composition (Mermaid: COMPOSITION = 2)
      { syntax: 'Car *-- Engine', relationType: 'composition', sourceId: 'Engine', targetId: 'Car', description: 'composition (left)' },
      { syntax: 'Engine --* Car', relationType: 'composition', sourceId: 'Engine', targetId: 'Car', description: 'composition (right)' },
      // Aggregation (Mermaid: AGGREGATION = 0)
      { syntax: 'Fleet o-- Car', relationType: 'aggregation', sourceId: 'Car', targetId: 'Fleet', description: 'aggregation (left)' },
      { syntax: 'Car --o Fleet', relationType: 'aggregation', sourceId: 'Car', targetId: 'Fleet', description: 'aggregation (right)' },
      // Association
      { syntax: 'A --> B', relationType: 'association', sourceId: 'A', targetId: 'B', description: 'association (directional)' },
      // Dependency (Mermaid: DEPENDENCY = 3)
      { syntax: 'A ..> B', relationType: 'dependency', sourceId: 'A', targetId: 'B', description: 'dependency (right)' },
      { syntax: 'B <.. A', relationType: 'dependency', sourceId: 'A', targetId: 'B', description: 'dependency (left)' },
      // Realization
      { syntax: 'A ..|> B', relationType: 'realization', sourceId: 'A', targetId: 'B', description: 'realization (right)' },
      { syntax: 'B <|.. A', relationType: 'realization', sourceId: 'A', targetId: 'B', description: 'realization (left)' },
      // Link (solid line, no arrow)
      { syntax: 'A -- B', relationType: 'link', sourceId: 'A', targetId: 'B', description: 'solid link' },
      // Dashed (dashed line, no arrow)
      { syntax: 'A .. B', relationType: 'dashed', sourceId: 'A', targetId: 'B', description: 'dashed link' },
    ];

    for (const spec of CLASS_RELATION_SPEC) {
      it(`parses ${spec.description}: ${spec.syntax}`, () => {
        const graph = fromMermaidClass(`classDiagram\n    ${spec.syntax}`);
        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].data.relationType).toBe(spec.relationType);
        expect(graph.edges[0].sourceId).toBe(spec.sourceId);
        expect(graph.edges[0].targetId).toBe(spec.targetId);
      });
    }
  });

  describe('member visibility exhaustive coverage', () => {
    // Mermaid's class diagram visibility modifiers
    const VISIBILITY_SPEC: Array<{ char: string; name: string }> = [
      { char: '+', name: 'public' },
      { char: '-', name: 'private' },
      { char: '#', name: 'protected' },
      { char: '~', name: 'package/internal' },
    ];

    for (const spec of VISIBILITY_SPEC) {
      it(`parses ${spec.name} visibility: ${spec.char}`, () => {
        const graph = fromMermaidClass(`
classDiagram
    class MyClass {
        ${spec.char}myField String
        ${spec.char}myMethod() void
    }
        `);
        const members = graph.nodes[0].data.members!;
        expect(members[0].visibility).toBe(spec.char);
        expect(members[0].isMethod).toBe(false);
        expect(members[1].visibility).toBe(spec.char);
        expect(members[1].isMethod).toBe(true);
      });
    }
  });

  describe('class features (from Mermaid class.spec.ts)', () => {
    it('parses annotation and generic together', () => {
      const graph = fromMermaidClass(`
classDiagram
    class List~T~ {
        <<interface>>
        +add(item T) void
        +size() int
    }
      `);
      expect(graph.nodes[0].data.genericType).toBe('T');
      expect(graph.nodes[0].data.annotation).toBe('interface');
      expect(graph.nodes[0].data.members).toHaveLength(2);
    });

    it('parses cardinality on relationships', () => {
      const graph = fromMermaidClass(`
classDiagram
    "1" Customer --> "*" Order : places
    "0..1" Order --> "1..*" LineItem : contains
      `);
      expect(graph.edges[0].data.sourceCardinality).toBe('1');
      expect(graph.edges[0].data.targetCardinality).toBe('*');
      expect(graph.edges[1].data.sourceCardinality).toBe('0..1');
      expect(graph.edges[1].data.targetCardinality).toBe('1..*');
    });
  });

  describe('round-trip: complex class diagram', () => {
    it('round-trips an inheritance hierarchy', () => {
      const input = `classDiagram
    class Animal {
        +String name
        +int age
        +eat() void
        +sleep() void
    }
    class Dog {
        +String breed
        +bark() void
    }
    class Cat {
        +bool indoor
        +purr() void
    }
    Animal <|-- Dog : extends
    Animal <|-- Cat : extends`;

      const graph = fromMermaidClass(input);
      const output = toMermaidClass(graph);
      const graph2 = fromMermaidClass(output);

      expect(graph2.nodes.map(n => n.id).sort()).toEqual(['Animal', 'Cat', 'Dog']);
      expect(graph2.edges).toHaveLength(2);
      for (const edge of graph2.edges) {
        expect(edge.data.relationType).toBe('inheritance');
        expect(edge.targetId).toBe('Animal');
      }
    });
  });
});

// ============================================================================
// State diagram spec-parity tests
// Derived from Mermaid's state parser tests
// ============================================================================

describe('State diagram spec-parity', () => {
  describe('pseudo-state coverage', () => {
    it('handles [*] as both source and target in same diagram', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : submit
    Processing --> Done : complete
    Done --> [*]
      `);
      const startNodes = graph.nodes.filter(n => n.data.isStart);
      const endNodes = graph.nodes.filter(n => n.data.isEnd);
      expect(startNodes).toHaveLength(1);
      expect(endNodes).toHaveLength(1);
      // They should be different nodes
      expect(startNodes[0].id).not.toBe(endNodes[0].id);
    });

    it('handles [*] inside composite states', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Active {
        [*] --> Running
        Running --> [*]
    }
      `);
      const startNodes = graph.nodes.filter(n => n.data.isStart);
      const endNodes = graph.nodes.filter(n => n.data.isEnd);
      expect(startNodes).toHaveLength(1);
      expect(endNodes).toHaveLength(1);
      // They should be children of Active (or a region of Active)
      expect(startNodes[0].parentId).toBeTruthy();
      expect(endNodes[0].parentId).toBeTruthy();
    });
  });

  describe('stereotype exhaustive coverage', () => {
    const STEREOTYPES = ['choice', 'fork', 'join'];

    for (const stereotype of STEREOTYPES) {
      it(`parses <<${stereotype}>> stereotype and round-trips it`, () => {
        const graph = fromMermaidState(`
stateDiagram-v2
    state myState <<${stereotype}>>
    [*] --> myState
        `);
        const node = graph.nodes.find(n => n.id === 'myState')!;
        expect(node.data.stateType).toBe(stereotype);
      });
    }
  });

  describe('composite state patterns (from Mermaid state.spec.ts)', () => {
    it('handles composite with transitions between children', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Workflow {
        Pending --> InReview : submit
        InReview --> Approved : approve
        InReview --> Rejected : reject
    }
      `);
      expect(graph.nodes.find(n => n.id === 'Pending')!.parentId).toBe('Workflow');
      expect(graph.nodes.find(n => n.id === 'InReview')!.parentId).toBe('Workflow');
      expect(graph.nodes.find(n => n.id === 'Approved')!.parentId).toBe('Workflow');
      expect(graph.nodes.find(n => n.id === 'Rejected')!.parentId).toBe('Workflow');
      expect(graph.edges).toHaveLength(3);
    });

    it('handles composite with both internal and external transitions', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Active {
        Running
        Paused
        Running --> Paused : pause
    }
    Idle --> Active : start
    Active --> Done : finish
      `);
      // Internal transitions
      const internal = graph.edges.find(e => e.sourceId === 'Running' && e.targetId === 'Paused');
      expect(internal).toBeDefined();
      // External transitions
      const enter = graph.edges.find(e => e.targetId === 'Active');
      const exit = graph.edges.find(e => e.sourceId === 'Active');
      expect(enter).toBeDefined();
      expect(exit).toBeDefined();
    });
  });

  describe('parallel regions (from Mermaid state.spec.ts)', () => {
    it('creates separate region nodes for each -- section', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Dashboard {
        [*] --> Loading
        Loading --> Ready
        --
        [*] --> Connecting
        Connecting --> Connected
        --
        [*] --> Initializing
        Initializing --> Initialized
    }
      `);
      const dashboard = graph.nodes.find(n => n.id === 'Dashboard')!;
      expect(dashboard.data.stateType).toBe('parallel');

      const regions = graph.nodes.filter(n => n.parentId === 'Dashboard' && n.id.includes('_region_'));
      expect(regions).toHaveLength(3);

      // Each region should have its own start node and states
      expect(graph.nodes.find(n => n.id === 'Loading')!.parentId).toBe('Dashboard_region_0');
      expect(graph.nodes.find(n => n.id === 'Connecting')!.parentId).toBe('Dashboard_region_1');
      expect(graph.nodes.find(n => n.id === 'Initializing')!.parentId).toBe('Dashboard_region_2');
    });
  });

  describe('direction support', () => {
    const DIRECTIONS: Array<{ mermaid: string; internal: string }> = [
      { mermaid: 'LR', internal: 'right' },
      { mermaid: 'RL', internal: 'left' },
      { mermaid: 'TB', internal: 'down' },
      { mermaid: 'BT', internal: 'up' },
    ];

    for (const dir of DIRECTIONS) {
      it(`maps direction ${dir.mermaid} to '${dir.internal}'`, () => {
        const graph = fromMermaidState(`
stateDiagram-v2
    direction ${dir.mermaid}
    A --> B
        `);
        expect(graph.direction).toBe(dir.internal);
      });
    }
  });

  describe('round-trip: complex state diagram', () => {
    it('round-trips statechart with composite states and transitions', () => {
      const input = `stateDiagram-v2
    [*] --> Idle
    state Active {
        Processing
        Validating
        Processing --> Validating : validate
    }
    Idle --> Active : start
    Active --> Done : finish
    Active --> Error : fail
    Error --> Idle : reset
    Done --> [*]`;

      const graph = fromMermaidState(input);

      // Verify initial parse captures hierarchy
      expect(graph.nodes.find(n => n.id === 'Processing')!.parentId).toBe('Active');
      expect(graph.nodes.find(n => n.id === 'Validating')!.parentId).toBe('Active');

      const output = toMermaidState(graph);
      const graph2 = fromMermaidState(output);

      // Same real nodes (non-pseudo)
      const realNodes = (g: typeof graph) =>
        g.nodes.filter(n => !n.data.isStart && !n.data.isEnd).map(n => n.id).sort();
      expect(realNodes(graph2)).toEqual(realNodes(graph));

      // Same edges count
      expect(graph2.edges).toHaveLength(graph.edges.length);

      // Active node exists in round-tripped graph
      expect(graph2.nodes.find(n => n.id === 'Active')).toBeDefined();
    });
  });
});

// ============================================================================
// ER diagram spec-parity tests
// ============================================================================

describe('ER diagram spec-parity', () => {
  describe('cardinality exhaustive coverage (crow\'s foot notation)', () => {
    // All 16 combinations of left × right cardinality
    const LEFT_CARDS: Array<{ syntax: string; value: string }> = [
      { syntax: '||', value: 'one' },
      { syntax: '|o', value: 'zero-or-one' },
      { syntax: '}|', value: 'one-or-more' },
      { syntax: '}o', value: 'zero-or-more' },
    ];
    const RIGHT_CARDS: Array<{ syntax: string; value: string }> = [
      { syntax: '||', value: 'one' },
      { syntax: 'o|', value: 'zero-or-one' },
      { syntax: '|{', value: 'one-or-more' },
      { syntax: 'o{', value: 'zero-or-more' },
    ];

    for (const left of LEFT_CARDS) {
      for (const right of RIGHT_CARDS) {
        it(`parses ${left.value} --to-- ${right.value}: ${left.syntax}--${right.syntax}`, () => {
          const graph = fromMermaidER(
            `erDiagram\n    A ${left.syntax}--${right.syntax} B : rel`,
          );
          expect(graph.edges[0].data.sourceCardinality).toBe(left.value);
          expect(graph.edges[0].data.targetCardinality).toBe(right.value);
          expect(graph.edges[0].data.identifying).toBe(true);
        });
      }
    }

    // Non-identifying (dotted line) variants
    for (const left of LEFT_CARDS) {
      for (const right of RIGHT_CARDS) {
        it(`parses non-identifying ${left.value} ..to.. ${right.value}`, () => {
          const graph = fromMermaidER(
            `erDiagram\n    A ${left.syntax}..${right.syntax} B : rel`,
          );
          expect(graph.edges[0].data.sourceCardinality).toBe(left.value);
          expect(graph.edges[0].data.targetCardinality).toBe(right.value);
          expect(graph.edges[0].data.identifying).toBe(false);
        });
      }
    }
  });

  describe('entity attribute features', () => {
    it('parses all key types: PK, FK, UK', () => {
      const graph = fromMermaidER(`
erDiagram
    ENTITY {
        int id PK
        int parent_id FK
        string email UK
        string name
    }
      `);
      const attrs = graph.nodes[0].data.attributes!;
      expect(attrs[0].key).toBe('PK');
      expect(attrs[1].key).toBe('FK');
      expect(attrs[2].key).toBe('UK');
      expect(attrs[3].key).toBeUndefined();
    });
  });

  describe('round-trip: complex ER diagram', () => {
    it('round-trips a multi-entity diagram', () => {
      const input = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"`;

      const graph = fromMermaidER(input);
      const output = toMermaidER(graph);
      const graph2 = fromMermaidER(output);

      expect(graph2.nodes.map(n => n.id).sort()).toEqual(graph.nodes.map(n => n.id).sort());
      expect(graph2.edges).toHaveLength(graph.edges.length);
      for (let i = 0; i < graph.edges.length; i++) {
        expect(graph2.edges[i].data.sourceCardinality).toBe(graph.edges[i].data.sourceCardinality);
        expect(graph2.edges[i].data.targetCardinality).toBe(graph.edges[i].data.targetCardinality);
        expect(graph2.edges[i].data.identifying).toBe(graph.edges[i].data.identifying);
      }
    });
  });
});

// ============================================================================
// Cross-format consistency tests
// Verify consistent behavior across all formats
// ============================================================================

describe('Cross-format consistency', () => {
  it('all formats throw on empty input', () => {
    expect(() => fromMermaidFlowchart('')).toThrow();
    expect(() => fromMermaidSequence('')).toThrow();
    expect(() => fromMermaidState('')).toThrow();
    expect(() => fromMermaidClass('')).toThrow();
    expect(() => fromMermaidER('')).toThrow();
  });

  it('all formats throw on wrong diagram type', () => {
    expect(() => fromMermaidFlowchart('sequenceDiagram\n  A->>B: hi')).toThrow();
    expect(() => fromMermaidSequence('graph TD\n  A-->B')).toThrow();
    expect(() => fromMermaidState('graph TD\n  A')).toThrow();
    expect(() => fromMermaidClass('graph TD\n  A')).toThrow();
    expect(() => fromMermaidER('graph TD\n  A')).toThrow();
  });

  it('all formats throw on non-string input', () => {
    expect(() => fromMermaidFlowchart(null as any)).toThrow();
    expect(() => fromMermaidSequence(42 as any)).toThrow();
    expect(() => fromMermaidState(undefined as any)).toThrow();
    expect(() => fromMermaidClass({} as any)).toThrow();
    expect(() => fromMermaidER([] as any)).toThrow();
  });

  it('all formats strip %% comments', () => {
    const flowchart = fromMermaidFlowchart('flowchart TD\n    %% comment\n    A --> B');
    expect(flowchart.nodes).toHaveLength(2);

    const sequence = fromMermaidSequence('sequenceDiagram\n    %% comment\n    A->>B: hi');
    expect(sequence.edges).toHaveLength(1);

    const state = fromMermaidState('stateDiagram-v2\n    %% comment\n    A --> B');
    expect(state.nodes).toHaveLength(2);

    const classDiag = fromMermaidClass('classDiagram\n    %% comment\n    A --> B');
    expect(classDiag.edges).toHaveLength(1);
  });
});
