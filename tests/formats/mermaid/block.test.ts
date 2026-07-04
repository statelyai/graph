import { describe, it, expect } from 'vitest';
import {
  fromMermaidBlock,
  toMermaidBlock,
} from '../../../src/formats/mermaid/block';

describe('Mermaid Block Diagram Converter', () => {
  describe('fromMermaidBlock()', () => {
    it('parses basic block diagram', () => {
      const graph = fromMermaidBlock(`
block-beta
    columns 3
    a b c
      `);
      expect(graph.data.diagramType).toBe('block');
      expect(graph.data.columns).toBe(3);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('parses nested blocks with parentId', () => {
      const graph = fromMermaidBlock(`
block-beta
    block:outer
        a
        b
    end
    c
      `);
      const outer = graph.nodes.find((n) => n.id === 'outer')!;
      expect(outer.parentId).toBeNull();
      expect(graph.nodes.find((n) => n.id === 'a')!.parentId).toBe('outer');
      expect(graph.nodes.find((n) => n.id === 'b')!.parentId).toBe('outer');
      expect(graph.nodes.find((n) => n.id === 'c')!.parentId).toBeNull();
    });

    it('parses edges', () => {
      const graph = fromMermaidBlock(`
block-beta
    a
    b
    a --> b
      `);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('a');
      expect(graph.edges[0].targetId).toBe('b');
    });

    it('parses node with span', () => {
      const graph = fromMermaidBlock(`
block-beta
    columns 3
    a["Wide Block"]:2
    b
      `);
      const nodeA = graph.nodes.find((n) => n.id === 'a')!;
      expect(nodeA.data.span).toBe(2);
      expect(nodeA.label).toBe('Wide Block');
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidBlock('')).toThrow('input is empty');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidBlock('graph TD\n  A')).toThrow(
        'expected "block-beta"',
      );
    });
  });

  describe('toMermaidBlock()', () => {
    it('serializes block diagram', () => {
      const output = toMermaidBlock({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'a', data: {} },
          { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'b', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'a', targetId: 'b', label: '', data: {} },
        ],
        data: { diagramType: 'block', columns: 2 },
      });
      expect(output).toContain('block-beta');
      expect(output).toContain('columns 2');
      expect(output).toContain('a --> b');
    });

    it('serializes nested blocks', () => {
      const output = toMermaidBlock({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'outer', parentId: null, initialNodeId: null, label: 'outer', data: {} },
          { type: 'node', id: 'inner', parentId: 'outer', initialNodeId: null, label: 'inner', data: {} },
        ],
        edges: [],
        data: { diagramType: 'block' },
      });
      expect(output).toContain('block:outer');
      expect(output).toContain('inner');
      expect(output).toContain('end');
    });
  });

  describe('round-trip', () => {
    it('round-trips block diagram', () => {
      const input = `block-beta
    columns 2
    a b
    a --> b`;

      const graph = fromMermaidBlock(input);
      const output = toMermaidBlock(graph);
      const graph2 = fromMermaidBlock(output);

      expect(graph2.nodes.map((n) => n.id).sort()).toEqual(
        graph.nodes.map((n) => n.id).sort(),
      );
      expect(graph2.edges).toHaveLength(graph.edges.length);
    });
  });

  describe('edge type round-trip fidelity', () => {
    const FIXTURE = `block-beta
    columns 2
    a["A"] b["B"]
    c["C"] d["D"]
    a --> b
    b --- c
    c ==> d
    a -.-> d`;

    it('preserves distinct edge arrow tokens', () => {
      const g = fromMermaidBlock(FIXTURE);
      const tokens = g.edges.map((e) => e.data.arrowToken);
      expect(tokens).toEqual(['-->', '---', '==>', '-.->']);
      const strokes = g.edges.map((e) => e.data.stroke);
      expect(strokes).toEqual(['normal', 'normal', 'thick', 'dotted']);
      expect(g.edges.map((e) => e.data.arrowType)).toEqual([
        'arrow',
        'none',
        'arrow',
        'arrow',
      ]);
    });

    it('emits the exact original arrow token', () => {
      const out = toMermaidBlock(fromMermaidBlock(FIXTURE));
      expect(out).toContain('a --> b');
      expect(out).toContain('b --- c');
      expect(out).toContain('c ==> d');
      expect(out).toContain('a -.-> d');
    });

    it('round-trips a pipe-labeled edge', () => {
      const g = fromMermaidBlock('block-beta\n    a b\n    a -->|link| b');
      expect(g.edges[0].label).toBe('link');
      const out = toMermaidBlock(g);
      expect(out).toContain('a --> |link| b');
      const g2 = fromMermaidBlock(out);
      expect(g2.edges[0].label).toBe('link');
    });

    it('is stable under parse → emit → parse', () => {
      const g1 = fromMermaidBlock(FIXTURE);
      const g2 = fromMermaidBlock(toMermaidBlock(g1));
      expect(g2.edges.map((e) => e.data.arrowToken)).toEqual(
        g1.edges.map((e) => e.data.arrowToken),
      );
    });
  });
});
