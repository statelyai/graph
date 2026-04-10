import type { Graph, GraphNode, TraversalOptions } from '../types';
import { getIndex } from '../indexing';
import { getNeighborIds, resolveFrom } from './shared';

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
  const stack = [startId];

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const next = getNeighborIds(graph, top).find((id) => !visited.has(id));

    if (next === undefined) {
      stack.pop();
      continue;
    }

    visited.add(next);
    stack.push(next);
    const ni = idx.nodeById.get(next);
    if (ni !== undefined) result.push(graph.nodes[ni]);
  }

  return result;
}

export function getPostorder<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return [];

  const visited = new Set<string>([startId]);
  const result: GraphNode<N>[] = [];
  const stack = [startId];

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const next = getNeighborIds(graph, top).find((id) => !visited.has(id));

    if (next === undefined) {
      stack.pop();
      const ni = idx.nodeById.get(top);
      if (ni !== undefined) result.push(graph.nodes[ni]);
      continue;
    }

    visited.add(next);
    stack.push(next);
  }

  return result;
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
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  const startNode = startNi !== undefined ? graph.nodes[startNi] : undefined;
  if (!startNode) return;

  type Frame = {
    visited: Set<string>;
    preorder: GraphNode<N>[];
    dfsStack: string[];
  };

  const queue: Frame[] = [
    { visited: new Set([startId]), preorder: [startNode], dfsStack: [startId] },
  ];

  while (queue.length > 0) {
    const frame = queue.pop()!;
    const { visited, dfsStack } = frame;
    let { preorder } = frame;

    let branched = false;
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      const unvisited = getNeighborIds(graph, top).filter(
        (id) => !visited.has(id),
      );

      if (unvisited.length === 0) {
        dfsStack.pop();
        continue;
      }

      for (const nextId of unvisited) {
        const ni = idx.nodeById.get(nextId);
        if (ni === undefined) continue;
        const newVisited = new Set(visited);
        newVisited.add(nextId);
        queue.push({
          visited: newVisited,
          preorder: [...preorder, graph.nodes[ni]],
          dfsStack: [...dfsStack, nextId],
        });
      }
      branched = true;
      break;
    }

    if (!branched) {
      yield preorder;
    }
  }
}

export function* genPostorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): Generator<GraphNode<N>[]> {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return;

  type Frame = {
    visited: Set<string>;
    postorder: GraphNode<N>[];
    dfsStack: string[];
  };

  const queue: Frame[] = [
    { visited: new Set([startId]), postorder: [], dfsStack: [startId] },
  ];

  while (queue.length > 0) {
    const frame = queue.pop()!;
    const { visited, dfsStack } = frame;
    let { postorder } = frame;

    let branched = false;
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      const unvisited = getNeighborIds(graph, top).filter(
        (id) => !visited.has(id),
      );

      if (unvisited.length === 0) {
        dfsStack.pop();
        const ni = idx.nodeById.get(top);
        if (ni !== undefined) postorder = [...postorder, graph.nodes[ni]];
        continue;
      }

      for (const nextId of unvisited) {
        const ni = idx.nodeById.get(nextId);
        if (ni === undefined) continue;
        const newVisited = new Set(visited);
        newVisited.add(nextId);
        queue.push({
          visited: newVisited,
          postorder: [...postorder],
          dfsStack: [...dfsStack, nextId],
        });
      }
      branched = true;
      break;
    }

    if (!branched) {
      yield postorder;
    }
  }
}
