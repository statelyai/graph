import { describe, it, expect } from 'vitest';
import {
  fromMermaidSequence,
  toMermaidSequence,
} from '../../../src/formats/mermaid/sequence';

describe('Mermaid Sequence Converter', () => {
  describe('fromMermaidSequence()', () => {
    it('parses basic sequence with two participants and a message', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>Bob: Hello Bob
      `);
      expect(graph.type).toBe('directed');
      expect(graph.data.diagramType).toBe('sequence');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].id).toBe('Alice');
      expect(graph.nodes[1].id).toBe('Bob');
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('Alice');
      expect(graph.edges[0].targetId).toBe('Bob');
      expect(graph.edges[0].label).toBe('Hello Bob');
      expect(graph.edges[0].data.kind).toBe('message');
      expect(graph.edges[0].data.stroke).toBe('solid');
      expect(graph.edges[0].data.arrowType).toBe('filled');
    });

    it('parses explicit participant declarations', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    participant A
    participant B
    A->>B: test
      `);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].id).toBe('A');
      expect(graph.nodes[0].data.actorType).toBe('participant');
    });

    it('parses actor declarations', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    actor Alice
    actor Bob
    Alice->>Bob: Hi
      `);
      expect(graph.nodes[0].data.actorType).toBe('actor');
      expect(graph.nodes[1].data.actorType).toBe('actor');
    });

    it('parses participant aliases', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello
      `);
      expect(graph.nodes[0].id).toBe('A');
      expect(graph.nodes[0].data.alias).toBe('Alice');
      expect(graph.nodes[0].label).toBe('Alice');
      expect(graph.nodes[1].id).toBe('B');
      expect(graph.nodes[1].label).toBe('Bob');
    });

    it('auto-creates nodes from message references', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>Bob: Hello
    Bob->>Charlie: Hi
      `);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes.map((n) => n.id)).toEqual([
        'Alice',
        'Bob',
        'Charlie',
      ]);
    });

    it('parses all arrow types', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    A->B: solid open
    A-->B: dotted open
    A->>B: solid filled
    A-->>B: dotted filled
    A-xB: solid cross
    A--xB: dotted cross
    A-)B: solid async
    A--)B: dotted async
      `);
      const edges = graph.edges;
      expect(edges).toHaveLength(8);

      expect(edges[0].data).toMatchObject({ stroke: 'solid', arrowType: 'open' });
      expect(edges[1].data).toMatchObject({ stroke: 'dotted', arrowType: 'open' });
      expect(edges[2].data).toMatchObject({ stroke: 'solid', arrowType: 'filled' });
      expect(edges[3].data).toMatchObject({ stroke: 'dotted', arrowType: 'filled' });
      expect(edges[4].data).toMatchObject({ stroke: 'solid', arrowType: 'cross' });
      expect(edges[5].data).toMatchObject({ stroke: 'dotted', arrowType: 'cross' });
      expect(edges[6].data).toMatchObject({ stroke: 'solid', arrowType: 'async' });
      expect(edges[7].data).toMatchObject({ stroke: 'dotted', arrowType: 'async' });
    });

    it('parses bidirectional arrows', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    A<<->>B: solid bidi
    A<<-->>B: dotted bidi
      `);
      expect(graph.edges[0].data).toMatchObject({
        stroke: 'solid',
        arrowType: 'filled',
        bidirectional: true,
      });
      expect(graph.edges[1].data).toMatchObject({
        stroke: 'dotted',
        arrowType: 'filled',
        bidirectional: true,
      });
    });

    it('parses activate/deactivate as self-edges', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    participant Alice
    activate Alice
    Alice->>Bob: Hello
    deactivate Alice
      `);
      const selfEdges = graph.edges.filter((e) => e.sourceId === e.targetId);
      expect(selfEdges).toHaveLength(2);
      expect(selfEdges[0].data.kind).toBe('activation');
      expect(selfEdges[0].sourceId).toBe('Alice');
      expect(selfEdges[1].data.kind).toBe('deactivation');
    });

    it('parses activation shorthand on target (+/-)', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>+Bob: Hello
    Bob-->>-Alice: Reply
      `);
      // Should have 2 message edges + 2 activation self-edges
      const messages = graph.edges.filter((e) => e.data.kind === 'message');
      const activations = graph.edges.filter(
        (e) => e.data.kind === 'activation' || e.data.kind === 'deactivation',
      );
      expect(messages).toHaveLength(2);
      expect(activations).toHaveLength(2);
      expect(activations[0].data.kind).toBe('activation');
      expect(activations[0].sourceId).toBe('Bob');
      expect(activations[1].data.kind).toBe('deactivation');
      expect(activations[1].sourceId).toBe('Alice');
    });

    it('parses autonumber', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    autonumber
    Alice->>Bob: First
    Bob->>Alice: Second
      `);
      expect(graph.data.autonumber).toBe(true);
      expect(graph.edges[0].data.sequenceNumber).toBe(1);
      expect(graph.edges[1].data.sequenceNumber).toBe(2);
    });

    it('parses loop blocks', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>Bob: Hello
    loop Every minute
        Bob->>Alice: Ping
    end
      `);
      expect(graph.data.blocks).toHaveLength(1);
      expect(graph.data.blocks![0].type).toBe('loop');
      expect((graph.data.blocks![0] as any).label).toBe('Every minute');
      expect((graph.data.blocks![0] as any).edgeIds).toHaveLength(1);
    });

    it('parses alt/else blocks', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>Bob: Hello
    alt Is happy
        Bob->>Alice: Great!
    else Is sad
        Bob->>Alice: Oh no
    end
      `);
      expect(graph.data.blocks).toHaveLength(1);
      const block = graph.data.blocks![0] as any;
      expect(block.type).toBe('alt');
      expect(block.branches).toHaveLength(2);
      expect(block.branches[0].label).toBe('Is happy');
      expect(block.branches[1].label).toBe('Is sad');
    });

    it('parses par blocks', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    par Action 1
        Alice->>Bob: Hello
    and Action 2
        Alice->>Charlie: Hi
    end
      `);
      expect(graph.data.blocks).toHaveLength(1);
      const block = graph.data.blocks![0] as any;
      expect(block.type).toBe('par');
      expect(block.branches).toHaveLength(2);
    });

    it('parses create and destroy participants', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    create participant B
    A->>B: Hello
    destroy B
      `);
      const nodeB = graph.nodes.find((n) => n.id === 'B')!;
      expect(nodeB.data.created).toBe(true);
      expect(nodeB.data.destroyed).toBe(true);
    });

    it('ignores Note lines', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    Alice->>Bob: Hello
    Note right of Bob: Bob thinks
    Bob->>Alice: Hi
      `);
      expect(graph.edges).toHaveLength(2);
    });

    it('strips comments', () => {
      const graph = fromMermaidSequence(`
sequenceDiagram
    %% This is a comment
    Alice->>Bob: Hello
      `);
      expect(graph.edges).toHaveLength(1);
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidSequence('')).toThrow('Mermaid sequence: input is empty');
    });

    it('throws on non-string input', () => {
      expect(() => fromMermaidSequence(42 as any)).toThrow(
        'Mermaid sequence: expected a string',
      );
    });

    it('throws on wrong diagram type', () => {
      expect(() => fromMermaidSequence('graph TD\n  A-->B')).toThrow(
        'Mermaid sequence: expected "sequenceDiagram" header',
      );
    });
  });

  describe('toMermaidSequence()', () => {
    it('serializes basic sequence', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'Alice',
            parentId: null,
            initialNodeId: null,
            label: 'Alice',
            data: { actorType: 'participant' },
          },
          {
            type: 'node',
            id: 'Bob',
            parentId: null,
            initialNodeId: null,
            label: 'Bob',
            data: { actorType: 'participant' },
          },
        ],
        edges: [
          {
            type: 'edge',
            id: 'e0',
            sourceId: 'Alice',
            targetId: 'Bob',
            label: 'Hello',
            data: { kind: 'message', stroke: 'solid', arrowType: 'filled' },
          },
        ],
        data: { diagramType: 'sequence' },
      });
      expect(output).toContain('sequenceDiagram');
      expect(output).toContain('participant Alice');
      expect(output).toContain('participant Bob');
      expect(output).toContain('Alice->>Bob: Hello');
    });

    it('serializes actor type', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'Alice',
            parentId: null,
            initialNodeId: null,
            label: 'Alice',
            data: { actorType: 'actor' },
          },
        ],
        edges: [],
        data: { diagramType: 'sequence' },
      });
      expect(output).toContain('actor Alice');
    });

    it('serializes aliases', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'A',
            parentId: null,
            initialNodeId: null,
            label: 'Alice',
            data: { actorType: 'participant', alias: 'Alice' },
          },
        ],
        edges: [],
        data: { diagramType: 'sequence' },
      });
      expect(output).toContain('participant A as Alice');
    });

    it('serializes all arrow types', () => {
      const arrows: Array<{
        stroke: 'solid' | 'dotted';
        arrowType: 'filled' | 'open' | 'cross' | 'async';
        expected: string;
      }> = [
        { stroke: 'solid', arrowType: 'open', expected: '->' },
        { stroke: 'dotted', arrowType: 'open', expected: '-->' },
        { stroke: 'solid', arrowType: 'filled', expected: '->>' },
        { stroke: 'dotted', arrowType: 'filled', expected: '-->>' },
        { stroke: 'solid', arrowType: 'cross', expected: '-x' },
        { stroke: 'dotted', arrowType: 'cross', expected: '--x' },
        { stroke: 'solid', arrowType: 'async', expected: '-)' },
        { stroke: 'dotted', arrowType: 'async', expected: '--)' },
      ];
      for (const { stroke, arrowType, expected } of arrows) {
        const output = toMermaidSequence({
          id: '',
          type: 'directed',
          initialNodeId: null,
          nodes: [
            { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: { actorType: 'participant' } },
            { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'B', data: { actorType: 'participant' } },
          ],
          edges: [
            {
              type: 'edge',
              id: 'e0',
              sourceId: 'A',
              targetId: 'B',
              label: 'msg',
              data: { kind: 'message', stroke, arrowType },
            },
          ],
          data: { diagramType: 'sequence' },
        });
        expect(output).toContain(`A${expected}B: msg`);
      }
    });

    it('serializes activation/deactivation self-edges', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Alice', parentId: null, initialNodeId: null, label: 'Alice', data: { actorType: 'participant' } },
        ],
        edges: [
          {
            type: 'edge',
            id: 'e0',
            sourceId: 'Alice',
            targetId: 'Alice',
            label: '',
            data: { kind: 'activation' },
          },
          {
            type: 'edge',
            id: 'e1',
            sourceId: 'Alice',
            targetId: 'Alice',
            label: '',
            data: { kind: 'deactivation' },
          },
        ],
        data: { diagramType: 'sequence' },
      });
      expect(output).toContain('activate Alice');
      expect(output).toContain('deactivate Alice');
    });

    it('serializes autonumber', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [],
        edges: [],
        data: { diagramType: 'sequence', autonumber: true },
      });
      expect(output).toContain('autonumber');
    });

    it('serializes create participant', () => {
      const output = toMermaidSequence({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'B',
            parentId: null,
            initialNodeId: null,
            label: 'B',
            data: { actorType: 'participant', created: true },
          },
        ],
        edges: [],
        data: { diagramType: 'sequence' },
      });
      expect(output).toContain('create participant B');
    });
  });

  describe('round-trip', () => {
    it('round-trips a basic sequence diagram', () => {
      const input = `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice`;

      const graph = fromMermaidSequence(input);
      const output = toMermaidSequence(graph);
      const graph2 = fromMermaidSequence(output);

      expect(graph2.nodes).toHaveLength(graph.nodes.length);
      expect(graph2.edges).toHaveLength(graph.edges.length);
      expect(graph2.nodes.map((n) => n.id)).toEqual(
        graph.nodes.map((n) => n.id),
      );
      for (let i = 0; i < graph.edges.length; i++) {
        expect(graph2.edges[i].sourceId).toBe(graph.edges[i].sourceId);
        expect(graph2.edges[i].targetId).toBe(graph.edges[i].targetId);
        expect(graph2.edges[i].label).toBe(graph.edges[i].label);
        expect(graph2.edges[i].data.kind).toBe(graph.edges[i].data.kind);
        expect(graph2.edges[i].data.stroke).toBe(graph.edges[i].data.stroke);
        expect(graph2.edges[i].data.arrowType).toBe(
          graph.edges[i].data.arrowType,
        );
      }
    });

    it('round-trips activation/deactivation', () => {
      const input = `sequenceDiagram
    participant Alice
    participant Bob
    activate Alice
    Alice->>Bob: Hello
    deactivate Alice`;

      const graph = fromMermaidSequence(input);
      const output = toMermaidSequence(graph);
      const graph2 = fromMermaidSequence(output);

      const selfEdges1 = graph.edges.filter((e) => e.sourceId === e.targetId);
      const selfEdges2 = graph2.edges.filter((e) => e.sourceId === e.targetId);
      expect(selfEdges2).toHaveLength(selfEdges1.length);
      expect(selfEdges2[0].data.kind).toBe(selfEdges1[0].data.kind);
      expect(selfEdges2[1].data.kind).toBe(selfEdges1[1].data.kind);
    });
  });
});
