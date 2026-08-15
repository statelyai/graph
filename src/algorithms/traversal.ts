import type {
  Graph,
  GraphNode,
  TraversalDirection,
  TraversalSearchOptions,
} from '../types';
import { getIndex } from '../indexing';
import {
  getEffectiveModeKind,
  getNeighborIds,
  getSuccessorIds,
} from './shared';
import { getEdgeMode } from '../mode';
import { genCycles, getStronglyConnectedComponents } from './paths';
import { getCSR } from './csr';
import { getSubgraph } from '../transforms';

function getTraversalOptions(
  startOrOptions: string | TraversalSearchOptions,
): Required<TraversalSearchOptions> {
  const options =
    typeof startOrOptions === 'string'
      ? { from: startOrOptions }
      : startOrOptions;
  const radius = options.radius ?? Infinity;
  if (
    Number.isNaN(radius) ||
    radius < 0 ||
    (Number.isFinite(radius) && !Number.isInteger(radius))
  ) {
    throw new RangeError(
      'Traversal radius must be a non-negative integer or Infinity',
    );
  }
  return {
    from: options.from,
    direction: options.direction ?? 'outgoing',
    radius,
  };
}

function getStartPositions(
  indexOf: Map<string, number>,
  from: string | readonly string[],
): number[] {
  const positions: number[] = [];
  const seen = new Set<number>();
  for (const id of typeof from === 'string' ? [from] : from) {
    const position = indexOf.get(id);
    if (position !== undefined && !seen.has(position)) {
      seen.add(position);
      positions.push(position);
    }
  }
  return positions;
}

function getTraversalNeighbors(
  csr: ReturnType<typeof getCSR>,
  node: number,
  direction: TraversalDirection,
): number[] {
  const neighbors: number[] = [];
  if (direction !== 'incoming') {
    for (let i = csr.outOffsets[node]; i < csr.outOffsets[node + 1]; i++) {
      neighbors.push(csr.outTargets[i]);
    }
  }
  if (direction !== 'outgoing') {
    for (let i = csr.inOffsets[node]; i < csr.inOffsets[node + 1]; i++) {
      neighbors.push(csr.inOrigins[i]);
    }
  }
  return neighbors;
}

function getReachableWithinRadius(
  csr: ReturnType<typeof getCSR>,
  starts: readonly number[],
  direction: TraversalDirection,
  radius: number,
): Uint8Array {
  const reached = new Uint8Array(csr.ids.length);
  const depths = new Float64Array(csr.ids.length);
  const queue = new Int32Array(csr.ids.length);
  let head = 0;
  let tail = 0;
  for (const start of starts) {
    reached[start] = 1;
    queue[tail++] = start;
  }

  while (head < tail) {
    const node = queue[head++];
    if (depths[node] >= radius) continue;
    for (const neighbor of getTraversalNeighbors(csr, node, direction)) {
      if (reached[neighbor]) continue;
      reached[neighbor] = 1;
      depths[neighbor] = depths[node] + 1;
      queue[tail++] = neighbor;
    }
  }
  return reached;
}

export function* genBFS<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  const csr = getCSR(graph);
  const options = getTraversalOptions(startOrOptions);
  const starts = getStartPositions(csr.indexOf, options.from);
  if (starts.length === 0) return;

  const n = csr.ids.length;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  const depths = new Float64Array(n);
  let head = 0;
  let tail = 0;
  for (const start of starts) {
    visited[start] = 1;
    queue[tail++] = start;
  }

  while (head < tail) {
    const u = queue[head++];
    yield graph.nodes[u];
    if (depths[u] >= options.radius) continue;

    for (const v of getTraversalNeighbors(csr, u, options.direction)) {
      if (!visited[v]) {
        visited[v] = 1;
        depths[v] = depths[u] + 1;
        queue[tail++] = v;
      }
    }
  }
}

/**
 * @deprecated Use {@link genBFS}.
 */
export function* bfs<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  yield* genBFS(graph, startOrOptions);
}

export function* genDFS<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  const csr = getCSR(graph);
  const options = getTraversalOptions(startOrOptions);
  const starts = getStartPositions(csr.indexOf, options.from);
  if (starts.length === 0) return;

  const reached =
    options.radius === Infinity
      ? undefined
      : getReachableWithinRadius(
          csr,
          starts,
          options.direction,
          options.radius,
        );
  const visited = new Uint8Array(csr.ids.length);
  const stack: number[] = [];
  for (let i = starts.length - 1; i >= 0; i--) {
    stack.push(starts[i]);
  }

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited[node]) continue;
    visited[node] = 1;
    yield graph.nodes[node];

    for (const neighbor of getTraversalNeighbors(
      csr,
      node,
      options.direction,
    )) {
      if (!visited[neighbor] && (reached === undefined || reached[neighbor])) {
        stack.push(neighbor);
      }
    }
  }
}

/**
 * @deprecated Use {@link genDFS}.
 */
export function* dfs<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  yield* genDFS(graph, startOrOptions);
}

export function isAcyclic(graph: Graph): boolean {
  // Dispatch on *effective* edge modes (per-edge overrides included).
  const kind = getEffectiveModeKind(graph);
  if (kind === 'mixed') {
    return isAcyclicMixed(graph);
  }
  if (kind === 'non-directed') {
    return isAcyclicUndirected(graph);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) color.set(node.id, WHITE);

  const hasCycle = (id: string): boolean => {
    color.set(id, GRAY);
    for (const neighborId of getSuccessorIds(graph, id)) {
      const current = color.get(neighborId);
      if (current === GRAY) return true;
      if (current === WHITE && hasCycle(neighborId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE && hasCycle(node.id)) return false;
  }
  return true;
}

/**
 * Acyclicity for graphs mixing directed and non-directed edges.
 *
 * Polynomial fast paths first: a cycle among directed edges alone, a cycle
 * among non-directed edges alone (union-find), or all-singleton reachability
 * SCCs (then no mixed cycle can exist either). Only ambiguous multi-node
 * SCCs fall back to exact simple-cycle enumeration, restricted to that SCC.
 */
function isAcyclicMixed(graph: Graph): boolean {
  const idx = getIndex(graph);

  // (1) Cycle using only effective-directed edges
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) color.set(node.id, WHITE);
  const hasDirectedCycle = (id: string): boolean => {
    color.set(id, GRAY);
    for (const eid of idx.outEdges.get(id) ?? []) {
      const edge = graph.edges[idx.edgeById.get(eid)!];
      if (getEdgeMode(graph, edge) !== 'directed') continue;
      const current = color.get(edge.targetId);
      if (current === GRAY) return true;
      if (current === WHITE && hasDirectedCycle(edge.targetId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE && hasDirectedCycle(node.id)) return false;
  }

  // (2) Cycle using only non-directed edges (union-find: a non-directed edge
  // joining an already-connected pair, or a non-directed self-loop)
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const node of graph.nodes) parent.set(node.id, node.id);
  for (const edge of graph.edges) {
    if (getEdgeMode(graph, edge) === 'directed') continue;
    if (edge.sourceId === edge.targetId) return false;
    const rootA = find(edge.sourceId);
    const rootB = find(edge.targetId);
    if (rootA === rootB) return false;
    parent.set(rootA, rootB);
  }

  // (3) Every simple cycle lies within one mutual-reachability SCC; if all
  // SCCs are singletons (self-loops were caught above), the graph is acyclic
  const multiNodeSccs = getStronglyConnectedComponents(graph).filter(
    (component) => component.length > 1,
  );
  if (multiNodeSccs.length === 0) return true;

  // (4) Exact enumeration, restricted to each ambiguous SCC
  for (const component of multiNodeSccs) {
    const subgraph = getSubgraph(
      graph,
      component.map((node) => node.id),
    );
    for (const _cycle of genCycles(subgraph)) return false;
  }
  return true;
}

function isAcyclicUndirected(graph: Graph): boolean {
  const idx = getIndex(graph);
  const visited = new Set<string>();

  const hasCycle = (id: string, parentId: string | null): boolean => {
    visited.add(id);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].targetId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }

    for (const eid of idx.inEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].sourceId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }

    return false;
  };

  for (const node of graph.nodes) {
    if (!visited.has(node.id) && hasCycle(node.id, null)) return false;
  }
  return true;
}

export function getConnectedComponents<N>(graph: Graph<N>): GraphNode<N>[][] {
  // Weakly-connected components: every edge connects regardless of mode, so
  // walk the CSR arcs in both directions (out arcs + in-arc origins).
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  const components: GraphNode<N>[][] = [];

  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    const component: GraphNode<N>[] = [];
    visited[s] = 1;
    queue[0] = s;
    let head = 0;
    let tail = 1;

    while (head < tail) {
      const u = queue[head++];
      component.push(graph.nodes[u]);

      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (!visited[v]) {
          visited[v] = 1;
          queue[tail++] = v;
        }
      }
      for (let a = csr.inOffsets[u]; a < csr.inOffsets[u + 1]; a++) {
        const v = csr.inOrigins[a];
        if (!visited[v]) {
          visited[v] = 1;
          queue[tail++] = v;
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Returns a topological ordering of the graph's nodes, or `null` if no such
 * ordering exists.
 *
 * Any edge whose effective mode (per {@link getEdgeMode}) is not `'directed'`
 * makes ordering impossible — an undirected/bidirectional edge is mutual
 * precedence, i.e. a 2-cycle — so the function returns `null`.
 */
export function getTopologicalSort<N>(graph: Graph<N>): GraphNode<N>[] | null {
  for (const edge of graph.edges) {
    if (getEdgeMode(graph, edge) !== 'directed') return null;
  }

  const idx = getIndex(graph);
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) inDegree.set(node.id, 0);
  for (const edge of graph.edges) {
    inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: GraphNode<N>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const ni = idx.nodeById.get(id);
    if (ni !== undefined) result.push(graph.nodes[ni]);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const targetId = graph.edges[ai].targetId;
      const nextDegree = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, nextDegree);
      if (nextDegree === 0) queue.push(targetId);
    }
  }

  if (result.length !== graph.nodes.length) return null;
  return result;
}

export function hasPath(
  graph: Graph,
  sourceId: string,
  targetId: string,
): boolean {
  if (sourceId === targetId) return true;

  const visited = new Set<string>([sourceId]);
  const queue: string[] = [sourceId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const neighborId of getNeighborIds(graph, id)) {
      if (neighborId === targetId) return true;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return false;
}

export function isConnected(graph: Graph): boolean {
  if (graph.nodes.length === 0) return true;
  return getConnectedComponents(graph).length <= 1;
}

/**
 * Returns whether the graph is a tree: connected, acyclic, and with exactly
 * `nodes.length - 1` edges (so directed diamonds and parallel edges are not
 * trees). Empty and single-node graphs are considered trees.
 */
export function isTree(graph: Graph): boolean {
  if (graph.nodes.length === 0) return true;
  return (
    graph.edges.length === graph.nodes.length - 1 &&
    isConnected(graph) &&
    isAcyclic(graph)
  );
}
