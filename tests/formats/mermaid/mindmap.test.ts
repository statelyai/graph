import { describe, it, expect } from 'vitest';
import {
  fromMermaidMindmap,
  toMermaidMindmap,
} from '../../../src/formats/mermaid/mindmap';

describe('Mermaid Mindmap Converter', () => {
  describe('fromMermaidMindmap()', () => {
    it('parses basic mindmap with hierarchy', () => {
      const graph = fromMermaidMindmap(`
mindmap
  Root
    Child1
      Grandchild
    Child2
      `);
      expect(graph.data.diagramType).toBe('mindmap');
      expect(graph.nodes).toHaveLength(4);
      expect(graph.nodes[0].label).toBe('Root');
      expect(graph.nodes[0].parentId).toBeNull();

      const child1 = graph.nodes.find((n) => n.label === 'Child1')!;
      expect(child1.parentId).toBe(graph.nodes[0].id);

      const grandchild = graph.nodes.find((n) => n.label === 'Grandchild')!;
      expect(grandchild.parentId).toBe(child1.id);

      const child2 = graph.nodes.find((n) => n.label === 'Child2')!;
      expect(child2.parentId).toBe(graph.nodes[0].id);
    });

    it('auto-creates parent-child edges', () => {
      const graph = fromMermaidMindmap(`
mindmap
  Root
    A
    B
      `);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0].sourceId).toBe(graph.nodes[0].id);
      expect(graph.edges[0].targetId).toBe(graph.nodes[1].id);
    });

    it('parses node shapes', () => {
      const graph = fromMermaidMindmap(`
mindmap
  Root
    [Square]
    (Rounded)
    ((Circle))
      `);
      const shapes = graph.nodes.slice(1).map((n) => [n.label, (n as any).shape]);
      expect(shapes).toEqual([
        ['Square', 'rectangle'],
        ['Rounded', 'rounded'],
        ['Circle', 'circle'],
      ]);
    });

    it('attaches a standalone ::icon() line to the preceding node', () => {
      const graph = fromMermaidMindmap(`
mindmap
  Root
    A
      ::icon(fa fa-book)
      `);
      // No extra node is created for the icon line; it decorates node A.
      expect(graph.nodes).toHaveLength(2);
      const a = graph.nodes.find((n) => n.label === 'A')!;
      expect(a.data.icon).toBe('fa fa-book');
    });

    it('parses an inline ::icon() on the node line', () => {
      const graph = fromMermaidMindmap(`
mindmap
  Root
    A ::icon(fa fa-star)
      `);
      const a = graph.nodes.find((n) => n.label === 'A')!;
      expect(a.data.icon).toBe('fa fa-star');
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidMindmap('')).toThrow('input is empty');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidMindmap('graph TD\n  A')).toThrow(
        'expected "mindmap"',
      );
    });
  });

  describe('toMermaidMindmap()', () => {
    it('serializes mindmap with hierarchy', () => {
      const output = toMermaidMindmap({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'r', parentId: null, initialNodeId: null, label: 'Root', data: {} },
          { type: 'node', id: 'a', parentId: 'r', initialNodeId: null, label: 'Child A', data: {} },
          { type: 'node', id: 'b', parentId: 'r', initialNodeId: null, label: 'Child B', data: {} },
          { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Grandchild', data: {} },
        ],
        edges: [],
        data: { diagramType: 'mindmap' },
      });
      expect(output).toContain('mindmap');
      expect(output).toContain('Root');
      expect(output).toContain('Child A');
      expect(output).toContain('Grandchild');
      // Verify indentation hierarchy
      const lines = output.split('\n');
      const rootLine = lines.find((l) => l.includes('Root'))!;
      const childLine = lines.find((l) => l.includes('Child A'))!;
      const grandLine = lines.find((l) => l.includes('Grandchild'))!;
      const rootIndent = rootLine.length - rootLine.trimStart().length;
      const childIndent = childLine.length - childLine.trimStart().length;
      const grandIndent = grandLine.length - grandLine.trimStart().length;
      expect(childIndent).toBeGreaterThan(rootIndent);
      expect(grandIndent).toBeGreaterThan(childIndent);
    });

    it('serializes node shapes', () => {
      const output = toMermaidMindmap({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'r', parentId: null, initialNodeId: null, label: 'Root', data: {} },
          { type: 'node', id: 'a', parentId: 'r', initialNodeId: null, label: 'Circle', data: {}, shape: 'circle' } as any,
        ],
        edges: [],
        data: { diagramType: 'mindmap' },
      });
      expect(output).toContain('((Circle))');
    });
  });

  describe('round-trip', () => {
    it('round-trips basic mindmap', () => {
      const input = `mindmap
  Root
    Child1
    Child2
      Grandchild`;

      const graph = fromMermaidMindmap(input);
      const output = toMermaidMindmap(graph);
      const graph2 = fromMermaidMindmap(output);

      expect(graph2.nodes).toHaveLength(graph.nodes.length);
      // Labels should match
      expect(graph2.nodes.map((n) => n.label).sort()).toEqual(
        graph.nodes.map((n) => n.label).sort(),
      );
    });

    it('round-trips ::icon() decorations', () => {
      const input = `mindmap
  Root
    A
      ::icon(fa fa-book)
    B`;
      const g1 = fromMermaidMindmap(input);
      const out = toMermaidMindmap(g1);
      expect(out).toContain('::icon(fa fa-book)');
      const g2 = fromMermaidMindmap(out);
      expect(g2.nodes).toHaveLength(g1.nodes.length);
      const a1 = g1.nodes.find((n) => n.label === 'A')!;
      const a2 = g2.nodes.find((n) => n.label === 'A')!;
      expect(a2.data.icon).toBe(a1.data.icon);
      expect(a2.data.icon).toBe('fa fa-book');
    });
  });
});
