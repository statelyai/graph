import { describe, expect, it } from 'vitest';
import {
  fromMermaidIshikawa,
  toMermaidIshikawa,
} from '../../../src/formats/mermaid/ishikawa';

describe('Mermaid Ishikawa Diagram Converter', () => {
  describe('fromMermaidIshikawa()', () => {
    it('parses indentation as cause hierarchy', () => {
      const graph = fromMermaidIshikawa(`
ishikawa-beta
Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
    Equipment
        Lens
            Dirty lens
      `);

      expect(graph.data).toEqual({ diagramType: 'ishikawa' });
      expect(graph.nodes).toHaveLength(7);
      expect(graph.edges).toHaveLength(6);

      const effect = graph.nodes[0];
      expect(effect.label).toBe('Blurry Photo');
      expect(effect.parentId).toBeNull();
      expect(effect.data.kind).toBe('effect');

      const process = graph.nodes.find(node => node.label === 'Process')!;
      const outOfFocus = graph.nodes.find(node => node.label === 'Out of focus')!;
      expect(process.parentId).toBe(effect.id);
      expect(outOfFocus.parentId).toBe(process.id);
      expect(outOfFocus.data.kind).toBe('cause');
    });

    it('throws on invalid input', () => {
      expect(() => fromMermaidIshikawa('')).toThrow('input is empty');
      expect(() => fromMermaidIshikawa('mindmap\n  Root')).toThrow(
        'expected "ishikawa-beta" header',
      );
    });
  });

  describe('toMermaidIshikawa()', () => {
    it('serializes an Ishikawa graph', () => {
      const output = toMermaidIshikawa({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'problem',
            parentId: null,
            initialNodeId: null,
            label: 'Blurry Photo',
            data: { kind: 'effect' },
          },
          {
            type: 'node',
            id: 'process',
            parentId: 'problem',
            initialNodeId: null,
            label: 'Process',
            data: { kind: 'cause' },
          },
          {
            type: 'node',
            id: 'focus',
            parentId: 'process',
            initialNodeId: null,
            label: 'Out of focus',
            data: { kind: 'cause' },
          },
        ],
        edges: [],
        data: { diagramType: 'ishikawa' },
      });

      expect(output).toBe([
        'ishikawa-beta',
        'Blurry Photo',
        '    Process',
        '        Out of focus',
      ].join('\n'));
    });

    it('round-trips documented syntax', () => {
      const input = `
ishikawa-beta
Blurry Photo
    User
        Shaky hands
    Environment
        Too dark
      `;

      const graph = fromMermaidIshikawa(input);
      const output = toMermaidIshikawa(graph);
      const graph2 = fromMermaidIshikawa(output);

      expect(graph2.nodes.map(node => node.label)).toEqual(
        graph.nodes.map(node => node.label),
      );
      expect(graph2.edges).toHaveLength(graph.edges.length);
    });
  });
});
