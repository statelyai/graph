import { describe, it, expect } from 'vitest';
import {
  fromMermaidER,
  toMermaidER,
} from '../../../src/formats/mermaid/er-diagram';

describe('Mermaid ER Diagram Converter', () => {
  describe('fromMermaidER()', () => {
    it('parses basic ER diagram with relationship', () => {
      const graph = fromMermaidER(`
erDiagram
    CUSTOMER ||--o{ ORDER : places
      `);
      expect(graph.data.diagramType).toBe('erDiagram');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('CUSTOMER');
      expect(graph.edges[0].targetId).toBe('ORDER');
      expect(graph.edges[0].label).toBe('places');
      expect(graph.edges[0].data.sourceCardinality).toBe('one');
      expect(graph.edges[0].data.targetCardinality).toBe('zero-or-more');
      expect(graph.edges[0].data.identifying).toBe(true);
    });

    it('parses non-identifying relationship', () => {
      const graph = fromMermaidER(`
erDiagram
    CUSTOMER }o..o{ PRODUCT : likes
      `);
      expect(graph.edges[0].data.sourceCardinality).toBe('zero-or-more');
      expect(graph.edges[0].data.targetCardinality).toBe('zero-or-more');
      expect(graph.edges[0].data.identifying).toBe(false);
    });

    it('parses all cardinality combinations', () => {
      const graph = fromMermaidER(`
erDiagram
    A ||--|| B : one-to-one
    C |o--o| D : zeroOne-to-zeroOne
    E }|--|{ F : oneMore-to-oneMore
    G }o--o{ H : zeroMore-to-zeroMore
      `);
      expect(graph.edges[0].data).toMatchObject({
        sourceCardinality: 'one',
        targetCardinality: 'one',
      });
      expect(graph.edges[1].data).toMatchObject({
        sourceCardinality: 'zero-or-one',
        targetCardinality: 'zero-or-one',
      });
      expect(graph.edges[2].data).toMatchObject({
        sourceCardinality: 'one-or-more',
        targetCardinality: 'one-or-more',
      });
      expect(graph.edges[3].data).toMatchObject({
        sourceCardinality: 'zero-or-more',
        targetCardinality: 'zero-or-more',
      });
    });

    it('parses Mermaid v11.13 one-cardinality alias', () => {
      const graph = fromMermaidER(`
erDiagram
    CUSTOMER 1--1 PROFILE : owns
      `);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].data).toMatchObject({
        sourceCardinality: 'one',
        targetCardinality: 'one',
        identifying: true,
      });
    });

    it('parses entity attributes', () => {
      const graph = fromMermaidER(`
erDiagram
    CUSTOMER {
        int id PK
        string name
        string email UK "unique email"
    }
      `);
      const attrs = graph.nodes[0].data.attributes!;
      expect(attrs).toHaveLength(3);
      expect(attrs[0]).toMatchObject({ type: 'int', name: 'id', key: 'PK' });
      expect(attrs[1]).toMatchObject({ type: 'string', name: 'name' });
      expect(attrs[2]).toMatchObject({
        type: 'string',
        name: 'email',
        key: 'UK',
        comment: 'unique email',
      });
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidER('')).toThrow('input is empty');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidER('graph TD\n  A')).toThrow(
        'expected "erDiagram"',
      );
    });
  });

  describe('toMermaidER()', () => {
    it('serializes ER diagram', () => {
      const output = toMermaidER({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'CUSTOMER',
            parentId: null,
            initialNodeId: null,
            label: 'CUSTOMER',
            data: {
              attributes: [
                { type: 'int', name: 'id', key: 'PK' as const },
                { type: 'string', name: 'name' },
              ],
            },
          },
          { type: 'node', id: 'ORDER', parentId: null, initialNodeId: null, label: 'ORDER', data: {} },
        ],
        edges: [
          {
            type: 'edge',
            id: 'e0',
            sourceId: 'CUSTOMER',
            targetId: 'ORDER',
            label: 'places',
            data: {
              sourceCardinality: 'one' as const,
              targetCardinality: 'zero-or-more' as const,
              identifying: true,
            },
          },
        ],
        data: { diagramType: 'erDiagram' },
      });
      expect(output).toContain('erDiagram');
      expect(output).toContain('CUSTOMER {');
      expect(output).toContain('int id PK');
      expect(output).toContain('CUSTOMER ||--o{ ORDER : "places"');
    });
  });

  describe('round-trip', () => {
    it('round-trips ER diagram', () => {
      const input = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains`;

      const graph = fromMermaidER(input);
      const output = toMermaidER(graph);
      const graph2 = fromMermaidER(output);

      expect(graph2.nodes.map((n) => n.id).sort()).toEqual(
        graph.nodes.map((n) => n.id).sort(),
      );
      expect(graph2.edges).toHaveLength(graph.edges.length);
      for (let i = 0; i < graph.edges.length; i++) {
        expect(graph2.edges[i].data.sourceCardinality).toBe(
          graph.edges[i].data.sourceCardinality,
        );
        expect(graph2.edges[i].data.targetCardinality).toBe(
          graph.edges[i].data.targetCardinality,
        );
      }
    });
  });
});
