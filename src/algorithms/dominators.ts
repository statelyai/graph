import type { Graph } from '../types';
import { getIndex } from '../indexing';
import { getNeighborEdges, resolveFrom } from './shared';

export interface DominatorTreeOptions {
  /**
   * Root node id. Defaults to `graph.initialNodeId`, then to the unique
   * zero-in-degree node.
   */
  from?: string;
}

/**
 * Returns the dominator tree of the graph rooted at `from`, computed with
 * the Cooper–Harvey–Kennedy iterative algorithm.
 *
 * Each reachable node maps to its immediate dominator's id; the root maps
 * to `null`. Unreachable nodes are omitted. Traversal is mode-aware:
 * undirected/bidirectional edges are traversable both ways.
 *
 * For statecharts this answers "which states must every path from the
 * initial state pass through to reach this state?" — node `d` dominates
 * node `n` when every path from the initial state to `n` goes through `d`.
 *
 * @example
 * ```ts
 * // a→b, a→c, b→d, c→d (diamond)
 * getDominatorTree(graph, { from: 'a' });
 * // { a: null, b: 'a', c: 'a', d: 'a' }
 * ```
 */
export function getDominatorTree(
  graph: Graph,
  options?: DominatorTreeOptions,
): Record<string, string | null> {
  const root = resolveFrom(graph, options);
  const idx = getIndex(graph);
  if (!idx.nodeById.has(root)) {
    throw new Error(
      `getDominatorTree: root node "${root}" not found in graph — pass an existing node id as options.from`,
    );
  }

  // --- Reverse postorder over the reachable subgraph (mode-aware) ---
  const postorder: string[] = [];
  const visited = new Set<string>([root]);
  const stack: Array<{ id: string; neighborIndex: number }> = [
    { id: root, neighborIndex: 0 },
  ];
  const successors = new Map<string, string[]>();

  function getSuccessors(id: string): string[] {
    let succ = successors.get(id);
    if (!succ) {
      succ = getNeighborEdges(graph, id).map((entry) => entry.neighborId);
      successors.set(id, succ);
    }
    return succ;
  }

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const succ = getSuccessors(frame.id);
    if (frame.neighborIndex < succ.length) {
      const next = succ[frame.neighborIndex++];
      if (!visited.has(next)) {
        visited.add(next);
        stack.push({ id: next, neighborIndex: 0 });
      }
    } else {
      postorder.push(frame.id);
      stack.pop();
    }
  }

  const rpo = [...postorder].reverse();
  const rpoNumber = new Map<string, number>(rpo.map((id, i) => [id, i]));

  // Predecessors within the reachable set (mode-aware)
  const predecessors = new Map<string, string[]>(rpo.map((id) => [id, []]));
  for (const id of rpo) {
    for (const succ of getSuccessors(id)) {
      if (visited.has(succ)) {
        predecessors.get(succ)!.push(id);
      }
    }
  }

  // --- Cooper–Harvey–Kennedy iteration ---
  const idom = new Map<string, string>();
  idom.set(root, root);

  function intersect(a: string, b: string): string {
    let f1 = a;
    let f2 = b;
    while (f1 !== f2) {
      while (rpoNumber.get(f1)! > rpoNumber.get(f2)!) {
        f1 = idom.get(f1)!;
      }
      while (rpoNumber.get(f2)! > rpoNumber.get(f1)!) {
        f2 = idom.get(f2)!;
      }
    }
    return f1;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of rpo) {
      if (id === root) continue;

      let newIdom: string | undefined;
      for (const pred of predecessors.get(id)!) {
        if (!idom.has(pred)) continue;
        newIdom = newIdom === undefined ? pred : intersect(pred, newIdom);
      }
      if (newIdom !== undefined && idom.get(id) !== newIdom) {
        idom.set(id, newIdom);
        changed = true;
      }
    }
  }

  const result: Record<string, string | null> = {};
  for (const id of rpo) {
    result[id] = id === root ? null : idom.get(id)!;
  }
  return result;
}
