import { describe, it, expect } from 'vitest';
import {
  fromMermaidState,
  toMermaidState,
} from '../../../src/formats/mermaid/state';
import { getFormatSupportEntry } from '../../../src/formats/support';

describe('Mermaid State Diagram Converter', () => {
  describe('fromMermaidState()', () => {
    it('parses basic state diagram with transitions', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle --> Active
    Active --> Idle
      `);
      expect(graph.mode).toBe('directed');
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

    it('parses state "description" as stateId composite syntax', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state "IDEA" as Idea {
        Drafting --> Refining
    }
      `);
      expect(graph.nodes.find((n) => n.id === 'Idea')!.data.description).toBe(
        'IDEA',
      );
      expect(graph.nodes.find((n) => n.id === 'Drafting')!.parentId).toBe(
        'Idea',
      );
      expect(graph.nodes.find((n) => n.id === 'Refining')!.parentId).toBe(
        'Idea',
      );
    });

    it('reparents states first referenced outside their composite state', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idea --> SpecDrafting : generate spec
    state "SPEC" as Spec {
        SpecDrafting --> SpecReview
    }
      `);
      expect(graph.nodes.find((n) => n.id === 'SpecDrafting')!.parentId).toBe(
        'Spec',
      );
      expect(graph.nodes.find((n) => n.id === 'SpecReview')!.parentId).toBe(
        'Spec',
      );
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
        format: 'inline',
      });
    });

    it('parses multiline notes without creating note text states', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle --> Active
    note right of Active
        First line
        Second line
    end note
      `);
      const active = graph.nodes.find((n) => n.id === 'Active')!;
      expect(active.data.notes).toEqual([
        { position: 'right', text: 'First line\nSecond line', format: 'block' },
      ]);
      expect(graph.nodes.some((n) => n.id === 'note')).toBe(false);
      expect(graph.nodes.some((n) => n.id === 'end')).toBe(false);
      expect(graph.nodes.some((n) => n.id === 'First')).toBe(false);
    });

    it('parses concurrent states with -- separator', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    [*] --> Active
    state Active {
        [*] --> NumLockOff
        NumLockOff --> NumLockOn : EvNumLockPressed
        NumLockOn --> NumLockOff : EvNumLockPressed
        --
        [*] --> CapsLockOff
        CapsLockOff --> CapsLockOn : EvCapsLockPressed
        CapsLockOn --> CapsLockOff : EvCapsLockPressed
        --
        [*] --> ScrollLockOff
        ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
        ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
    }
      `);

      // Active should be marked as parallel
      const active = graph.nodes.find((n) => n.id === 'Active')!;
      expect(active.data.stateType).toBe('parallel');

      // Should have 3 region child nodes
      const regions = graph.nodes.filter(
        (n) => n.parentId === 'Active' && n.id.includes('_region_'),
      );
      expect(regions).toHaveLength(3);

      // NumLock states should be in region_0
      expect(graph.nodes.find((n) => n.id === 'NumLockOff')!.parentId).toBe(
        'Active_region_0',
      );
      expect(graph.nodes.find((n) => n.id === 'NumLockOn')!.parentId).toBe(
        'Active_region_0',
      );

      // CapsLock states should be in region_1
      expect(graph.nodes.find((n) => n.id === 'CapsLockOff')!.parentId).toBe(
        'Active_region_1',
      );
      expect(graph.nodes.find((n) => n.id === 'CapsLockOn')!.parentId).toBe(
        'Active_region_1',
      );

      // ScrollLock states should be in region_2
      expect(graph.nodes.find((n) => n.id === 'ScrollLockOff')!.parentId).toBe(
        'Active_region_2',
      );
      expect(graph.nodes.find((n) => n.id === 'ScrollLockOn')!.parentId).toBe(
        'Active_region_2',
      );
    });

    it('parses concurrent states with [*] pseudo-nodes in each region', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Active {
        [*] --> A
        --
        [*] --> B
    }
      `);

      const startNodes = graph.nodes.filter((n) => n.data.isStart);
      expect(startNodes).toHaveLength(2);
      // Each start node should be in its respective region
      expect(startNodes[0].parentId).toBe('Active_region_0');
      expect(startNodes[1].parentId).toBe('Active_region_1');
    });

    it('parses top-level direction', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    direction LR
    Idle --> Active
      `);
      expect(graph.direction).toBe('right');
    });

    it('parses direction inside composite state', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Parent {
        direction BT
        Child1
        Child2
    }
      `);
      const parent = graph.nodes.find((n) => n.id === 'Parent')!;
      expect(parent.data.direction).toBe('up');
    });

    it('parses classDef definitions', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle
    classDef badEvent fill:#f00,stroke:#333
      `);
      expect(graph.data.classDefs).toEqual({
        badEvent: { fill: '#f00', stroke: '#333' },
      });
    });

    it('parses class statement', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle
    Active
    classDef highlight fill:#ff0
    class Idle,Active highlight
      `);
      expect(graph.nodes.find((n) => n.id === 'Idle')!.data.classes).toEqual(['highlight']);
      expect(graph.nodes.find((n) => n.id === 'Active')!.data.classes).toEqual(['highlight']);
    });

    it('applies classDef styles to node.style and node.color', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle
    classDef red fill:#f00,stroke:#333
    class Idle red
      `);
      const node = graph.nodes.find((n) => n.id === 'Idle')! as any;
      expect(node.color).toBe('#f00');
      expect(node.style).toEqual({ fill: '#f00', stroke: '#333' });
    });

    it('parses ::: inline class on bare state', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle:::highlight
    classDef highlight fill:#ff0
      `);
      expect(graph.nodes.find((n) => n.id === 'Idle')!.data.classes).toEqual(['highlight']);
    });

    it('parses ::: inline class on transition source', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    Idle:::red --> Active
      `);
      expect(graph.nodes.find((n) => n.id === 'Idle')!.data.classes).toEqual(['red']);
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
        mode: 'directed',
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
        mode: 'directed',
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
        mode: 'directed',
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
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 's1', parentId: null, initialNodeId: null, label: 's1', data: { description: 'Loading data' } },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state "Loading data" as s1');
    });

    it('serializes composite states with descriptions as one declaration', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'Idea',
            parentId: null,
            initialNodeId: null,
            label: 'Idea',
            data: { description: 'IDEA' },
          },
          {
            type: 'node',
            id: 'Drafting',
            parentId: 'Idea',
            initialNodeId: null,
            label: 'Drafting',
            data: {},
          },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state "IDEA" as Idea {');
      expect(output).not.toContain('state Idea {');
    });

    it('serializes block notes', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          {
            type: 'node',
            id: 'Active',
            parentId: null,
            initialNodeId: null,
            label: 'Active',
            data: {
              notes: [
                {
                  position: 'right',
                  text: 'First line\nSecond line',
                  format: 'block',
                },
              ],
            },
          },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('note right of Active\n');
      expect(output).toContain('First line\n');
      expect(output).toContain('Second line\n');
      expect(output).toContain('end note');
    });

    it('serializes parallel states with -- separator', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Active', parentId: null, initialNodeId: null, label: 'Active', data: { stateType: 'parallel' as const } },
          { type: 'node', id: 'Active_region_0', parentId: 'Active', initialNodeId: null, label: 'Active_region_0', data: {} },
          { type: 'node', id: 'Active_region_1', parentId: 'Active', initialNodeId: null, label: 'Active_region_1', data: {} },
          { type: 'node', id: 'A', parentId: 'Active_region_0', initialNodeId: null, label: 'A', data: {} },
          { type: 'node', id: 'B', parentId: 'Active_region_1', initialNodeId: null, label: 'B', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state Active {');
      expect(output).toContain('--');
      // Should not emit region node names
      expect(output).not.toContain('Active_region_0');
      expect(output).not.toContain('Active_region_1');
    });

    it('serializes direction', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        direction: 'right',
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('direction LR');
    });

    it('serializes classDefs and class assignments', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Idle', parentId: null, initialNodeId: null, label: 'Idle', data: { classes: ['red'] } },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram', classDefs: { red: { fill: '#f00', stroke: '#333' } } },
      });
      expect(output).toContain('classDef red fill:#f00,stroke:#333');
      expect(output).toContain('class Idle red');
    });
  });

  describe('emit completeness', () => {
    it('emits isolated plain states as bare lines', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'B', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      const lines = output.split('\n').map((l) => l.trim());
      expect(lines).toContain('A');
      expect(lines).toContain('B');
    });

    it('round-trips isolated plain states', () => {
      const graph = fromMermaidState(
        toMermaidState({
          id: '',
          mode: 'directed',
          initialNodeId: null,
          nodes: [
            { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
            { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'B', data: {} },
          ],
          edges: [],
          data: { diagramType: 'stateDiagram' },
        }),
      );
      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    });

    it('emits plain children inside composite states', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'Parent', parentId: null, initialNodeId: null, label: 'Parent', data: {} },
          { type: 'node', id: 'Child', parentId: 'Parent', initialNodeId: null, label: 'Child', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      const graph = fromMermaidState(output);
      expect(graph.nodes.find((n) => n.id === 'Child')?.parentId).toBe('Parent');
    });

    it('emits node label via the description form', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 's1', parentId: null, initialNodeId: null, label: 'My Label', data: {} },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state "My Label" as s1');
    });

    it('keeps description authoritative over label on emit', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 's1', parentId: null, initialNodeId: null, label: 'L', data: { description: 'D' } },
        ],
        edges: [],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('state "D" as s1');
      expect(output).not.toContain('"L"');
    });

    it('parses state "description" as stateId into label too', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state "This is a description" as s1
      `);
      expect(graph.nodes[0].label).toBe('This is a description');
      expect(graph.nodes[0].data.description).toBe('This is a description');
    });

    it('round-trips node labels', () => {
      const graph = fromMermaidState(
        toMermaidState({
          id: '',
          mode: 'directed',
          initialNodeId: null,
          nodes: [
            { type: 'node', id: 's1', parentId: null, initialNodeId: null, label: 'My Label', data: {} },
          ],
          edges: [],
          data: { diagramType: 'stateDiagram' },
        }),
      );
      expect(graph.nodes.find((n) => n.id === 's1')?.label).toBe('My Label');
    });

    it('emits [*] --> initialNodeId when no start pseudo-node exists', () => {
      const output = toMermaidState({
        id: '',
        mode: 'directed',
        initialNodeId: 'A',
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'B', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: '', data: {} },
        ],
        data: { diagramType: 'stateDiagram' },
      });
      expect(output).toContain('[*] --> A');
    });

    it('does not double-emit [*] --> when a start pseudo-node exists', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    [*] --> Idle
      `);
      const output = toMermaidState(graph);
      expect(output.match(/\[\*\] -->/g)).toHaveLength(1);
    });

    it('parses top-level [*] --> X into graph.initialNodeId', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    [*] --> Idle
    Idle --> Done
      `);
      expect(graph.initialNodeId).toBe('Idle');
    });

    it('does not set graph.initialNodeId for [*] inside a composite state', () => {
      const graph = fromMermaidState(`
stateDiagram-v2
    state Active {
        [*] --> A
    }
      `);
      expect(graph.initialNodeId).toBeNull();
    });

    it('documents emit completeness accurately in the support matrix', () => {
      const state = getFormatSupportEntry('mermaid/state');
      const notes = state?.notes.join('\n') ?? '';
      // Isolated states and labels now emit; a distinct label is still lost
      // when a description is also present, so round-trip stays partial.
      expect(state?.features.roundTrip).toBe('partial');
      expect(notes).toContain('Isolated plain states emit');
      expect(notes).toContain('initialNodeId');
      expect(notes).not.toContain('dropped on emit');
    });

    it('round-trips plain nodes, labels, and initialNodeId together', () => {
      const original = {
        id: '',
        mode: 'directed' as const,
        initialNodeId: 'A',
        nodes: [
          { type: 'node' as const, id: 'A', parentId: null, initialNodeId: null, label: 'A', data: {} },
          { type: 'node' as const, id: 'B', parentId: null, initialNodeId: null, label: 'State B', data: {} },
          { type: 'node' as const, id: 'C', parentId: null, initialNodeId: null, label: 'C', data: {} },
        ],
        edges: [
          { type: 'edge' as const, id: 'e0', sourceId: 'A', targetId: 'B', label: 'go', data: {} },
        ],
        data: { diagramType: 'stateDiagram' as const },
      };
      const graph = fromMermaidState(toMermaidState(original));
      expect(graph.initialNodeId).toBe('A');
      const real = graph.nodes.filter((n) => !n.data.isStart && !n.data.isEnd);
      expect(real.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
      expect(real.find((n) => n.id === 'B')?.label).toBe('State B');
      expect(graph.edges.some((e) => e.sourceId === 'A' && e.targetId === 'B' && e.label === 'go')).toBe(true);
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

    it('round-trips concurrent state diagram', () => {
      const input = `stateDiagram-v2
    state Active {
        [*] --> NumLockOff
        NumLockOff --> NumLockOn : EvNumLockPressed
        NumLockOn --> NumLockOff : EvNumLockPressed
        --
        [*] --> CapsLockOff
        CapsLockOff --> CapsLockOn : EvCapsLockPressed
        CapsLockOn --> CapsLockOff : EvCapsLockPressed
    }`;

      const graph = fromMermaidState(input);
      const output = toMermaidState(graph);
      const graph2 = fromMermaidState(output);

      // Same number of regions
      const regions1 = graph.nodes.filter((n) => n.id.includes('_region_'));
      const regions2 = graph2.nodes.filter((n) => n.id.includes('_region_'));
      expect(regions2).toHaveLength(regions1.length);

      // Active is still parallel
      expect(graph2.nodes.find((n) => n.id === 'Active')!.data.stateType).toBe('parallel');

      // Same real nodes
      const real1 = graph.nodes.filter(
        (n) => !n.data.isStart && !n.data.isEnd && !n.id.includes('_region_'),
      );
      const real2 = graph2.nodes.filter(
        (n) => !n.data.isStart && !n.data.isEnd && !n.id.includes('_region_'),
      );
      expect(real2.map((n) => n.id).sort()).toEqual(real1.map((n) => n.id).sort());
    });
  });

  describe('_region_ substring in user state ids', () => {
    it('round-trips an isolated plain state whose id contains _region_', () => {
      const input = `stateDiagram-v2
    foo_region_bar`;
      const graph = fromMermaidState(input);
      expect(graph.nodes.map((n) => n.id)).toContain('foo_region_bar');

      const output = toMermaidState(graph);
      const reparsed = fromMermaidState(output);
      expect(reparsed.nodes.map((n) => n.id)).toContain('foo_region_bar');
    });

    it('round-trips a _region_ id as a child of a non-parallel composite', () => {
      const input = `stateDiagram-v2
    state box {
        foo_region_bar
    }`;
      const graph = fromMermaidState(input);
      const node = graph.nodes.find((n) => n.id === 'foo_region_bar');
      expect(node?.parentId).toBe('box');

      const output = toMermaidState(graph);
      const reparsed = fromMermaidState(output);
      const reparsedNode = reparsed.nodes.find((n) => n.id === 'foo_region_bar');
      expect(reparsedNode).toBeDefined();
      expect(reparsedNode?.parentId).toBe('box');
    });

    it('does not mis-pop the parent stack when closing a composite whose id contains _region_', () => {
      const graph = fromMermaidState(`stateDiagram-v2
    state outer {
        state foo_region_bar {
            inner
        }
        sibling
    }`);
      expect(graph.nodes.find((n) => n.id === 'inner')?.parentId).toBe(
        'foo_region_bar',
      );
      expect(graph.nodes.find((n) => n.id === 'sibling')?.parentId).toBe(
        'outer',
      );
    });

    it('still hides real parallel region nodes on emit', () => {
      const graph = fromMermaidState(`stateDiagram-v2
    state Active {
        A
        --
        B
    }`);
      const output = toMermaidState(graph);
      expect(output).not.toContain('Active_region_0');
      expect(output).not.toContain('Active_region_1');
      expect(output).toContain('--');
    });
  });
});
