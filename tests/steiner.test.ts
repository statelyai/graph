import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { getSteinerTree } from '../src/algorithms/steiner';

function totalWeight(
  edges: ReadonlyArray<{ weight?: number }>,
): number {
  return edges.reduce((sum, e) => sum + (e.weight ?? 1), 0);
}

describe('getSteinerTree', () => {
  it('single terminal → empty edge set', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 1 },
      ],
    });
    const tree = getSteinerTree(g, { terminals: ['a'] });
    expect(tree.edges).toHaveLength(0);
    expect(tree.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('throws for an unknown terminal', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(() => getSteinerTree(g, { terminals: ['a', 'zzz'] })).toThrow();
  });

  it('throws when terminals are not connected', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(() => getSteinerTree(g, { terminals: ['a', 'c' ] })).toThrow();
  });

  it('all-nodes-are-terminals → equals the graph MST', () => {
    // On a graph where every node is a terminal, the Steiner tree is an MST.
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 2 },
        { id: 'e3', sourceId: 'c', targetId: 'd', weight: 3 },
        { id: 'e4', sourceId: 'a', targetId: 'd', weight: 4 },
        { id: 'e5', sourceId: 'a', targetId: 'c', weight: 5 },
      ],
    });
    const tree = getSteinerTree(g, {
      terminals: ['a', 'b', 'c', 'd'],
    });
    // n-1 edges spanning all 4 nodes, minimum total weight = 1+2+3 = 6.
    expect(tree.nodes).toHaveLength(4);
    expect(tree.edges).toHaveLength(3);
    expect(totalWeight(tree.edges)).toBe(6);
  });

  it('uses a Steiner (non-terminal) node when it lowers total weight', () => {
    // Star: center s connects to a,b,c with weight 1 each. Terminals a,b,c.
    // Direct terminal edges are expensive (weight 10). Optimal Steiner tree
    // uses s (cost 3); MST restricted to only terminals would cost 20.
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 's' }],
      edges: [
        { id: 'sa', sourceId: 's', targetId: 'a', weight: 1 },
        { id: 'sb', sourceId: 's', targetId: 'b', weight: 1 },
        { id: 'sc', sourceId: 's', targetId: 'c', weight: 1 },
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 10 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 10 },
      ],
    });
    const tree = getSteinerTree(g, { terminals: ['a', 'b', 'c'] });
    expect(totalWeight(tree.edges)).toBe(3);
    // Steiner node s must be included.
    expect(tree.nodes.map((n) => n.id)).toContain('s');
    // All terminals present.
    for (const t of ['a', 'b', 'c']) {
      expect(tree.nodes.map((n) => n.id)).toContain(t);
    }
  });

  it('result is a tree spanning the terminals (no non-terminal leaves)', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'x' }, // dead-end Steiner candidate
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'e2', sourceId: 'b', targetId: 'c', weight: 1 },
        { id: 'e3', sourceId: 'b', targetId: 'x', weight: 1 },
      ],
    });
    const tree = getSteinerTree(g, { terminals: ['a', 'c'] });
    const ids = tree.nodes.map((n) => n.id);
    // The dead-end x is a non-terminal leaf and must be pruned.
    expect(ids).not.toContain('x');
    // It is a tree: edges = nodes - 1.
    expect(tree.edges.length).toBe(tree.nodes.length - 1);
    for (const t of ['a', 'c']) expect(ids).toContain(t);
  });

  it('cost is within 2× of optimal on a verifiable instance', () => {
    // Grid-like instance with a known optimal Steiner tree.
    // Terminals at the 4 corners of a plus-shaped graph through center s.
    const g = createGraph({
      mode: 'undirected',
      nodes: [
        { id: 'n' },
        { id: 'e' },
        { id: 's' },
        { id: 'w' },
        { id: 'c' }, // center
      ],
      edges: [
        { id: 'cn', sourceId: 'c', targetId: 'n', weight: 1 },
        { id: 'ce', sourceId: 'c', targetId: 'e', weight: 1 },
        { id: 'cs', sourceId: 'c', targetId: 's', weight: 1 },
        { id: 'cw', sourceId: 'c', targetId: 'w', weight: 1 },
        { id: 'ne', sourceId: 'n', targetId: 'e', weight: 3 },
        { id: 'es', sourceId: 'e', targetId: 's', weight: 3 },
        { id: 'sw', sourceId: 's', targetId: 'w', weight: 3 },
        { id: 'wn', sourceId: 'w', targetId: 'n', weight: 3 },
      ],
    });
    const optimal = 4; // star through center: n,e,s,w each 1 = 4
    const tree = getSteinerTree(g, { terminals: ['n', 'e', 's', 'w'] });
    expect(totalWeight(tree.edges)).toBeLessThanOrEqual(2 * optimal);
    // On this instance the 2-approx finds the true optimum.
    expect(totalWeight(tree.edges)).toBe(optimal);
  });
});
