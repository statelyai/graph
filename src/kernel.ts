/**
 * `@statelyai/graph/kernel` — the public fast-path kernel.
 *
 * Advanced, semver-stable primitives for third-party algorithm authors and
 * large-graph users. A plugin is just an npm package of standalone prefixed
 * functions taking `graph` first (like the built-ins), built on this kernel
 * for the fast path and {@link memoizeByGraph} for caching.
 *
 * **Invalidation contract** (inherited from `src/indexing.ts`):
 * array *replacement* (immutable-style `map`/`filter` update) and length
 * changes are auto-detected in O(1); mutating *fields* of an existing
 * node/edge in place (e.g. `edge.sourceId = 'x'`) is **not** detectable —
 * call {@link invalidateIndex} afterwards, or use the mutation API
 * (`addNode`/`updateEdge`/…), which keeps the index in sync.
 *
 * @module
 */

import type { Graph } from './types';
import { getIndex, invalidateIndex, type GraphIndex } from './indexing';
import { getCSR, type GraphCSR } from './algorithms/csr';

export { getIndex, invalidateIndex, getCSR };
export type { GraphIndex, GraphCSR };

/** Per-graph-index memoization store. */
interface MemoEntry<R> {
  /** The index `version` these results were computed against. */
  version: number;
  /** argsKey → memoized result */
  results: Map<string, R>;
}

/**
 * Wrap a `(graph, ...args) => R` function so repeated calls on an **unchanged**
 * graph return a cached result in O(1). Any structural mutation bumps the
 * index `version` (see the module invalidation contract) and transparently
 * invalidates the cache; the next call recomputes.
 *
 * The cache is a {@link WeakMap} keyed on the graph's {@link GraphIndex} object
 * (via {@link getIndex}), so entries are garbage-collected with the graph and
 * different graphs never share results. Within one index, results are keyed by
 * an `argsKey` — `options.key(...args)` if provided, else `JSON.stringify(args)`.
 *
 * **The library itself never pre-memoizes algorithm results — callers opt in.**
 *
 * @param fn The function to memoize. Its first parameter must be the `graph`.
 * @param options.key Custom key derived from the trailing args (everything
 *   after `graph`). **Required** when any arg is non-JSON-serializable (a
 *   function, class instance, `AbortSignal`, etc.); the default
 *   `JSON.stringify(args)` cannot key on those and would collide or throw.
 *
 * @example
 * ```ts
 * import { memoizeByGraph } from '@statelyai/graph/kernel';
 * import { getBetweennessCentrality } from '@statelyai/graph';
 *
 * const betweenness = memoizeByGraph(getBetweennessCentrality);
 * betweenness(graph);          // computes
 * betweenness(graph);          // cached — same graph, same args
 * addEdge(graph, { … });       // bumps version
 * betweenness(graph);          // recomputes
 *
 * // Non-serializable arg → supply a custom key:
 * const withSignal = memoizeByGraph(getPageRank, {
 *   key: (opts) => String(opts?.dampingFactor ?? 0.85),
 * });
 * ```
 */
export function memoizeByGraph<Args extends unknown[], R>(
  fn: (graph: Graph, ...args: Args) => R,
  options?: { key?: (...args: Args) => string },
): (graph: Graph, ...args: Args) => R {
  const cache = new WeakMap<GraphIndex, MemoEntry<R>>();
  const keyFn = options?.key;

  return (graph: Graph, ...args: Args): R => {
    const idx = getIndex(graph);
    let entry = cache.get(idx);

    if (!entry || entry.version !== idx.version) {
      // Stale (or absent) — the index describes a different graph state.
      entry = { version: idx.version, results: new Map<string, R>() };
      cache.set(idx, entry);
    }

    const argsKey = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (entry.results.has(argsKey)) {
      return entry.results.get(argsKey)!;
    }

    const result = fn(graph, ...args);
    entry.results.set(argsKey, result);
    return result;
  };
}
