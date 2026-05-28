import { describe, it, expect } from 'vitest';
import { fromD2, toD2 } from '../../../src/formats/d2';

describe('d2 sequence diagrams', () => {
  const seq = `shape_holder: {
  shape: sequence_diagram
  alice -> bob: hello
  bob -> alice: hi back
  alice -> bob: bye
}`;

  it('preserves message order within a sequence container', () => {
    const g = fromD2(seq);
    const container = g.nodes.find((n) => n.id === 'shape_holder')!;
    expect(container.shape).toBe('sequence_diagram');
    const order = container.data.order ?? [];
    // alice, bob declared via first message, then three edges in order
    const edgeOrder = order.filter((id) => id.includes('->'));
    expect(edgeOrder).toHaveLength(3);
    // verify edges appear in source order
    const labels = edgeOrder.map(
      (id) => g.edges.find((e) => e.id === id)!.label,
    );
    expect(labels).toEqual(['hello', 'hi back', 'bye']);
  });

  it('round-trips sequence message order', () => {
    const g1 = fromD2(seq);
    const g2 = fromD2(toD2(g1));
    const c2 = g2.nodes.find((n) => n.id === 'shape_holder')!;
    const labels = (c2.data.order ?? [])
      .filter((id) => id.includes('->'))
      .map((id) => g2.edges.find((e) => e.id === id)!.label);
    expect(labels).toEqual(['hello', 'hi back', 'bye']);
  });
});

describe('d2 source abstractions', () => {
  it('expands vars but preserves the source block', () => {
    const g = fromD2('vars: {\n  primary: red\n}\na: hello');
    expect(g.data.source?.vars).toEqual({ primary: 'red' });
  });

  it('preserves classes definitions', () => {
    const g = fromD2(
      'classes: {\n  important: {\n    style.fill: red\n  }\n}\na.class: important',
    );
    expect(g.data.source?.classes).toEqual({ important: { fill: 'red' } });
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.data.classes).toEqual(['important']);
  });

  it('preserves imports as opaque references', () => {
    const g = fromD2('a -> b\n@common.d2');
    expect(g.data.source?.imports).toEqual(['common.d2']);
  });

  it('round-trips vars and classes', () => {
    const input =
      'vars: {\n  primary: red\n}\nclasses: {\n  important: {\n    style.fill: red\n  }\n}\na -> b';
    const g1 = fromD2(input);
    const g2 = fromD2(toD2(g1));
    expect(g2.data.source?.vars).toEqual(g1.data.source?.vars);
    expect(g2.data.source?.classes).toEqual(g1.data.source?.classes);
  });
});

describe('d2 forward-referenced ports', () => {
  const fwd = `users.id -> roles.id
users: {
  shape: sql_table
  id: int
}
roles: {
  shape: sql_table
  id: int
}`;

  it('resolves field connections declared before the table', () => {
    const g = fromD2(fwd);
    // No spurious child nodes for the columns.
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['roles', 'users']);
    const edge = g.edges[0];
    expect(edge.sourceId).toBe('users');
    expect(edge.sourcePort).toBe('id');
    expect(edge.targetId).toBe('roles');
    expect(edge.targetPort).toBe('id');
  });

  it('round-trips a forward-referenced port connection', () => {
    const g2 = fromD2(toD2(fromD2(fwd)));
    expect(g2.nodes.map((n) => n.id).sort()).toEqual(['roles', 'users']);
    expect(g2.edges[0].sourcePort).toBe('id');
    expect(g2.edges[0].targetPort).toBe('id');
  });
});

describe('d2 reserved-word node names', () => {
  it('keeps a node named after a reserved keyword distinct from the attribute', () => {
    const g = fromD2('"shape": Box\n"shape" -> b');
    // "shape" is a node id, not a shape attribute on the root.
    expect(g.nodes.some((n) => n.id === 'shape')).toBe(true);
    const shape = g.nodes.find((n) => n.id === 'shape')!;
    expect(shape.label).toBe('Box');
    expect(shape.shape).toBeUndefined();
  });

  it('round-trips a reserved-word node id (re-quoted on emit)', () => {
    const g1 = fromD2('"style": Theme\n"style" -> b');
    const text = toD2(g1);
    expect(text).toContain('"style"');
    const g2 = fromD2(text);
    const style = g2.nodes.find((n) => n.id === 'style')!;
    expect(style).toBeDefined();
    expect(style.label).toBe('Theme');
    expect(style.style).toBeUndefined();
    expect(g2.edges.some((e) => e.sourceId === 'style')).toBe(true);
  });
});

describe('d2 grid', () => {
  it('parses grid spec onto the container', () => {
    const g = fromD2('board: {\n  grid-rows: 2\n  grid-columns: 3\n  a\n  b\n}');
    const board = g.nodes.find((n) => n.id === 'board')!;
    expect(board.data.grid).toEqual({ rows: 2, columns: 3 });
    expect(g.nodes.some((n) => n.id === 'board.a')).toBe(true);
  });

  it('round-trips grid spec', () => {
    const g1 = fromD2('board: {\n  grid-rows: 2\n  grid-columns: 3\n  a\n  b\n}');
    const g2 = fromD2(toD2(g1));
    const board = g2.nodes.find((n) => n.id === 'board')!;
    expect(board.data.grid).toEqual({ rows: 2, columns: 3 });
  });
});
