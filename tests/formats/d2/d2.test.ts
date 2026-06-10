import { describe, it, expect } from 'vitest';
import { fromD2, toD2, d2Converter } from '../../../src/formats/d2';
import { createGraph } from '../../../src/graph';
import type { Graph } from '../../../src/types';

describe('d2 parser', () => {
  it('parses a basic directed edge with label', () => {
    const g = fromD2('a -> b: hello');
    expect(g.mode).toBe('directed');
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].sourceId).toBe('a');
    expect(g.edges[0].targetId).toBe('b');
    expect(g.edges[0].label).toBe('hello');
    expect(g.edges[0].data.arrow).toBe('->');
    expect(g.edges[0].mode).toBe('directed');
  });

  it('parses dot-notation containers into hierarchy', () => {
    const g = fromD2('server.api.auth: Auth\nserver.api.users: Users');
    const ids = g.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([
      'server',
      'server.api',
      'server.api.auth',
      'server.api.users',
    ]);
    const auth = g.nodes.find((n) => n.id === 'server.api.auth')!;
    expect(auth.parentId).toBe('server.api');
    expect(auth.label).toBe('Auth');
    expect(auth.data.declarationForm).toBe('dot');
  });

  it('parses block-notation containers', () => {
    const g = fromD2('server: {\n  api: {\n    auth: Auth\n  }\n}');
    const auth = g.nodes.find((n) => n.id === 'server.api.auth')!;
    expect(auth.parentId).toBe('server.api');
    expect(auth.label).toBe('Auth');
  });

  it('maps shapes to node.shape and styles into the style record', () => {
    const g = fromD2('a: Start {\n  shape: circle\n  style.fill: red\n  style.3d: true\n}');
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.shape).toBe('circle');
    expect(a.label).toBe('Start');
    expect(a.style).toEqual({ fill: 'red', '3d': true });
  });

  it('handles all four connectors and resolves graph mode', () => {
    const directed = fromD2('a -> b');
    expect(directed.mode).toBe('directed');
    const undirected = fromD2('a -- b\nb -- c');
    expect(undirected.mode).toBe('undirected');
    expect(undirected.edges.every((e) => e.mode === 'undirected')).toBe(true);
    const mixed = fromD2('a -> b\nb -- c\nc <-> d');
    expect(mixed.mode).toBe('directed');
    expect(mixed.edges.map((e) => e.data.arrow)).toEqual(['->', '--', '<->']);
  });

  it('normalizes reversed connectors but preserves the glyph', () => {
    const g = fromD2('a <- b');
    expect(g.edges[0].sourceId).toBe('b');
    expect(g.edges[0].targetId).toBe('a');
    expect(g.edges[0].data.arrow).toBe('<-');
  });

  it('maps sql_table columns to ports and field connections to ports', () => {
    const g = fromD2(
      'users: {\n  shape: sql_table\n  id: int { constraint: primary_key }\n  role_id: int\n}\nroles: {\n  shape: sql_table\n  id: int\n}\nusers.role_id -> roles.id',
    );
    const users = g.nodes.find((n) => n.id === 'users')!;
    expect(users.shape).toBe('sql_table');
    expect(users.ports?.map((p) => p.name)).toEqual(['id', 'role_id']);
    expect(users.ports?.[0].data.typeName).toBe('int');
    expect(users.ports?.[0].data.constraint).toEqual(['primary_key']);
    const edge = g.edges[0];
    expect(edge.sourceId).toBe('users');
    expect(edge.sourcePort).toBe('role_id');
    expect(edge.targetId).toBe('roles');
    expect(edge.targetPort).toBe('id');
  });

  it('parses markdown block labels', () => {
    const g = fromD2('a: |md # Heading |');
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.label).toContain('# Heading');
    expect(a.data.labelBlock?.kind).toBe('md');
  });

  it('attaches a comment to the following entity', () => {
    const onEdge = fromD2('# top comment\na -> b');
    expect(onEdge.edges[0].data.commentsBefore).toEqual(['top comment']);

    const onNode = fromD2('# describe a\na: hello');
    const a = onNode.nodes.find((n) => n.id === 'a')!;
    expect(a.data.commentsBefore).toEqual(['describe a']);
  });

  it('captures direction', () => {
    const g = fromD2('direction: right\na -> b');
    expect(g.direction).toBe('right');
  });
});

describe('d2 round-trip', () => {
  const cases: Array<[string, string]> = [
    ['basic edge', 'a -> b: hello'],
    ['dot containers', 'server.api.auth: Auth\nserver.api.users: Users'],
    ['shapes and styles', 'a: Start {\n  shape: circle\n  style.fill: red\n}'],
    ['undirected', 'a -- b\nb -- c'],
    ['mixed connectors', 'a -> b\nb -- c\nc <-> d'],
    ['reversed', 'a <- b'],
    [
      'sql_table',
      'users: {\n  shape: sql_table\n  id: int\n}\nroles: {\n  shape: sql_table\n  id: int\n}\nusers.id -> roles.id',
    ],
  ];

  for (const [name, input] of cases) {
    it(`round-trips ${name} semantically`, () => {
      const g1 = fromD2(input);
      const text = toD2(g1);
      const g2 = fromD2(text);
      expect(g2.mode).toBe(g1.mode);
      expect(g2.nodes.map((n) => n.id).sort()).toEqual(
        g1.nodes.map((n) => n.id).sort(),
      );
      expect(
        g2.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort(),
      ).toEqual(g1.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort());
      expect(g2.edges.map((e) => e.data.arrow).sort()).toEqual(
        g1.edges.map((e) => e.data.arrow).sort(),
      );
    });
  }

  it('exposes a converter', () => {
    const g = d2Converter.from('a -> b');
    expect(typeof d2Converter.to(g)).toBe('string');
  });
});

describe('toD2 with plain graphs', () => {
  it('emits valid D2 for a graph not produced by fromD2 (null data)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'go' }],
    });
    const text = toD2(g);
    const round = fromD2(text);
    expect(round.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(round.edges).toHaveLength(1);
    expect(round.edges[0].sourceId).toBe('a');
    expect(round.edges[0].targetId).toBe('b');
    expect(round.edges[0].label).toBe('go');
  });

  it('emits valid D2 when node and edge data are undefined or plain objects', () => {
    const g: Graph = {
      id: '',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined },
        { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '', data: { custom: true } },
      ],
      edges: [
        { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: '', data: undefined },
        { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'a', label: '', data: { weight: 3 }, mode: 'undirected' },
      ],
      data: undefined,
    };
    const text = toD2(g);
    const round = fromD2(text);
    expect(round.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(round.nodes.find((n) => n.id === 'a')!.label).toBe('A');
    expect(round.edges).toHaveLength(2);
    // Per-edge mode falls back to the connector glyph (-- for undirected).
    expect(round.edges.some((e) => e.mode === 'undirected')).toBe(true);
  });
});
