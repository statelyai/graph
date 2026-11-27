import type { Graph } from '../types';
import { getCSR, type GraphCSR } from './csr';

/**
 * Simple undirected projection of a graph: every edge connects its endpoints
 * regardless of mode or direction, parallel edges collapse, and self-loops
 * and dangling edges are dropped. Positions follow `graph.nodes`.
 */
export interface SimpleUndirectedAdjacency {
  ids: string[];
  indexOf: Map<string, number>;
  /** Distinct neighbor positions per node (no self). */
  neighbors: Set<number>[];
}

const cache = new WeakMap<GraphCSR, SimpleUndirectedAdjacency>();

/** Cached per CSR snapshot, so it inherits the index staleness contract. */
export function getSimpleUndirectedAdjacency(
  graph: Graph,
): SimpleUndirectedAdjacency {
  const csr = getCSR(graph);
  const cached = cache.get(csr);
  if (cached) return cached;
  const n = csr.ids.length;
  const neighbors = Array.from({ length: n }, () => new Set<number>());
  for (const edge of graph.edges) {
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined || s === t) continue;
    neighbors[s].add(t);
    neighbors[t].add(s);
  }
  const result = { ids: csr.ids, indexOf: csr.indexOf, neighbors };
  cache.set(csr, result);
  return result;
}
