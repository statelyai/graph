import { describe, it, expect } from 'vitest';
import {
  createGraphNode,
  createGraphEdge,
  areEntitiesEqual,
  isLayoutEqual,
  isNonLayoutEqual,
  LAYOUT_KEYS,
} from '../src/index';

describe('areEntitiesEqual', () => {
  describe('nodes', () => {
    const baseNode = createGraphNode({ id: 'n1', label: 'A', x: 10, y: 20 });

    it('returns true for identical nodes (no keys = all own keys)', () => {
      const other = createGraphNode({ id: 'n1', label: 'A', x: 10, y: 20 });
      expect(areEntitiesEqual(baseNode, other)).toBe(true);
    });

    it('returns false when any own key differs (no keys specified)', () => {
      const other = createGraphNode({ id: 'n1', label: 'B', x: 10, y: 20 });
      expect(areEntitiesEqual(baseNode, other)).toBe(false);
    });

    it('compares only specified keys', () => {
      const other = createGraphNode({ id: 'n1', label: 'B', x: 10, y: 20 });
      expect(areEntitiesEqual(baseNode, other, ['id', 'x', 'y'])).toBe(true);
    });

    it('detects difference in specified keys', () => {
      const other = createGraphNode({ id: 'n1', label: 'A', x: 999, y: 20 });
      expect(areEntitiesEqual(baseNode, other, ['x'])).toBe(false);
    });

    it('compares data deeply', () => {
      const a = createGraphNode({ id: 'n1', data: { foo: 1 } });
      const b = createGraphNode({ id: 'n1', data: { foo: 1 } });
      const c = createGraphNode({ id: 'n1', data: { foo: 2 } });
      expect(areEntitiesEqual(a, b, ['data'])).toBe(true);
      expect(areEntitiesEqual(a, c, ['data'])).toBe(false);
    });

    it('compares style deeply', () => {
      const a = createGraphNode({ id: 'n1', style: { fill: 'red' } });
      const b = createGraphNode({ id: 'n1', style: { fill: 'red' } });
      const c = createGraphNode({ id: 'n1', style: { fill: 'blue' } });
      expect(areEntitiesEqual(a, b, ['style'])).toBe(true);
      expect(areEntitiesEqual(a, c, ['style'])).toBe(false);
    });
  });

  describe('edges', () => {
    const baseEdge = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      label: 'go',
      x: 5,
    });

    it('returns true for identical edges', () => {
      const other = createGraphEdge({
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        label: 'go',
        x: 5,
      });
      expect(areEntitiesEqual(baseEdge, other)).toBe(true);
    });

    it('returns false when connection differs', () => {
      const other = createGraphEdge({
        id: 'e1',
        sourceId: 'a',
        targetId: 'c',
        label: 'go',
        x: 5,
      });
      expect(areEntitiesEqual(baseEdge, other)).toBe(false);
    });
  });
});

describe('isLayoutEqual', () => {
  it('ignores non-layout fields on nodes', () => {
    const a = createGraphNode({
      id: 'n1',
      label: 'A',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    const b = createGraphNode({
      id: 'n1',
      label: 'B',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(isLayoutEqual(a, b)).toBe(true);
  });

  it('detects layout differences on nodes', () => {
    const a = createGraphNode({ id: 'n1', x: 10, y: 20 });
    const b = createGraphNode({ id: 'n1', x: 999, y: 20 });
    expect(isLayoutEqual(a, b)).toBe(false);
  });

  it('detects color difference on nodes', () => {
    const a = createGraphNode({ id: 'n1', color: 'red' });
    const b = createGraphNode({ id: 'n1', color: 'blue' });
    expect(isLayoutEqual(a, b)).toBe(false);
  });

  it('detects shape difference on nodes', () => {
    const a = createGraphNode({ id: 'n1', shape: 'rect' });
    const b = createGraphNode({ id: 'n1', shape: 'circle' });
    expect(isLayoutEqual(a, b)).toBe(false);
  });

  it('ignores non-layout fields on edges', () => {
    const a = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      x: 10,
    });
    const b = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'c',
      x: 10,
    });
    expect(isLayoutEqual(a, b)).toBe(true);
  });

  it('detects layout differences on edges', () => {
    const a = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      x: 10,
    });
    const b = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      x: 999,
    });
    expect(isLayoutEqual(a, b)).toBe(false);
  });
});

describe('isNonLayoutEqual', () => {
  it('ignores layout fields on nodes', () => {
    const a = createGraphNode({ id: 'n1', label: 'A', x: 0, y: 0 });
    const b = createGraphNode({ id: 'n1', label: 'A', x: 999, y: 999 });
    expect(isNonLayoutEqual(a, b)).toBe(true);
  });

  it('detects non-layout differences on nodes', () => {
    const a = createGraphNode({ id: 'n1', label: 'A', x: 0 });
    const b = createGraphNode({ id: 'n1', label: 'B', x: 0 });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });

  it('detects parentId change', () => {
    const a = createGraphNode({ id: 'n1', parentId: 'p1' });
    const b = createGraphNode({ id: 'n1', parentId: 'p2' });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });

  it('detects data change', () => {
    const a = createGraphNode({ id: 'n1', data: { v: 1 } });
    const b = createGraphNode({ id: 'n1', data: { v: 2 } });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });

  it('ignores layout fields on edges', () => {
    const a = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      x: 0,
    });
    const b = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      x: 999,
    });
    expect(isNonLayoutEqual(a, b)).toBe(true);
  });

  it('detects connection change on edges', () => {
    const a = createGraphEdge({ id: 'e1', sourceId: 'a', targetId: 'b' });
    const b = createGraphEdge({ id: 'e1', sourceId: 'a', targetId: 'c' });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });

  it('detects weight change on edges', () => {
    const a = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      weight: 1,
    });
    const b = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      weight: 5,
    });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });

  it('detects port change on edges', () => {
    const a = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'out1',
    });
    const b = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'out2',
    });
    expect(isNonLayoutEqual(a, b)).toBe(false);
  });
});

describe('key sets', () => {
  it('LAYOUT_KEYS has node and edge arrays', () => {
    expect(LAYOUT_KEYS.node).toContain('x');
    expect(LAYOUT_KEYS.node).toContain('style');
    expect(LAYOUT_KEYS.node).toContain('shape');
    expect(LAYOUT_KEYS.edge).toContain('x');
    expect(LAYOUT_KEYS.edge).not.toContain('shape');
  });

  it('non-layout keys are the inverse of layout keys', () => {
    // isNonLayoutEqual should ignore layout keys and compare the rest
    const node = createGraphNode({ id: 'n1', label: 'A', x: 10 });
    const moved = { ...node, x: 999 };
    const renamed = { ...node, label: 'B' };

    expect(isNonLayoutEqual(node, moved)).toBe(true);
    expect(isNonLayoutEqual(node, renamed)).toBe(false);
  });
});
