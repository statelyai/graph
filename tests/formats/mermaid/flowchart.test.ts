import { describe, it, expect } from 'vitest';
import {
  fromMermaidFlowchart,
  toMermaidFlowchart,
} from '../../../src/formats/mermaid/flowchart';

describe('Mermaid Flowchart Converter', () => {
  describe('fromMermaidFlowchart()', () => {
    it('parses basic flowchart with nodes and edges', () => {
      const graph = fromMermaidFlowchart(`
graph TD
    A[Start] --> B[End]
      `);
      expect(graph.mode).toBe('directed');
      expect(graph.direction).toBe('down');
      expect(graph.data.diagramType).toBe('flowchart');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].id).toBe('A');
      expect(graph.nodes[0].label).toBe('Start');
      expect(graph.nodes[1].id).toBe('B');
      expect(graph.nodes[1].label).toBe('End');
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('A');
      expect(graph.edges[0].targetId).toBe('B');
    });

    it('parses all directions', () => {
      expect(fromMermaidFlowchart('graph TD\n    A').direction).toBe('down');
      expect(fromMermaidFlowchart('graph TB\n    A').direction).toBe('down');
      expect(fromMermaidFlowchart('graph BT\n    A').direction).toBe('up');
      expect(fromMermaidFlowchart('graph LR\n    A').direction).toBe('right');
      expect(fromMermaidFlowchart('graph RL\n    A').direction).toBe('left');
      expect(fromMermaidFlowchart('flowchart LR\n    A').direction).toBe('right');
    });

    it('parses node shapes', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[rect]
    B(rounded)
    C((circle))
    D{diamond}
    E>asymmetric]
    F{{hexagon}}
    G[[subroutine]]
    H[(cylinder)]
    I([stadium])
    J(((double-circle)))
      `);
      const shapes = graph.nodes.map((n) => [n.id, (n as any).shape ?? 'rectangle']);
      expect(shapes).toEqual([
        ['A', 'rectangle'],
        ['B', 'rounded'],
        ['C', 'circle'],
        ['D', 'diamond'],
        ['E', 'asymmetric'],
        ['F', 'hexagon'],
        ['G', 'subroutine'],
        ['H', 'cylinder'],
        ['I', 'stadium'],
        ['J', 'double-circle'],
      ]);
    });

    it('parses parallelogram and trapezoid shapes', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[/parallelogram/]
    B[\\parallelogram-alt\\]
    C[/trapezoid\\]
    D[\\trapezoid-alt/]
      `);
      expect((graph.nodes[0] as any).shape).toBe('parallelogram');
      expect((graph.nodes[1] as any).shape).toBe('parallelogram-alt');
      expect((graph.nodes[2] as any).shape).toBe('trapezoid');
      expect((graph.nodes[3] as any).shape).toBe('trapezoid-alt');
    });

    it('parses edge types', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A --> B
    C --- D
    E -.-> F
    G ==> H
      `);
      expect(graph.edges[0].data.stroke).toBe('normal');
      expect(graph.edges[0].data.arrowType).toBe('arrow');
      expect(graph.edges[1].data.arrowType).toBe('none');
      expect(graph.edges[2].data.stroke).toBe('dotted');
      expect(graph.edges[3].data.stroke).toBe('thick');
    });

    it('parses edge labels with pipe syntax', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A -->|yes| B
    A -->|no| C
      `);
      expect(graph.edges[0].label).toBe('yes');
      expect(graph.edges[1].label).toBe('no');
    });

    it('parses bidirectional edges', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A <--> B
      `);
      expect(graph.edges[0].data.bidirectional).toBe(true);
    });

    it('parses circle and cross end markers', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A --o B
    C --x D
      `);
      expect(graph.edges[0].data.endMarker).toBe('circle');
      expect(graph.edges[1].data.endMarker).toBe('cross');
    });

    it('parses subgraphs and sets parentId', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph sub1[My Subgraph]
        A[Node A]
        B[Node B]
    end
    C[Outside]
      `);
      const sub = graph.nodes.find((n) => n.id === 'sub1')!;
      expect(sub.label).toBe('My Subgraph');
      expect(sub.parentId).toBeNull();

      const nodeA = graph.nodes.find((n) => n.id === 'A')!;
      expect(nodeA.parentId).toBe('sub1');
      const nodeB = graph.nodes.find((n) => n.id === 'B')!;
      expect(nodeB.parentId).toBe('sub1');
      const nodeC = graph.nodes.find((n) => n.id === 'C')!;
      expect(nodeC.parentId).toBeNull();
    });

    it('parses nested subgraphs', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph outer[Outer]
        subgraph inner[Inner]
            A[Deep]
        end
    end
      `);
      const inner = graph.nodes.find((n) => n.id === 'inner')!;
      expect(inner.parentId).toBe('outer');
      const nodeA = graph.nodes.find((n) => n.id === 'A')!;
      expect(nodeA.parentId).toBe('inner');
    });

    it('parses classDef and class assignments', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[Node]
    classDef red fill:#f00,stroke:#333
    class A red
      `);
      expect(graph.data.classDefs).toHaveProperty('red');
      expect(graph.data.classDefs!.red.fill).toBe('#f00');
      const nodeA = graph.nodes.find((n) => n.id === 'A')!;
      expect(nodeA.data.classes).toEqual(['red']);
    });

    it('parses style directives', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[Node]
    style A fill:#f9f,stroke:#333
      `);
      const nodeA = graph.nodes.find((n) => n.id === 'A')!;
      expect((nodeA as any).color).toBe('#f9f');
      expect((nodeA as any).style).toMatchObject({ fill: '#f9f', stroke: '#333' });
    });

    it('parses click directives', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[Node]
    click A "https://example.com" "My tooltip"
      `);
      const nodeA = graph.nodes.find((n) => n.id === 'A')!;
      expect(nodeA.data.link).toBe('https://example.com');
      expect(nodeA.data.tooltip).toBe('My tooltip');
    });

    it('auto-creates nodes from edges', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A --> B
      `);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].id).toBe('A');
      expect(graph.nodes[1].id).toBe('B');
    });

    it('strips comments', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    %% This is a comment
    A --> B
      `);
      expect(graph.nodes).toHaveLength(2);
    });

    it('parses edge chains: A --> B --> C', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A --> B --> C
      `);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0].sourceId).toBe('A');
      expect(graph.edges[0].targetId).toBe('B');
      expect(graph.edges[1].sourceId).toBe('B');
      expect(graph.edges[1].targetId).toBe('C');
    });

    it('throws on empty input', () => {
      expect(() => fromMermaidFlowchart('')).toThrow('input is empty');
    });

    it('throws on non-string input', () => {
      expect(() => fromMermaidFlowchart(null as any)).toThrow('expected a string');
    });

    it('parses subgraph direction', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    subgraph sub1[My Sub]
        direction LR
        A --> B
    end
      `);
      const sub = graph.nodes.find((n) => n.id === 'sub1')!;
      expect(sub.data.direction).toBe('right');
    });

    it('parses ::: inline class on bare node', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A:::highlight
      `);
      expect(graph.nodes[0].data.classes).toEqual(['highlight']);
    });

    it('parses ::: inline class on node with shape', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A[Label]:::myClass
      `);
      expect(graph.nodes[0].data.classes).toEqual(['myClass']);
      expect(graph.nodes[0].label).toBe('Label');
    });

    it('parses ::: inline class on edge source', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A:::cls --> B
      `);
      expect(graph.nodes.find((n) => n.id === 'A')!.data.classes).toEqual(['cls']);
    });

    it('parses invisible links ~~~', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A ~~~ B
      `);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].data.stroke).toBe('invisible');
      expect(graph.edges[0].data.arrowType).toBe('none');
    });

    it('parses @{ shape } expanded syntax', () => {
      const graph = fromMermaidFlowchart(`
flowchart TD
    A@{ shape: hexagon, label: "My Label" }
      `);
      expect(graph.nodes[0].id).toBe('A');
      expect((graph.nodes[0] as any).shape).toBe('hexagon');
      expect(graph.nodes[0].label).toBe('My Label');
    });

    it('throws on wrong header', () => {
      expect(() => fromMermaidFlowchart('sequenceDiagram\n  A->>B: hi')).toThrow(
        'expected "graph <direction>" or "flowchart <direction>" header',
      );
    });
  });

  describe('toMermaidFlowchart()', () => {
    it('serializes basic flowchart', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        direction: 'right',
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: 'Start', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: 'End', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: '', data: { stroke: 'normal', arrowType: 'arrow' } },
        ],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('flowchart LR');
      expect(output).toContain('A[Start]');
      expect(output).toContain('B[End]');
      expect(output).toContain('A --> B');
    });

    it('serializes node shapes', () => {
      const shapes: Record<string, string> = {
        rectangle: '[label]',
        rounded: '(label)',
        circle: '((label))',
        diamond: '{label}',
        hexagon: '{{label}}',
        subroutine: '[[label]]',
        cylinder: '[(label)]',
        stadium: '([label])',
        'double-circle': '(((label)))',
      };
      for (const [shape, expected] of Object.entries(shapes)) {
        const output = toMermaidFlowchart({
          id: '',
          mode: 'directed',
          initialNodeId: null,
          nodes: [
            { type: 'node', id: 'X', parentId: null, initialNodeId: null, label: 'label', data: {}, shape } as any,
          ],
          edges: [],
          data: { diagramType: 'flowchart' },
        });
        expect(output).toContain(`X${expected}`);
      }
    });

    it('serializes edge labels', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: '', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: '', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: 'yes', data: { stroke: 'normal', arrowType: 'arrow' } },
        ],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('A -->|yes| B');
    });

    it('serializes subgraphs', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'sub1', parentId: null, initialNodeId: null, label: 'My Sub', data: {} },
          { type: 'node', id: 'A', parentId: 'sub1', initialNodeId: null, label: 'Inside', data: {} },
        ],
        edges: [],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('subgraph sub1[My Sub]');
      expect(output).toContain('A[Inside]');
      expect(output).toContain('end');
    });

    it('serializes subgraph direction', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'sub1', parentId: null, initialNodeId: null, label: 'Sub', data: { direction: 'right' as const } },
          { type: 'node', id: 'A', parentId: 'sub1', initialNodeId: null, label: 'Inside', data: {} },
        ],
        edges: [],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('direction LR');
    });

    it('serializes invisible links', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: '', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: '', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: '', data: { stroke: 'invisible' as const, arrowType: 'none' as const } },
        ],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('A ~~~ B');
    });

    it('serializes startMarker', () => {
      const output = toMermaidFlowchart({
        id: '',
        mode: 'directed',
        initialNodeId: null,
        nodes: [
          { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: '', data: {} },
          { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: '', data: {} },
        ],
        edges: [
          { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: '', data: { stroke: 'normal' as const, arrowType: 'arrow' as const, startMarker: 'circle' as const } },
        ],
        data: { diagramType: 'flowchart' },
      });
      expect(output).toContain('o-->');
    });

    it('serializes different edge types', () => {
      const tests: Array<{ data: any; expected: string }> = [
        { data: { stroke: 'normal', arrowType: 'arrow' }, expected: '-->' },
        { data: { stroke: 'normal', arrowType: 'none' }, expected: '---' },
        { data: { stroke: 'dotted', arrowType: 'arrow' }, expected: '-.-> ' },
        { data: { stroke: 'thick', arrowType: 'arrow' }, expected: '==>' },
        { data: { stroke: 'normal', arrowType: 'arrow', bidirectional: true }, expected: '<-->' },
        { data: { stroke: 'normal', arrowType: 'arrow', endMarker: 'circle' }, expected: '--o' },
        { data: { stroke: 'normal', arrowType: 'arrow', endMarker: 'cross' }, expected: '--x' },
      ];
      for (const { data, expected } of tests) {
        const output = toMermaidFlowchart({
          id: '',
          mode: 'directed',
          initialNodeId: null,
          nodes: [
            { type: 'node', id: 'A', parentId: null, initialNodeId: null, label: '', data: {} },
            { type: 'node', id: 'B', parentId: null, initialNodeId: null, label: '', data: {} },
          ],
          edges: [
            { type: 'edge', id: 'e0', sourceId: 'A', targetId: 'B', label: '', data },
          ],
          data: { diagramType: 'flowchart' },
        });
        expect(output).toContain(expected);
      }
    });
  });

  describe('round-trip', () => {
    it('round-trips a simple flowchart', () => {
      const input = `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`;

      const graph = fromMermaidFlowchart(input);
      const output = toMermaidFlowchart(graph);
      const graph2 = fromMermaidFlowchart(output);

      expect(graph2.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
      expect(graph2.edges).toHaveLength(graph.edges.length);
      for (let i = 0; i < graph.edges.length; i++) {
        expect(graph2.edges[i].sourceId).toBe(graph.edges[i].sourceId);
        expect(graph2.edges[i].targetId).toBe(graph.edges[i].targetId);
      }
    });

    it('round-trips subgraph direction', () => {
      const input = `flowchart TD
    subgraph sub1[Group]
        direction LR
        A[Inside]
    end`;

      const graph = fromMermaidFlowchart(input);
      const sub = graph.nodes.find((n) => n.id === 'sub1')!;
      expect(sub.data.direction).toBe('right');

      const output = toMermaidFlowchart(graph);
      expect(output).toContain('direction LR');

      const graph2 = fromMermaidFlowchart(output);
      const sub2 = graph2.nodes.find((n) => n.id === 'sub1')!;
      expect(sub2.data.direction).toBe('right');
    });

    it('round-trips invisible links', () => {
      const input = `flowchart TD
    A ~~~ B`;

      const graph = fromMermaidFlowchart(input);
      expect(graph.edges[0].data.stroke).toBe('invisible');

      const output = toMermaidFlowchart(graph);
      expect(output).toContain('~~~');

      const graph2 = fromMermaidFlowchart(output);
      expect(graph2.edges[0].data.stroke).toBe('invisible');
    });

    it('round-trips flowchart with subgraphs', () => {
      const input = `flowchart TD
    subgraph sub1[Group]
        A[Inside]
    end
    B[Outside]
    A --> B`;

      const graph = fromMermaidFlowchart(input);
      const output = toMermaidFlowchart(graph);
      const graph2 = fromMermaidFlowchart(output);

      const nodeA = graph2.nodes.find((n) => n.id === 'A')!;
      expect(nodeA.parentId).toBe('sub1');
    });
  });
});

describe('edge label escaping', () => {
  it('round-trips an edge label containing |', () => {
    const input = [
      'flowchart TD',
      '    a --> b',
    ].join('\n');
    const g = fromMermaidFlowchart(input);
    g.edges[0].label = 'a|b';
    const out = fromMermaidFlowchart(toMermaidFlowchart(g));
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].sourceId).toBe('a');
    expect(out.edges[0].targetId).toBe('b');
    expect(out.edges[0].label).toBe('a|b');
  });

  it('parses the #124; entity back to |', () => {
    const g = fromMermaidFlowchart('flowchart TD\n    a -->|x#124;y| b');
    expect(g.edges[0].label).toBe('x|y');
  });

  describe('round-trip fidelity', () => {
    const FIXTURE = `%%{init: {"theme":"forest","flowchart":{"curve":"basis"}}}%%
flowchart LR
    A[Start] -->|go| B{Choice}
    B -->|yes| C[Done]
    B -->|no| A
    linkStyle 0 stroke:#f00,stroke-width:4px
    linkStyle 1,2 stroke:#0f0
    linkStyle default stroke:#333
    click A href "https://example.com" "Open" _blank
    click C call handleDone() "Finish"`;

    it('preserves %%{init}%% directives across round-trip', () => {
      const g = fromMermaidFlowchart(FIXTURE);
      expect(g.data.init).toEqual({
        theme: 'forest',
        flowchart: { curve: 'basis' },
      });
      const out = toMermaidFlowchart(g);
      expect(out.split('\n')[0]).toBe(
        '%%{init: {"theme":"forest","flowchart":{"curve":"basis"}}}%%',
      );
      const g2 = fromMermaidFlowchart(out);
      expect(g2.data.init).toEqual(g.data.init);
    });

    it('preserves href and callback click handlers structurally', () => {
      const g = fromMermaidFlowchart(FIXTURE);
      const a = g.nodes.find((n) => n.id === 'A')!;
      expect(a.data.click).toEqual({
        kind: 'href',
        target: 'https://example.com',
        tooltip: 'Open',
        linkTarget: '_blank',
      });
      const c = g.nodes.find((n) => n.id === 'C')!;
      expect(c.data.click).toEqual({
        kind: 'callback',
        target: 'handleDone()',
        explicitCall: true,
        tooltip: 'Finish',
      });
      const out = toMermaidFlowchart(g);
      expect(out).toContain('click A href "https://example.com" "Open" _blank');
      expect(out).toContain('click C call handleDone() "Finish"');
    });

    it('stores linkStyle on the edge, not a positional index', () => {
      const g = fromMermaidFlowchart(FIXTURE);
      expect(g.edges[0].data.linkStyle).toEqual({
        stroke: '#f00',
        'stroke-width': '4px',
      });
      expect(g.edges[1].data.linkStyle).toEqual({ stroke: '#0f0' });
      expect(g.data.defaultLinkStyle).toEqual({ stroke: '#333' });
    });

    it('recomputes linkStyle indices after edge reorder (mutation-robust)', () => {
      const g = fromMermaidFlowchart(FIXTURE);
      // Reverse edges: the styled edge moves from index 0 to index 2.
      g.edges.reverse();
      const out = toMermaidFlowchart(g);
      const g2 = fromMermaidFlowchart(out);
      // Style stays attached to the same logical edge (A->B, labeled "go").
      const styled = g2.edges.find(
        (e) => e.sourceId === 'A' && e.targetId === 'B',
      )!;
      expect(styled.data.linkStyle).toEqual({
        stroke: '#f00',
        'stroke-width': '4px',
      });
    });

    it('is stable under parse → emit → parse', () => {
      const g1 = fromMermaidFlowchart(FIXTURE);
      const g2 = fromMermaidFlowchart(toMermaidFlowchart(g1));
      expect(g2.data.init).toEqual(g1.data.init);
      expect(g2.data.defaultLinkStyle).toEqual(g1.data.defaultLinkStyle);
      expect(g2.nodes.map((n) => n.data.click)).toEqual(
        g1.nodes.map((n) => n.data.click),
      );
      expect(g2.edges.map((e) => e.data.linkStyle)).toEqual(
        g1.edges.map((e) => e.data.linkStyle),
      );
    });
  });
});
