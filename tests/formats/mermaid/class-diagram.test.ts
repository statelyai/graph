import { describe, it, expect } from 'vitest';
import {
  fromMermaidClass,
  toMermaidClass,
} from '../../../src/formats/mermaid/class-diagram';

describe('Mermaid Class Diagram Converter', () => {
  describe('fromMermaidClass()', () => {
    it('parses basic class with members', () => {
      const graph = fromMermaidClass(`
classDiagram
    class Animal {
        +String name
        +int age
        +eat() void
    }
      `);
      expect(graph.data.diagramType).toBe('classDiagram');
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].id).toBe('Animal');
      expect(graph.nodes[0].data.members).toHaveLength(3);
      expect(graph.nodes[0].data.members![0]).toMatchObject({
        visibility: '+',
        name: 'name',
        type: 'String',
        isMethod: false,
      });
      expect(graph.nodes[0].data.members![2]).toMatchObject({
        visibility: '+',
        isMethod: true,
      });
    });

    it('parses inheritance relationship', () => {
      const graph = fromMermaidClass(`
classDiagram
    Animal <|-- Dog
      `);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].data.relationType).toBe('inheritance');
      // Dog inherits from Animal: source=Dog, target=Animal (reversed arrow)
      expect(graph.edges[0].sourceId).toBe('Dog');
      expect(graph.edges[0].targetId).toBe('Animal');
    });

    it('parses all relationship types', () => {
      const graph = fromMermaidClass(`
classDiagram
    A <|-- B
    C *-- D
    E o-- F
    G --> H
    I ..> J
    K ..|> L
    M -- N
    O .. P
      `);
      const types = graph.edges.map((e) => e.data.relationType);
      expect(types).toEqual([
        'inheritance',
        'composition',
        'aggregation',
        'association',
        'dependency',
        'realization',
        'link',
        'dashed',
      ]);
    });

    it('parses relationship with label', () => {
      const graph = fromMermaidClass(`
classDiagram
    Animal <|-- Dog : extends
      `);
      expect(graph.edges[0].label).toBe('extends');
    });

    it('parses cardinality', () => {
      const graph = fromMermaidClass(`
classDiagram
    "1" Customer --> "*" Order : places
      `);
      expect(graph.edges[0].data.sourceCardinality).toBe('1');
      expect(graph.edges[0].data.targetCardinality).toBe('*');
    });

    it('parses visibility modifiers', () => {
      const graph = fromMermaidClass(`
classDiagram
    class MyClass {
        +publicField
        -privateField
        #protectedField
        ~packageField
    }
      `);
      const members = graph.nodes[0].data.members!;
      expect(members[0].visibility).toBe('+');
      expect(members[1].visibility).toBe('-');
      expect(members[2].visibility).toBe('#');
      expect(members[3].visibility).toBe('~');
    });

    it('parses annotation <<interface>>', () => {
      const graph = fromMermaidClass(`
classDiagram
    class Flyable {
        <<interface>>
        +fly() void
    }
      `);
      expect(graph.nodes[0].data.annotation).toBe('interface');
    });

    it('parses generic type', () => {
      const graph = fromMermaidClass(`
classDiagram
    class List~T~ {
        +add(item T)
    }
      `);
      expect(graph.nodes[0].data.genericType).toBe('T');
    });

    it('parses inline member syntax', () => {
      const graph = fromMermaidClass(`
classDiagram
    Animal : +name String
    Animal : +eat() void
      `);
      expect(graph.nodes[0].data.members).toHaveLength(2);
    });

    it('auto-creates nodes from relationships', () => {
      const graph = fromMermaidClass(`
classDiagram
    Cat --> Mouse
      `);
      expect(graph.nodes).toHaveLength(2);
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidClass('')).toThrow('input is empty');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidClass('graph TD\n  A')).toThrow(
        'expected "classDiagram"',
      );
    });
  });

  describe('toMermaidClass()', () => {
    it('serializes class with members', () => {
      const output = toMermaidClass({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'Animal',
            parentId: null,
            initialNodeId: null,
            label: 'Animal',
            data: {
              members: [
                { visibility: '+', name: 'name', type: 'String', isMethod: false },
                { visibility: '+', name: 'eat()', isMethod: true },
              ],
            },
          },
        ],
        edges: [],
        data: { diagramType: 'classDiagram' },
      });
      expect(output).toContain('class Animal {');
      expect(output).toContain('+String name');
      expect(output).toContain('+eat()');
    });

    it('serializes relationships', () => {
      const output = toMermaidClass({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'B', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: 'extends', data: { relationType: 'inheritance' } },
        ],
        data: { diagramType: 'classDiagram' },
      });
      expect(output).toContain('A --|> B : extends');
    });
  });

  describe('round-trip', () => {
    it('round-trips class diagram', () => {
      const input = `classDiagram
    class Animal {
        +String name
        +eat() void
    }
    class Dog
    Animal <|-- Dog : extends`;

      const graph = fromMermaidClass(input);
      const output = toMermaidClass(graph);
      const graph2 = fromMermaidClass(output);

      expect(graph2.nodes.map((n) => n.id).sort()).toEqual(
        graph.nodes.map((n) => n.id).sort(),
      );
      expect(graph2.edges).toHaveLength(graph.edges.length);
    });
  });
});
