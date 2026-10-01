import type {
  Graph,
  GraphNode,
  PostorderOptions,
  TraversalOptions,
} from '../types';
import { getGraphSnapshot, getIndex } from '../indexing';
import { getNeighborIds, resolveFrom } from './shared';
import { genPostorder } from './traversal';

export function getPreorder<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return [];

  const visited = new Set<string>([startId]);
  const result: GraphNode<N>[] = [graph.nodes[startNi]];
  // Each frame keeps its neighbor list and a cursor, so returning to a node
  // resumes where it left off instead of rescanning its neighbors.
  const stackNeighbors = [getNeighborIds(graph, startId)];
  const stackIndex = [0];

  while (stackNeighbors.length > 0) {
    const top = stackNeighbors.length - 1;
    const neighbors = stackNeighbors[top];
    if (stackIndex[top] === neighbors.length) {
      stackNeighbors.pop();
      stackIndex.pop();
      continue;
    }
    const next = neighbors[stackIndex[top]++];
    if (visited.has(next)) continue;
    visited.add(next);
    stackNeighbors.push(getNeighborIds(graph, next));
    stackIndex.push(0);
    const ni = idx.nodeById.get(next);
    if (ni !== undefined) result.push(graph.nodes[ni]);
  }

  return result;
}

export function getPostorder<N>(
  graph: Graph<N>,
  startOrOptions?: string | PostorderOptions,
): GraphNode<N>[] {
  if (typeof startOrOptions === 'string') {
    return [...genPostorder(graph, startOrOptions)];
  }
  const from = startOrOptions?.from ?? resolveFrom(graph);
  return [...genPostorder(graph, { ...startOrOptions, from })];
}

export function getPreorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[][] {
  return [...genPreorders(graph, opts)];
}

export function getPostorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[][] {
  return [...genPostorders(graph, opts)];
}

export function* genPreorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): Generator<GraphNode<N>[]> {
  yield* genDfsOrders(graph, opts, 'pre');
}

export function* genPostorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): Generator<GraphNode<N>[]> {
  yield* genDfsOrders(graph, opts, 'post');
}

/**
 * Enumerates every DFS order from the start node by backtracking over the
 * points where the deepest open node has several unvisited neighbors (the
 * last neighbor is explored first). State is shared and restored through an
 * undo log, so a forced step costs O(1) instead of copying the whole state;
 * neighbors with no node (dangling edges) are ignored.
 */
function* genDfsOrders<N>(
  graph: Graph<N>,
  opts: TraversalOptions | undefined,
  kind: 'pre' | 'post',
): Generator<GraphNode<N>[]> {
  graph = getGraphSnapshot(graph);
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  if (!idx.nodeById.has(startId)) return;
  const nodeOf = (id: string) => graph.nodes[idx.nodeById.get(id)!];

  const visited = new Set<string>([startId]);
  const order: GraphNode<N>[] = kind === 'pre' ? [nodeOf(startId)] : [];
  const dfsStack = [startId];
  // Undo log: [true, id] visited `id`; [false, id] popped `id` off the stack
  const log: Array<[visit: boolean, id: string]> = [];
  const choices: Array<{ candidates: string[]; next: number; logLength: number }> =
    [];

  const visit = (id: string) => {
    visited.add(id);
    dfsStack.push(id);
    if (kind === 'pre') order.push(nodeOf(id));
    log.push([true, id]);
  };
  const rollback = (logLength: number) => {
    while (log.length > logLength) {
      const [wasVisit, id] = log.pop()!;
      if (wasVisit) {
        visited.delete(id);
        dfsStack.pop();
        if (kind === 'pre') order.pop();
      } else {
        dfsStack.push(id);
        if (kind === 'post') order.pop();
      }
    }
  };

  for (;;) {
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      const unvisited = getNeighborIds(graph, top).filter(
        (id) => !visited.has(id) && idx.nodeById.has(id),
      );
      if (unvisited.length === 0) {
        dfsStack.pop();
        if (kind === 'post') order.push(nodeOf(top));
        log.push([false, top]);
      } else if (unvisited.length === 1) {
        visit(unvisited[0]);
      } else {
        const candidates = unvisited.reverse();
        choices.push({ candidates, next: 1, logLength: log.length });
        visit(candidates[0]);
      }
    }
    yield order.slice();

    // Backtrack to the deepest choice with an untried candidate
    let resumed = false;
    while (choices.length > 0 && !resumed) {
      const choice = choices[choices.length - 1];
      rollback(choice.logLength);
      if (choice.next < choice.candidates.length) {
        visit(choice.candidates[choice.next++]);
        resumed = true;
      } else {
        choices.pop();
      }
    }
    if (!resumed) return;
  }
}
