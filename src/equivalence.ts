import type { GraphNode, GraphEdge } from './types';

/** Shallow-compare two values, returning true if they differ. */
function differs(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (a == null || b == null) return a !== b;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) !== JSON.stringify(b);
  }
  return true;
}

export const LAYOUT_KEYS = {
  node: ['x', 'y', 'width', 'height', 'style', 'color', 'shape'] as const,
  edge: [
    'x',
    'y',
    'width',
    'height',
    'points',
    'routing',
    'style',
    'color',
  ] as const,
};

const LAYOUT_KEY_SET = {
  node: new Set<string>(LAYOUT_KEYS.node),
  edge: new Set<string>(LAYOUT_KEYS.edge),
};

/**
 * Compare two entities on a given set of keys.
 * If `keys` is omitted or empty, compares all own keys of `a`.
 *
 * @example
 * ```ts
 * import { createGraphNode, areEntitiesEqual, LAYOUT_KEYS } from '@statelyai/graph';
 *
 * const a = createGraphNode({ id: 'n1', label: 'hello', x: 0 });
 * const b = createGraphNode({ id: 'n1', label: 'hello', x: 100 });
 *
 * areEntitiesEqual(a, b, LAYOUT_KEYS.node); // false (x differs)
 * areEntitiesEqual(a, b, NON_LAYOUT_KEYS.node); // true
 * areEntitiesEqual(a, b); // false (compares all keys)
 * ```
 */
export function areEntitiesEqual<T extends GraphNode | GraphEdge>(
  a: T,
  b: T,
  keys?: readonly (keyof T)[],
): boolean {
  // Union of both entities' keys so optional fields present on only one
  // side are compared (keeps the comparison symmetric).
  const compareKeys =
    keys && keys.length > 0
      ? keys
      : ([
          ...new Set([...Object.keys(a), ...Object.keys(b)]),
        ] as (keyof T)[]);
  for (const key of compareKeys) {
    if (differs(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Compare two entities on layout keys only (position, size, style, color, shape).
 *
 * @example
 * ```ts
 * import { createGraphNode, isLayoutEqual } from '@statelyai/graph';
 *
 * const a = createGraphNode({ id: 'n1', x: 0, y: 0 });
 * const b = createGraphNode({ id: 'n1', x: 100, y: 200 });
 *
 * isLayoutEqual(a, b); // false
 * ```
 */
export function isLayoutEqual<T extends GraphNode | GraphEdge>(
  a: T,
  b: T,
): boolean {
  return areEntitiesEqual(a, b, LAYOUT_KEYS[a.type] as readonly (keyof T)[]);
}

/**
 * Compare two entities on non-layout keys only (id, data, connections, labels, etc.).
 *
 * @example
 * ```ts
 * import { createGraphNode, isNonLayoutEqual } from '@statelyai/graph';
 *
 * const a = createGraphNode({ id: 'n1', label: 'hello', x: 0 });
 * const b = createGraphNode({ id: 'n1', label: 'hello', x: 100 });
 *
 * isNonLayoutEqual(a, b); // true (layout changed, but non-layout didn't)
 * ```
 */
export function isNonLayoutEqual<T extends GraphNode | GraphEdge>(
  a: T,
  b: T,
): boolean {
  const skip = LAYOUT_KEY_SET[a.type];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (skip.has(key)) continue;
    if (differs((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}
