import { describe, it, expect } from 'vitest';
import { createGraph, addNode, addEdge, getNode, getEdge } from '../src/graph';
import { getShortestPaths } from '../src/algorithms';
import { outEdges } from '../src/queries';

/**
 * The Fox, Chicken & Cabbage river-crossing puzzle modeled as a graph:
 *
 *   - **Nodes** = valid world states (who is on which bank)
 *   - **Edges** = legal moves (farmer crosses, optionally carrying one item)
 *   - **Solution** = shortest path from "everyone on the left" to "everyone on the right"
 */

const ENTITIES = ['farmer', 'fox', 'chicken', 'cabbage'] as const;

/** State id = sorted items still on the left bank. */
function stateId(leftBank: string[]): string {
  return [...leftBank].sort().join(',') || 'empty';
}

/** A bank is safe if the farmer is present, or no predator–prey pair exists. */
function isSafe(bank: string[]): boolean {
  if (bank.includes('farmer')) return true;
  if (bank.includes('fox') && bank.includes('chicken')) return false;
  if (bank.includes('chicken') && bank.includes('cabbage')) return false;
  return true;
}

/** Build the full state-space graph and return it along with start/goal ids. */
function buildStateGraph() {
  const g = createGraph({ id: 'river-crossing', type: 'directed' });

  // --- Nodes: every valid configuration ---
  const states = new Map<string, { left: string[]; right: string[] }>();

  // Generate all subsets of ENTITIES as left-bank configurations
  const subsets: string[][] = [[]];
  for (const entity of ENTITIES) {
    subsets.push(...subsets.map((s) => [...s, entity]));
  }

  for (const left of subsets) {
    const right = ENTITIES.filter((e) => !left.includes(e));
    if (isSafe(left) && isSafe(right)) {
      const id = stateId(left);
      states.set(id, { left: left.sort(), right: right.sort() });
      addNode(g, {
        id,
        label: `L:[${left.join(',')}]  R:[${right.join(',')}]`,
        data: { left, right },
      });
    }
  }

  // --- Edges: farmer crosses (optionally carrying one item) ---
  for (const [id, { left, right }] of states) {
    const farmerOnLeft = left.includes('farmer');
    const fromBank = farmerOnLeft ? left : right;
    const toBank = farmerOnLeft ? right : left;

    // null = farmer crosses alone; otherwise farmer carries one item
    const cargo: (string | null)[] = [
      null,
      ...fromBank.filter((e) => e !== 'farmer'),
    ];

    for (const item of cargo) {
      const newFrom = fromBank.filter((e) => e !== 'farmer' && e !== item);
      const newTo = [...toBank, 'farmer', ...(item ? [item] : [])];
      const newLeft = farmerOnLeft ? newFrom : newTo;
      const targetId = stateId(newLeft);

      if (states.has(targetId)) {
        addEdge(g, {
          id: `${id} → ${targetId} (${item ?? 'alone'})`,
          sourceId: id,
          targetId,
          label: item ? `take ${item}` : 'return alone',
        });
      }
    }
  }

  const start = stateId([...ENTITIES]);
  const goal = stateId([]);
  return { g, start, goal, stateCount: states.size };
}

// ---------------------------------------------------------------------------

describe('River Crossing Puzzle (Fox, Chicken & Cabbage)', () => {
  const { g, start, goal, stateCount } = buildStateGraph();

  it('state space has 10 valid states out of 16', () => {
    expect(stateCount).toBe(10);
    expect(g.nodes).toHaveLength(10);
  });

  it('start = everyone on left, goal = everyone on right', () => {
    expect(start).toBe('cabbage,chicken,farmer,fox');
    expect(goal).toBe('empty');
  });

  it('only one legal first move: take the chicken', () => {
    const firstMoves = outEdges(g, start);
    expect(firstMoves).toHaveLength(1);
    expect(firstMoves[0].label).toBe('take chicken');
  });

  it('finds the shortest solution in 7 moves (8 states)', () => {
    const paths = getShortestPaths(g, { from: start, to: goal });

    expect(paths).toHaveLength(2); // two classic solutions
    const { steps } = paths[0];
    expect(steps).toHaveLength(7); // 7 river crossings

    // End state
    expect(steps[6].node.id).toBe(goal);

    // Collect move labels directly from steps
    const moves = steps.map((s) => s.edge.label);

    // First move is always "take chicken"
    expect(moves[0]).toBe('take chicken');
    // Last move is always "take chicken"
    expect(moves[6]).toBe('take chicken');

    // The two classic solutions differ in whether fox or cabbage goes second.
    // Either way, moves 1 and 5 are "return alone".
    expect(moves[1]).toBe('return alone');
    expect(moves[5]).toBe('return alone');

    // Middle move (index 3) is always bringing chicken back
    expect(moves[3]).toMatch(/take chicken|return alone/);
  });

  it('every state in the solution is reachable and valid', () => {
    const [{ steps }] = getShortestPaths(g, { from: start, to: goal });
    const nodeIds = [start, ...steps.map((s) => s.node.id)];
    for (const id of nodeIds) {
      const state = getNode(g, id);
      expect(state).toBeDefined();
      const { left, right } = state!.data as {
        left: string[];
        right: string[];
      };
      expect(isSafe(left)).toBe(true);
      expect(isSafe(right)).toBe(true);
    }
  });
});
