import { describe, expect, it } from 'vitest';
import { createGraph } from '../../src/graph';
import { getEdgeMode } from '../../src/mode';
import { fromD2, toD2 } from '../../src/formats/d2';
import {
  fromMermaidBlock,
  fromMermaidER,
  fromMermaidFlowchart,
  fromMermaidSequence,
  fromMermaidClass,
  fromMermaidMindmap,
  fromMermaidState,
  fromMermaidIshikawa,
  toMermaidBlock,
  toMermaidClass,
  toMermaidMindmap,
  toMermaidState,
  toMermaidIshikawa,
  toMermaidER,
  toMermaidFlowchart,
  toMermaidSequence,
} from '../../src/formats/mermaid';

describe('fidelity regressions: diagram adapters', () => {
  it('D2 uses inherited undirected graph mode when no edge override exists', () => {
    const original = createGraph({
      mode: 'undirected', nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const restored = fromD2(toD2(original));
    expect(getEdgeMode(restored, restored.edges[0])).toBe('undirected');
  });

  it('D2 retains inline comments on the first source round trip', () => {
    const emitted = toD2(fromD2('a: A # keep-inline\n# following-node\nb: B\n'));
    expect(emitted).toContain('# keep-inline');
    expect(emitted).toContain('# following-node');
  });

  it('Mermaid sequence emits one spanning note across repeated round trips', () => {
    let source = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Before\nNote over A,B: shared\nB->>A: After';
    for (let pass = 0; pass < 3; pass++) {
      source = toMermaidSequence(fromMermaidSequence(source));
      expect(source.match(/Note over A,B: shared/g), `pass ${pass + 1}`).toHaveLength(1);
    }
  });

  it('Mermaid sequence retains a note between its surrounding messages', () => {
    const source = toMermaidSequence(fromMermaidSequence(
      'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Before\nNote over A,B: shared\nB->>A: After',
    ));
    expect(source.indexOf('Before')).toBeLessThan(source.indexOf('Note over A,B: shared'));
    expect(source.indexOf('Note over A,B: shared')).toBeLessThan(source.indexOf('After'));
  });

  it('Mermaid flowchart retains native node styles', () => {
    const graph = fromMermaidFlowchart('flowchart TD\nA --- B\nstyle A fill:red,stroke:blue');
    expect(graph.nodes.find((node) => node.id === 'A')?.style).toEqual({ fill: 'red', stroke: 'blue' });
    const restored = fromMermaidFlowchart(toMermaidFlowchart(graph));
    expect(restored.nodes.find((node) => node.id === 'A')?.style).toEqual({ fill: 'red', stroke: 'blue' });
  });

  it('Mermaid ER retains isolated entity declarations', () => {
    const graph = fromMermaidER('erDiagram\nLONELY');
    expect(graph.nodes.map((node) => node.id)).toEqual(['LONELY']);
    const restored = fromMermaidER(toMermaidER(graph));
    expect(restored.nodes.map((node) => node.id)).toEqual(['LONELY']);
  });

  it('Mermaid block parses adjacent quoted labels containing spaces', () => {
    const graph = fromMermaidBlock('block-beta\na["Hello world"] b["Second node"]');
    expect(graph.nodes.map((node) => ({ id: node.id, label: node.label }))).toEqual([
      { id: 'a', label: 'Hello world' }, { id: 'b', label: 'Second node' },
    ]);
  });

  it('canonical mode edits override authored D2 and Mermaid connectors', () => {
    for (const [from, to, source] of [
      [fromD2, toD2, 'a -> b'],
      [fromMermaidFlowchart, toMermaidFlowchart, 'flowchart LR\na --> b'],
      [fromMermaidBlock, toMermaidBlock, 'block-beta\na --> b'],
    ] as const) {
      const graph = from(source);
      graph.edges[0].mode = 'undirected';
      const restored = from(to(graph as never));
      expect(getEdgeMode(restored, restored.edges[0])).toBe('undirected');
    }
  });

  it('D2 distinguishes literal dotted keys from hierarchy and resolves ancestor references', () => {
    const graph = fromD2('"a.b": Literal\na.b: Nested\nouter: {\na\ninner: {\nb -> _.a\n}\n}');
    expect(graph.nodes.filter((node) => node.label === 'Literal')).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.label === 'Nested')).toHaveLength(1);
    expect(graph.edges[0].targetId).toBe('outer.a');
    const restored = fromD2(toD2(graph));
    expect(restored.nodes.filter((node) => node.label === 'Literal')).toHaveLength(1);
    expect(restored.nodes.filter((node) => node.label === 'Nested')).toHaveLength(1);
    expect(restored.edges[0].targetId).toBe('outer.a');
  });

  it('D2 resolves indexed connection attributes and applies chain labels to every edge', () => {
    const graph = fromD2('a -> b -> c: shared\n(a -> b)[0].style.stroke: red');
    expect(graph.edges.map((edge) => edge.label)).toEqual(['shared', 'shared']);
    expect(graph.edges[0].style?.stroke).toBe('red');
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('D2 retains recursive variables, substitution expressions and scoped spread imports', () => {
    const source = 'vars: {\nsettings: {\ncolor: red\n}\n}\na: ${settings.color}\ncontainer: {\n...@base\nx\n}';
    const graph = fromD2(source);
    expect(graph.data.source?.vars?.settings).toEqual({ color: 'red' });
    const out = toD2(graph);
    expect(out).toContain('${settings.color}');
    expect(out).toMatch(/container: \{[\s\S]*\.\.\.@base/);
    expect(fromD2(out).data.source?.vars?.settings).toEqual({ color: 'red' });
  });

  it('D2 preserves structured common attributes, class properties and arrowhead labels/styles', () => {
    const source = 'classes: {\nred: {\nshape: circle\nstyle: {\nfill: red\n}\n}\n}\nt: {\nshape: sql_table\nlabel: Users\nwidth: 200\nstyle.fill: red\nid: int\n}\nt -> other: {\nsource-arrowhead: {\nshape: circle\nlabel: From\nstyle.filled: true\n}\n}';
    const first = fromD2(source);
    const table = first.nodes.find((node) => node.id === 't')!;
    expect(table.label).toBe('Users');
    expect(table.width).toBe(200);
    expect(table.ports?.map((port) => port.name)).toEqual(['id']);
    const restored = fromD2(toD2(first));
    expect(restored.nodes.find((node) => node.id === 't')?.style?.fill).toBe('red');
    expect(restored.edges[0].data.sourceArrowhead).toMatchObject({ shape: 'circle', label: 'From', style: { filled: true } });
    expect(restored.data.source?.classes).toEqual(first.data.source?.classes);
  });

  it('flowchart keeps expanded shape/property and explicit edge identity while respecting redeclarations', () => {
    const graph = fromMermaidFlowchart('flowchart LR\nA@{ shape: cloud, label: "First", icon: "fa:cloud" }\nA@{ shape: cloud, label: "Last", icon: "fa:cloud" }\nA e1@----> B\ne1@{ animate: true, curve: stepBefore }');
    expect(graph.nodes.find((node) => node.id === 'A')?.label).toBe('Last');
    expect(graph.edges[0].id).toBe('e1');
    const restored = fromMermaidFlowchart(toMermaidFlowchart(graph));
    expect(restored.nodes.find((node) => node.id === 'A')?.shape).toBe('cloud');
    expect(restored.nodes.find((node) => node.id === 'A')?.label).toBe('Last');
    expect(restored.edges[0].id).toBe('e1');
    expect(toMermaidFlowchart(restored)).toContain('fa:cloud');
    expect(toMermaidFlowchart(restored)).toContain('animate: true');
  });

  it('sequence retains official participant configuration and lifecycle event position', () => {
    const source = 'sequenceDiagram\nautonumber 10 5\nparticipant A\nparticipant B@{ "type": "database", "alias": "Storage" }\nA->>B: first\ncreate participant C\nB->>C: start\ndestroy C\nC-xB: end';
    const graph = fromMermaidSequence(source);
    expect(graph.nodes.find((node) => node.id === 'B')?.data.actorType).toBe('database');
    expect(graph.nodes.find((node) => node.id === 'B')?.label).toBe('Storage');
    const out = toMermaidSequence(graph);
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('create participant C'));
    expect(out.indexOf('start')).toBeLessThan(out.indexOf('destroy C'));
    expect(out).toContain('autonumber 10 5');
    expect(fromMermaidSequence(out).nodes.find((node) => node.id === 'C')?.data.destroyed).toBe(true);
  });

  it('ER retains multiple attribute constraints', () => {
    const graph = fromMermaidER('erDiagram\nENTITY {\nint id PK, FK "reference"\n}');
    expect(graph.nodes[0].data.attributes).toHaveLength(1);
    const out = toMermaidER(graph);
    expect(out).toContain('PK, FK');
    expect(fromMermaidER(out).nodes[0].data.attributes).toEqual(graph.nodes[0].data.attributes);
  });

  it('block retains shapes and scoped column counts', () => {
    const graph = fromMermaidBlock('block-beta\ncolumns 3\nblock:group\ncolumns 2\na((Circle)) b["Second node"]\nend\nc');
    expect(graph.data.columns).toBe(3);
    const restored = fromMermaidBlock(toMermaidBlock(graph));
    expect(restored.nodes.find((node) => node.id === 'a')?.shape).toBe('circle');
    expect(restored.nodes.find((node) => node.id === 'b')?.label).toBe('Second node');
    expect(restored.nodes.find((node) => node.id === 'group')?.data).toMatchObject({ columns: 2 });
  });

  it('class retains namespaces, display aliases, notes and lollipop relation identity', () => {
    const graph = fromMermaidClass('classDiagram\nnamespace Base {\nclass A["Human label"]\n}\nnote for A "Helpful note"\nA --() Interface');
    expect(graph.nodes.find((node) => node.id === 'A')?.parentId).toBe('Base');
    expect(graph.nodes.find((node) => node.id === 'A')?.label).toBe('Human label');
    const restored = fromMermaidClass(toMermaidClass(graph));
    expect(restored.nodes.find((node) => node.id === 'A')?.parentId).toBe('Base');
    expect(toMermaidClass(restored)).toContain('Helpful note');
    expect(restored.edges[0].targetId).toBe('Interface');
  });

  it('mindmap preserves authored identifiers, shapes and classes', () => {
    const graph = fromMermaidMindmap('mindmap\nroot((Root))\n  child[Child]\n    :::important');
    expect(graph.nodes.map((node) => node.id)).toEqual(['root', 'child']);
    expect(graph.nodes[0].shape).toBe('circle');
    const restored = fromMermaidMindmap(toMermaidMindmap(graph));
    expect(restored.nodes.map((node) => node.id)).toEqual(['root', 'child']);
    expect(restored.nodes[1].data).toMatchObject({ classes: ['important'] });
  });

  it('state and tree labels decode the same escaping they emit', () => {
    const state = fromMermaidState('stateDiagram-v2\nA\nnote right of A : A; B | C');
    expect(fromMermaidState(toMermaidState(state)).nodes[0].data.notes).toEqual(state.nodes[0].data.notes);
    for (const [from, to, source] of [
      [fromMermaidMindmap, toMermaidMindmap, 'mindmap\nRoot\n  A; B'],
      [fromMermaidIshikawa, toMermaidIshikawa, 'ishikawa-beta\nRoot\n  A; B'],
    ] as const) {
      const graph = from(source);
      expect(from(to(graph as never)).nodes.map((node) => node.label)).toEqual(graph.nodes.map((node) => node.label));
    }
  });

  it('Mermaid metadata survives JSON persistence and all diagram codecs', () => {
    const codecs = [
      [fromMermaidFlowchart, toMermaidFlowchart, 'flowchart LR\nA --> B'],
      [fromMermaidState, toMermaidState, 'stateDiagram-v2\nA --> B'],
      [fromMermaidSequence, toMermaidSequence, 'sequenceDiagram\nA->>B: hello'],
      [fromMermaidClass, toMermaidClass, 'classDiagram\nA --> B'],
      [fromMermaidER, toMermaidER, 'erDiagram\nA ||--|| B: label'],
      [fromMermaidBlock, toMermaidBlock, 'block-beta\na b'],
      [fromMermaidMindmap, toMermaidMindmap, 'mindmap\nRoot\n  Child'],
      [fromMermaidIshikawa, toMermaidIshikawa, 'ishikawa-beta\nProblem\n  Cause'],
    ] as const;
    for (const [from, to, source] of codecs) {
      const original = `---\ntitle: Source\nconfig:\n  theme: forest\n---\n%%{init: {"theme":"forest"}}%%\n%% Copyright\n${source}`;
      const graph = JSON.parse(JSON.stringify(from(original)));
      const emitted = to(graph);
      expect(emitted).toContain('title: Source');
      expect(emitted).toContain('%% Copyright');
      expect(emitted).toContain('"theme":"forest"');
      expect(from(emitted).nodes).toHaveLength(graph.nodes.length);
    }
  });

  it('quoted block/property values with a trailing escaped backslash retain token boundaries', () => {
    const block = fromMermaidBlock('block-beta\na["Path\\\\"] b["Second node"]');
    expect(block.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(fromMermaidBlock(toMermaidBlock(block)).nodes.map((node) => node.label)).toEqual(block.nodes.map((node) => node.label));
    const flow = fromMermaidFlowchart('flowchart LR\nA@{ shape: cloud, label: "Path\\\\", icon: "fa:cloud" }');
    expect(flow.nodes[0].label).toBe('Path\\');
    expect(fromMermaidFlowchart(toMermaidFlowchart(flow)).nodes[0].label).toBe('Path\\');
  });

  it('out-of-range numeric entities remain inspectable without throwing', () => {
    const graph = fromMermaidFlowchart('flowchart LR\nA["#1114112; #999999999999999999999;"]');
    expect(graph.nodes[0].label).toBe('#1114112; #999999999999999999999;');
  });

  it('sequence note edits use live data and missing event anchors fail explicitly', () => {
    const graph = fromMermaidSequence('sequenceDiagram\nA->>B: first\nNote over A,B: before\nB->>A: last');
    graph.nodes.find((node) => node.id === 'A')!.data.notes![0].text = 'Edited';
    const out = toMermaidSequence(JSON.parse(JSON.stringify(graph)));
    expect(out.match(/Note over A,B: Edited/g)).toHaveLength(1);
    expect(out).not.toContain('before');
    graph.edges = [];
    expect(() => toMermaidSequence(graph)).toThrow('event anchors');
  });

  it('sequence note array reordering retains stable event identities, deletion fails explicitly', () => {
    const graph = fromMermaidSequence('sequenceDiagram\nA->>B: first\nNote right of A: earlier\nB->>A: middle\nNote right of A: later\nA->>B: last');
    const notes = graph.nodes.find((node) => node.id === 'A')!.data.notes!;
    notes.reverse();
    const out = toMermaidSequence(graph);
    expect(out.indexOf('earlier')).toBeLessThan(out.indexOf('middle'));
    expect(out.indexOf('middle')).toBeLessThan(out.indexOf('later'));
    notes.splice(1, 1);
    expect(() => toMermaidSequence(graph)).toThrow('ordered note no longer exists');
  });

  it('sequence participant ID edits fail explicitly when lifecycle references are stale', () => {
    const graph = fromMermaidSequence('sequenceDiagram\nA->>B: first\ncreate participant C\nB->>C: start\ndestroy C\nC-xB: end');
    graph.nodes.find((node) => node.id === 'C')!.id = 'Renamed';
    expect(() => toMermaidSequence(graph)).toThrow('event participant "C" not found');
  });

  it('D2 unsupported boards and globs remain source metadata instead of fabricated nodes', () => {
    const graph = fromD2('a\nb\n*.style.fill: red\nlayers: {\nother: {\nx -> y\n}\n}');
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.data.source?.unknownStatements).toHaveLength(2);
  });

  it('D2 class arrays and scoped variables remain source expressions', () => {
    const graph = fromD2('container: {\nvars: {\ncolor: red\n}\na: {\nclass: [red; blue]\n}\n}');
    expect(graph.nodes.find((node) => node.id === 'container.a')?.data.classes).toEqual(['red', 'blue']);
    const out = toD2(graph);
    expect(out).toContain('class: [red; blue]');
    expect(fromD2(out).nodes.find((node) => node.id === 'container')?.data.source?.vars).toEqual({ color: 'red' });
  });

  it('D2 retains variable arrays and single-quoted substitution literals', () => {
    const source = 'vars: {\nnames: [red; blue]\n}\na: \'${names}\'';
    const graph = fromD2(source);
    expect(graph.data.source?.vars?.names).toEqual(['red', 'blue']);
    const out = toD2(graph);
    expect(out).toContain("a: '${names}'");
    expect(fromD2(out).data.source?.vars?.names).toEqual(['red', 'blue']);
  });

  it('D2 quoted IDs with backslashes retain identity after serialization', () => {
    const graph = fromD2('"a\\\\b.c": Literal\n"a\\\\b.c" -> target');
    const restored = fromD2(toD2(graph));
    expect(restored.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(restored.edges[0].sourceId).toBe(graph.edges[0].sourceId);
  });

  it('flowchart live stroke edits override authored connector glyph', () => {
    const graph = fromMermaidFlowchart('flowchart LR\nA ----> B');
    graph.edges[0].data.stroke = 'dotted';
    const restored = fromMermaidFlowchart(toMermaidFlowchart(graph));
    expect(restored.edges[0].data.stroke).toBe('dotted');
    expect(restored.edges[0].sourceId).toBe('A');
  });

  it('class keeps both endpoints of a two-sided relationship', () => {
    const graph = fromMermaidClass('classDiagram\nA <|--|> B');
    expect(graph.nodes.map((node) => node.id)).toEqual(['A', 'B']);
    const out = toMermaidClass(graph);
    expect(out).toContain('A <|--|> B');
    expect(fromMermaidClass(out).edges[0].sourceId).toBe('A');
    expect(fromMermaidClass(out).edges[0].targetId).toBe('B');
  });

  it('block retains row spans and styles without creating directive nodes', () => {
    const graph = fromMermaidBlock('block-beta\na["Wide label"]:2 b["Other"]\nstyle a fill:red\ncolumns auto');
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.nodes[0].data.span).toBe(2);
    expect(graph.nodes[0].style?.fill).toBe('red');
    const restored = fromMermaidBlock(toMermaidBlock(graph));
    expect(restored.nodes[0].data.span).toBe(2);
    expect(restored.nodes[0].style?.fill).toBe('red');
    expect(graph.data.source?.unknownStatements).toContain('columns auto');
  });

  it('ER retains direction and entity aliases', () => {
    const graph = fromMermaidER('erDiagram\ndirection LR\nCUSTOMER["Customer record"] {\nint id PK\n}');
    expect(graph.direction).toBe('right');
    expect(graph.nodes[0].id).toBe('CUSTOMER');
    expect(graph.nodes[0].label).toBe('Customer record');
    const restored = fromMermaidER(toMermaidER(graph));
    expect(restored.direction).toBe('right');
    expect(restored.nodes[0].label).toBe('Customer record');
  });

  it('flowchart preserves CSS values containing commas/colons and encoded click metadata', () => {
    const graph = fromMermaidFlowchart('flowchart LR\nA --> B\nstyle A stroke-dasharray:5\\,5,fill:url(#paint)\nclick A href "https://example.com/#35;fragment" "A #quot;quote#quot;" _blank');
    expect(graph.nodes[0].style).toEqual({ 'stroke-dasharray': '5\\,5', fill: 'url(#paint)' });
    const restored = fromMermaidFlowchart(toMermaidFlowchart(graph));
    expect(restored.nodes[0].style).toEqual(graph.nodes[0].style);
    expect(restored.nodes[0].data.click).toEqual(graph.nodes[0].data.click);
  });

  it('sequence notes retain their control-flow block membership', () => {
    const graph = fromMermaidSequence('sequenceDiagram\nloop work\nA->>B: inside\nNote right of A: last inside\nend\nB->>A: outside');
    const out = toMermaidSequence(graph);
    expect(out.indexOf('last inside')).toBeLessThan(out.indexOf('\n    end'));
    expect(out.indexOf('\n    end')).toBeLessThan(out.indexOf('outside'));
  });

  it('sequence lifecycle directives before blocks remain outside their blocks', () => {
    const graph = fromMermaidSequence('sequenceDiagram\nA->>B: first\ncreate participant C\nloop work\nB->>C: start\nend');
    const out = toMermaidSequence(graph);
    expect(out.indexOf('create participant C')).toBeLessThan(out.indexOf('loop work'));
  });
});
