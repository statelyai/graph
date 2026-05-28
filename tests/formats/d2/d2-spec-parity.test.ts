/**
 * d2 spec-parity tests.
 *
 * Table-driven coverage of d2's documented surface — every connector, a broad
 * set of node shapes, and the reserved keywords — mapped to our internal
 * representation. When d2 adds syntax we don't handle, add it to a table here
 * first and the test fails until it's implemented.
 *
 * Reference: https://d2lang.com/tour/intro
 */
import { describe, it, expect } from 'vitest';
import { fromD2, toD2 } from '../../../src/formats/d2';
import type { D2Arrow } from '../../../src/formats/d2';

describe('d2 connector spec-parity', () => {
  const CONNECTOR_SPEC: Array<{
    d2: string;
    arrow: D2Arrow;
    mode: string;
    sourceId: string;
    targetId: string;
  }> = [
    { d2: 'a -> b', arrow: '->', mode: 'directed', sourceId: 'a', targetId: 'b' },
    { d2: 'a <- b', arrow: '<-', mode: 'directed', sourceId: 'b', targetId: 'a' },
    { d2: 'a -- b', arrow: '--', mode: 'undirected', sourceId: 'a', targetId: 'b' },
    { d2: 'a <-> b', arrow: '<->', mode: 'bidirectional', sourceId: 'a', targetId: 'b' },
  ];

  for (const spec of CONNECTOR_SPEC) {
    it(`maps connector "${spec.d2}"`, () => {
      const g = fromD2(spec.d2);
      expect(g.edges).toHaveLength(1);
      const e = g.edges[0];
      expect(e.data.arrow).toBe(spec.arrow);
      expect(e.mode).toBe(spec.mode);
      expect(e.sourceId).toBe(spec.sourceId);
      expect(e.targetId).toBe(spec.targetId);
    });
  }
});

describe('d2 shape spec-parity', () => {
  const SHAPES = [
    'rectangle',
    'square',
    'page',
    'parallelogram',
    'document',
    'cylinder',
    'queue',
    'package',
    'step',
    'callout',
    'stored_data',
    'person',
    'diamond',
    'oval',
    'circle',
    'hexagon',
    'cloud',
  ];

  for (const shape of SHAPES) {
    it(`maps shape "${shape}" to node.shape and round-trips`, () => {
      const g = fromD2(`a: {\n  shape: ${shape}\n}`);
      expect(g.nodes.find((n) => n.id === 'a')!.shape).toBe(shape);
      const g2 = fromD2(toD2(g));
      expect(g2.nodes.find((n) => n.id === 'a')!.shape).toBe(shape);
    });
  }
});

describe('d2 reserved-keyword spec-parity', () => {
  it('maps geometry keywords to canonical fields', () => {
    const g = fromD2('a: {\n  width: 100\n  height: 50\n  top: 10\n  left: 20\n}');
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.width).toBe(100);
    expect(a.height).toBe(50);
    expect(a.y).toBe(10);
    expect(a.x).toBe(20);
  });

  it('maps near/icon/tooltip/link into the _d2 namespace', () => {
    const g = fromD2(
      'a: {\n  near: top-center\n  icon: https://icons.dev/x.svg\n  tooltip: hi\n  link: https://example.com\n}',
    );
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.data.near).toBe('top-center');
    expect(a.data.icon).toBe('https://icons.dev/x.svg');
    expect(a.data.tooltip).toBe('hi');
    expect(a.data.link).toBe('https://example.com');
  });

  it('round-trips geometry and misc keywords', () => {
    const input =
      'a: {\n  width: 100\n  near: top-center\n  tooltip: hi\n}';
    const g2 = fromD2(toD2(fromD2(input)));
    const a = g2.nodes.find((n) => n.id === 'a')!;
    expect(a.width).toBe(100);
    expect(a.data.near).toBe('top-center');
    expect(a.data.tooltip).toBe('hi');
  });

  it('coerces boolean and numeric style values', () => {
    const g = fromD2(
      'a: {\n  style.3d: true\n  style.opacity: 0.5\n  style.stroke-width: 2\n  style.fill: blue\n}',
    );
    const a = g.nodes.find((n) => n.id === 'a')!;
    expect(a.style).toEqual({
      '3d': true,
      opacity: 0.5,
      'stroke-width': 2,
      fill: 'blue',
    });
  });

  it('round-trips edge styles and arrowheads', () => {
    const input =
      'a -> b: msg {\n  style.stroke: red\n  target-arrowhead.shape: diamond\n}';
    const g1 = fromD2(input);
    const e1 = g1.edges[0];
    expect(e1.style).toEqual({ stroke: 'red' });
    expect(e1.data.targetArrowhead?.shape).toBe('diamond');
    const e2 = fromD2(toD2(g1)).edges[0];
    expect(e2.style).toEqual({ stroke: 'red' });
    expect(e2.data.targetArrowhead?.shape).toBe('diamond');
  });

  it('maps class shape members to ports with visibility', () => {
    const g = fromD2(
      'D: {\n  shape: class\n  +field: int\n  -secret: string\n}',
    );
    const d = g.nodes.find((n) => n.id === 'D')!;
    expect(d.shape).toBe('class');
    expect(d.ports?.map((p) => p.name)).toEqual(['field', 'secret']);
    expect(d.ports?.[0].data.visibility).toBe('+');
    expect(d.ports?.[1].data.visibility).toBe('-');
  });
});
