import { describe, it, expect } from 'vitest';
import {
  createGraph,
  getDiff,
  isEmptyDiff,
  invertDiff,
  getPatches,
  applyPatches,
  invertPatches,
  toPatches,
  toDiff,
} from '../src/index';

function makeGraphA() {
  return createGraph({
    id: 'test',
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });
}

function makeGraphB() {
  return createGraph({
    id: 'test',
    nodes: [
      { id: 'a', label: 'A-updated' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ],
    edges: [
      { id: 'e2', sourceId: 'c', targetId: 'd', label: 'changed' },
      { id: 'e3', sourceId: 'a', targetId: 'd' },
    ],
  });
}

describe('getDiff', () => {
  it('detects added, removed, and updated nodes', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());

    expect(diff.nodes.added).toHaveLength(1);
    expect(diff.nodes.added[0].id).toBe('d');

    expect(diff.nodes.removed).toHaveLength(1);
    expect(diff.nodes.removed[0].id).toBe('b');

    expect(diff.nodes.updated).toHaveLength(1);
    expect(diff.nodes.updated[0].id).toBe('a');
    expect(diff.nodes.updated[0].old).toEqual({ label: 'A' });
    expect(diff.nodes.updated[0].new).toEqual({ label: 'A-updated' });
  });

  it('detects added, removed, and updated edges', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());

    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.added[0].id).toBe('e3');

    expect(diff.edges.removed).toHaveLength(1);
    expect(diff.edges.removed[0].id).toBe('e1');

    expect(diff.edges.updated).toHaveLength(1);
    expect(diff.edges.updated[0].id).toBe('e2');
    expect(diff.edges.updated[0].old).toEqual({
      sourceId: 'b',
      targetId: 'c',
      label: '',
    });
    expect(diff.edges.updated[0].new).toEqual({
      sourceId: 'c',
      targetId: 'd',
      label: 'changed',
    });
  });

  it('returns empty diff for identical graphs', () => {
    const g = makeGraphA();
    const diff = getDiff(g, g);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('returns empty diff for equivalent graphs', () => {
    const diff = getDiff(makeGraphA(), makeGraphA());
    expect(isEmptyDiff(diff)).toBe(true);
  });
});

describe('isEmptyDiff', () => {
  it('returns true for empty diff', () => {
    const diff = getDiff(makeGraphA(), makeGraphA());
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('returns false when there are changes', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());
    expect(isEmptyDiff(diff)).toBe(false);
  });
});

describe('invertDiff', () => {
  it('swaps added and removed', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());
    const inv = invertDiff(diff);

    expect(inv.nodes.added).toBe(diff.nodes.removed);
    expect(inv.nodes.removed).toBe(diff.nodes.added);
    expect(inv.edges.added).toBe(diff.edges.removed);
    expect(inv.edges.removed).toBe(diff.edges.added);
  });

  it('swaps old and new in updates', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());
    const inv = invertDiff(diff);

    for (let i = 0; i < diff.nodes.updated.length; i++) {
      expect(inv.nodes.updated[i].old).toEqual(diff.nodes.updated[i].new);
      expect(inv.nodes.updated[i].new).toEqual(diff.nodes.updated[i].old);
    }
  });
});

describe('getPatches', () => {
  it('returns patches in safe order', () => {
    const patches = getPatches(makeGraphA(), makeGraphB());
    const ops = patches.map((p) => p.op);

    // Node adds before edge updates (new nodes needed for updated endpoints)
    const addNodeIdx = ops.indexOf('addNode');
    const updateEdgeIdx = ops.indexOf('updateEdge');
    if (addNodeIdx !== -1 && updateEdgeIdx !== -1) {
      expect(addNodeIdx).toBeLessThan(updateEdgeIdx);
    }

    // Edge updates before node deletes (avoid cascade removing updated edges)
    const deleteNodeIdx = ops.indexOf('deleteNode');
    if (updateEdgeIdx !== -1 && deleteNodeIdx !== -1) {
      expect(updateEdgeIdx).toBeLessThan(deleteNodeIdx);
    }

    // Edge deletes before node deletes
    const deleteEdgeIdx = ops.indexOf('deleteEdge');
    if (deleteEdgeIdx !== -1 && deleteNodeIdx !== -1) {
      expect(deleteEdgeIdx).toBeLessThan(deleteNodeIdx);
    }

    // Node adds before edge adds
    const addEdgeIdx = ops.indexOf('addEdge');
    if (addNodeIdx !== -1 && addEdgeIdx !== -1) {
      expect(addNodeIdx).toBeLessThan(addEdgeIdx);
    }
  });

  it('returns empty array for identical graphs', () => {
    const patches = getPatches(makeGraphA(), makeGraphA());
    expect(patches).toHaveLength(0);
  });
});

describe('applyPatches', () => {
  it('transforms graph a into graph b', () => {
    const a = makeGraphA();
    const b = makeGraphB();
    const patches = getPatches(a, b);

    const target = makeGraphA();
    applyPatches(target, patches);

    expect(target.nodes.map((n) => n.id).sort()).toEqual(
      b.nodes.map((n) => n.id).sort(),
    );
    expect(target.edges.map((e) => e.id).sort()).toEqual(
      b.edges.map((e) => e.id).sort(),
    );

    // Check updated values
    const nodeA = target.nodes.find((n) => n.id === 'a')!;
    expect(nodeA.label).toBe('A-updated');

    const edgeE2 = target.edges.find((e) => e.id === 'e2')!;
    expect(edgeE2.sourceId).toBe('c');
    expect(edgeE2.targetId).toBe('d');
    expect(edgeE2.label).toBe('changed');
  });

  it('handles add-only patches', () => {
    const a = createGraph({ id: 'empty' });
    const b = createGraph({
      id: 'empty',
      nodes: [{ id: 'x' }],
      edges: [],
    });
    const patches = getPatches(a, b);
    applyPatches(a, patches);

    expect(a.nodes).toHaveLength(1);
    expect(a.nodes[0].id).toBe('x');
  });

  it('handles delete-only patches', () => {
    const a = createGraph({
      id: 'test',
      nodes: [{ id: 'x' }, { id: 'y' }],
      edges: [{ id: 'e', sourceId: 'x', targetId: 'y' }],
    });
    const b = createGraph({ id: 'test' });
    const patches = getPatches(a, b);
    applyPatches(a, patches);

    expect(a.nodes).toHaveLength(0);
    expect(a.edges).toHaveLength(0);
  });
});

describe('invertPatches', () => {
  it('add↔delete node inversion', () => {
    const patches = invertPatches([
      { op: 'addNode', node: { id: 'x' } },
    ]);
    expect(patches).toHaveLength(1);
    expect(patches[0].op).toBe('deleteNode');
  });

  it('add↔delete edge inversion', () => {
    const patches = invertPatches([
      { op: 'addEdge', edge: { id: 'e', sourceId: 'a', targetId: 'b' } },
    ]);
    expect(patches).toHaveLength(1);
    expect(patches[0].op).toBe('deleteEdge');
  });

  it('reverses patch order', () => {
    const patches = invertPatches([
      { op: 'addNode', node: { id: 'x' } },
      { op: 'addNode', node: { id: 'y' } },
    ]);
    expect(patches[0].op).toBe('deleteNode');
    expect((patches[0] as any).node.id).toBe('y');
    expect((patches[1] as any).node.id).toBe('x');
  });
});

describe('toPatches / toDiff conversion', () => {
  it('toPatches produces correct patch list from diff', () => {
    const diff = getDiff(makeGraphA(), makeGraphB());
    const patches = toPatches(diff);

    expect(patches.length).toBeGreaterThan(0);

    const addNodes = patches.filter((p) => p.op === 'addNode');
    const deleteNodes = patches.filter((p) => p.op === 'deleteNode');
    const updateNodes = patches.filter((p) => p.op === 'updateNode');

    expect(addNodes).toHaveLength(1);
    expect(deleteNodes).toHaveLength(1);
    expect(updateNodes).toHaveLength(1);
  });

  it('toDiff groups patches into structured diff', () => {
    const patches = getPatches(makeGraphA(), makeGraphB());
    const diff = toDiff(patches);

    expect(diff.nodes.added).toHaveLength(1);
    expect(diff.nodes.removed).toHaveLength(1);
    expect(diff.nodes.updated).toHaveLength(1);
    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.removed).toHaveLength(1);
    expect(diff.edges.updated).toHaveLength(1);
  });
});

describe('round-trip', () => {
  it('getDiff → toPatches → applyPatches reproduces target graph', () => {
    const a = makeGraphA();
    const b = makeGraphB();
    const diff = getDiff(a, b);
    const patches = toPatches(diff);

    const target = makeGraphA();
    applyPatches(target, patches);

    const finalDiff = getDiff(target, b);
    expect(isEmptyDiff(finalDiff)).toBe(true);
  });

  it('getPatches → applyPatches reproduces target graph', () => {
    const a = makeGraphA();
    const b = makeGraphB();
    const patches = getPatches(a, b);

    const target = makeGraphA();
    applyPatches(target, patches);

    const finalDiff = getDiff(target, b);
    expect(isEmptyDiff(finalDiff)).toBe(true);
  });
});
