import { describe, it, expect } from 'vitest';
import {
  fromMermaidState,
  toMermaidState,
} from '../../../src/formats/mermaid/state';

describe('Mermaid State Diagram Converter', () => {
  describe('fromMermaidState()', () => {
    it('parses basic state diagram with transitions', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle --> Active
    Active --> Idle
      `);
      expect(graph.type).toBe('directed');
      expect(graph.data.diagramType).toBe('stateDiagram');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].label).toBe('Idle');
      expect(graph.nodes[1].label).toBe('Active');
      expect(graph.edges).toHaveLength(2);
    });

    it('stateId IS the label', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    MyState
      `);
      expect(graph.nodes[0].id).toBe('MyState');
      expect(graph.nodes[0].label).toBe('MyState');
    });

    it('parses state with description into data', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Loading : Fetching data from server
      `);
      expect(graph.nodes[0].id).toBe('Loading');
      expect(graph.nodes[0].label).toBe('Loading');
      expect(graph.nodes[0].data.description).toBe('Fetching data from server');
    });

    it('parses state "description" as stateId syntax', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state "This is a description" as s1
      `);
      expect(graph.nodes[0].id).toBe('s1');
      expect(graph.nodes[0].data.description).toBe('This is a description');
    });

    it('parses [*] start pseudo-node', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    [*] --> Idle
      `);
      const startNode = graph.nodes.find((n) => n.data.isStart);
      expect(startNode).toBeDefined();
      expect(startNode!.label).toBe('[*]');
      expect((startNode as any).shape).toBe('start');
      expect(graph.edges[0].targetId).toBe('Idle');
    });

    it('parses [*] end pseudo-node', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Done --> [*]
      `);
      const endNode = graph.nodes.find((n) => n.data.isEnd);
      expect(endNode).toBeDefined();
      expect(endNode!.label).toBe('[*]');
      expect((endNode as any).shape).toBe('end');
    });

    it('parses transition labels', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle --> Active : click
    Active --> Idle : timeout
      `);
      expect(graph.edges[0].label).toBe('click');
      expect(graph.edges[1].label).toBe('timeout');
    });

    it('parses composite states with parentId', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Parent {
        Child1
        Child2
    }
      `);
      expect(graph.nodes.find((n) => n.id === 'Parent')!.parentId).toBeNull();
      expect(graph.nodes.find((n) => n.id === 'Child1')!.parentId).toBe('Parent');
      expect(graph.nodes.find((n) => n.id === 'Child2')!.parentId).toBe('Parent');
    });

    it('parses nested composite states', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Outer {
        state Inner {
            Deep
        }
    }
      `);
      expect(graph.nodes.find((n) => n.id === 'Inner')!.parentId).toBe('Outer');
      expect(graph.nodes.find((n) => n.id === 'Deep')!.parentId).toBe('Inner');
    });

    it('parses <<choice>> stereotype', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state check <<choice>>
    Idle --> check
      `);
      const checkNode = graph.nodes.find((n) => n.id === 'check')!;
      expect(checkNode.data.stateType).toBe('choice');
      expect((checkNode as any).shape).toBe('choice');
    });

    it('parses <<fork>> and <<join>> stereotypes', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state fork_state <<fork>>
    state join_state <<join>>
      `);
      expect(graph.nodes.find((n) => n.id === 'fork_state')!.data.stateType).toBe('fork');
      expect(graph.nodes.find((n) => n.id === 'join_state')!.data.stateType).toBe('join');
    });

    it('parses notes', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle
    note right of Idle : This is idle
      `);
      const node = graph.nodes.find((n) => n.id === 'Idle')!;
      expect(node.data.notes).toHaveLength(1);
      expect(node.data.notes![0]).toEqual({
        position: 'right',
        text: 'This is idle',
      });
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidState('')).toThrow('input is empty');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidState('graph TD\n  A')).toThrow(
        'expected "stateDiagram"',
      );
    });
  });

  describe('toMermaidState()', () => {
    it('serializes basic state diagram', () => {
      const output = toMermaidState({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Idle', parentId: null, initialNodeId: null, label: 'Idle', data: {} },
          { type: 'node', id: 'Active', parentId: null, initialNodeId: null, label: 'Active', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'Idle', targetId: 'Active', label: 'click', data: {} },
        ],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('stateDiagram-v2');
      expect(output).toContain('Idle --> Active : click');
    });

    it('serializes [*] start/end', () => {
      const output = toMermaidState({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'start_0', parentId: null, initialNodeId: null, label: '[*]', data: { isStart: true } },
          { type: 'node', id: 'Idle', parentId: null, initialNodeId: null, label: 'Idle', data: {} },
          { type: 'node', id: 'end_0', parentId: null, initialNodeId: null, label: '[*]', data: { isEnd: true } },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'start_0', targetId: 'Idle', label: '', data: {} },
          { type: 'edge', id: 'e1', sourceId: 'Idle', targetId: 'end_0', label: '', data: {} },
        ],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('[*] --> Idle');
      expect(output).toContain('Idle --> [*]');
    });

    it('serializes composite states', () => {
      const output = toMermaidState({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Parent', parentId: null, initialNodeId: null, label: 'Parent', data: {} },
          { type: 'node', id: 'Child', parentId: 'Parent', initialNodeId: null, label: 'Child', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state Parent {');
      expect(output).toContain('}');
    });

    it('serializes descriptions', () => {
      const output = toMermaidState({
        id: '',
        type: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 's1', parentId: null, initialNodeId: null, label: 's1', data: { description: 'Loading data' } },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state "Loading data" as s1');
    });
  });

  describe('round-trip', () => {
    it('round-trips basic state diagram', () => {
      const input = `stateDiagram-v2
    [*] --> Idle
    Idle --> Active : click
    Active --> Idle : timeout
    Active --> [*]`;

      const graph = fromMermaidState(input);
      const output = toMermaidState(graph);
      const graph2 = fromMermaidState(output);

      expect(graph2.edges).toHaveLength(graph.edges.length);
      // Check non-pseudo nodes
      const real1 = graph.nodes.filter((n) => !n.data.isStart && !n.data.isEnd);
      const real2 = graph2.nodes.filter((n) => !n.data.isStart && !n.data.isEnd);
      expect(real2.map((n) => n.id).sort()).toEqual(real1.map((n) => n.id).sort());
    });
  });
});
