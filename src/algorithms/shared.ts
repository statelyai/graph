import type { Graph, GraphEdge } from '../types';
import { getIndex } from '../indexing';
import { getEdgeMode } from '../mode';

export class MinPriorityQueue<T> {
  private items: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;

    const first = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.items[current], this.items[parent]) >= 0) break;
      [this.items[current], this.items[parent]] = [
        this.items[parent],
        this.items[current],
      ];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (
        left < this.items.length &&
        this.compare(this.items[left], this.items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.compare(this.items[right], this.items[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === current) break;

      [this.items[current], this.items[smallest]] = [
        this.items[smallest],
        this.items[current],
      ];
      current = smallest;
    }
  }
}

export function getNeighborIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const ids: string[] = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) ids.push(graph.edges[ai].targetId);
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai === undefined) continue;
    const edge = graph.edges[ai];
    if (getEdgeMode(graph, edge) !== 'directed') {
      ids.push(edge.sourceId);
    }
  }
  return ids;
}

export function getSuccessorIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!].targetId);
}

export function resolveFrom(
  graph: Graph,
  opts?: { from?: string },
): string {
  if (opts?.from) return opts.from;
  if (graph.initialNodeId) return graph.initialNodeId;

  const inDeg = new Map<string, number>();
  for (const node of graph.nodes) inDeg.set(node.id, 0);
  for (const edge of graph.edges) {
    inDeg.set(edge.targetId, (inDeg.get(edge.targetId) ?? 0) + 1);
  }

  const roots = [...inDeg.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  if (roots.length === 1) return roots[0];

  throw new Error(
    'Cannot determine start node — provide opts.from or set graph.initialNodeId',
  );
}

export function getNeighborEdges(
  graph: Graph,
  nodeId: string,
): Array<{ neighborId: string; edge: GraphEdge }> {
  const idx = getIndex(graph);
  const result: Array<{ neighborId: string; edge: GraphEdge }> = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const edge = graph.edges[ai];
      result.push({ neighborId: edge.targetId, edge });
    }
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const edge = graph.edges[ai];
      if (getEdgeMode(graph, edge) !== 'directed') {
        result.push({ neighborId: edge.sourceId, edge });
      }
    }
  }
  return result;
}

export function getNeighborEdgesAll(
  graph: Graph,
  nodeId: string,
): Array<{ neighborId: string; edge: GraphEdge }> {
  const idx = getIndex(graph);
  const result: Array<{ neighborId: string; edge: GraphEdge }> = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const edge = graph.edges[ai];
      result.push({ neighborId: edge.targetId, edge });
    }
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const edge = graph.edges[ai];
      result.push({ neighborId: edge.sourceId, edge });
    }
  }
  return result;
}
