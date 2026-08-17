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
import { getCSR, getEdgeListInDegrees } from './csr';
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

function getTraversalNodes<N>(graph: Graph<N>): GraphNode<N>[] {
  // The CSR carries a build-time snapshot of graph.nodes; reusing it keeps
  // in-flight iterators insulated from later structural mutations without a
  // per-iterator array copy (mutations rebuild the CSR for fresh iterators).
  return getCSR(graph).nodes as GraphNode<N>[];
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
    if (direction !== 'incoming') {
      for (let i = csr.outOffsets[node]; i < csr.outOffsets[node + 1]; i++) {
        const neighbor = csr.outTargets[i];
        if (reached[neighbor]) continue;
        reached[neighbor] = 1;
        depths[neighbor] = depths[node] + 1;
        queue[tail++] = neighbor;
      }
    }
    if (direction !== 'outgoing') {
      for (let i = csr.inOffsets[node]; i < csr.inOffsets[node + 1]; i++) {
        const neighbor = csr.inOrigins[i];
        if (reached[neighbor]) continue;
        reached[neighbor] = 1;
        depths[neighbor] = depths[node] + 1;
        queue[tail++] = neighbor;
      }
    }
  }
  return reached;
}

/**
 * Runtime base class providing the ES iterator-helper prototype (`.map`,
 * `.take`, …) when the host supports it. The traversal iterators below are
 * hand-rolled rather than generator functions: a plain `next()` method avoids
 * the generator resume machinery, which dominates full-graph traversals.
 * Setup stays lazy (first `next()` call) to match generator semantics —
 * including where validation errors are thrown.
 */
const IteratorBase = ((globalThis as any).Iterator ??
  class {}) as new () => object;

const DONE: IteratorReturnResult<undefined> = {
  value: undefined,
  done: true,
};

abstract class LazyTraversalIterator<N> extends IteratorBase {
  protected started = false;
  protected finished = false;
  protected csr!: ReturnType<typeof getCSR>;
  protected nodes!: GraphNode<N>[];
  protected direction!: TraversalDirection;
  protected radius!: number;
  protected starts!: number[];
  // Hot CSR views + direction flags, hoisted once at setup
  protected useOut = true;
  protected useIn = false;
  protected outOffsets!: Int32Array;
  protected outTargets!: Int32Array;
  protected inOffsets!: Int32Array;
  protected inOrigins!: Int32Array;

  constructor(
    protected graph: Graph<N>,
    private startOrOptions: string | TraversalSearchOptions,
  ) {
    super();
  }

  protected setup(): void {
    this.csr = getCSR(this.graph);
    this.nodes = getTraversalNodes(this.graph);
    const options = getTraversalOptions(this.startOrOptions);
    this.direction = options.direction;
    this.radius = options.radius;
    this.starts = getStartPositions(this.csr.indexOf, options.from);
    this.useOut = options.direction !== 'incoming';
    this.useIn = options.direction !== 'outgoing';
    this.outOffsets = this.csr.outOffsets;
    this.outTargets = this.csr.outTargets;
    this.inOffsets = this.csr.inOffsets;
    this.inOrigins = this.csr.inOrigins;
    this.onSetup();
  }

  protected abstract onSetup(): void;
  abstract next(): IteratorResult<GraphNode<N>, undefined>;

  /**
   * Drop any buffered output. Subclasses with fast serve paths that bypass
   * the `finished` flag override this so a closed iterator (via `return()`
   * or `throw()`) cannot keep serving, matching generator semantics.
   */
  protected close(): void {}

  return(value?: undefined): IteratorResult<GraphNode<N>, undefined> {
    this.close();
    this.finished = true;
    return { value, done: true };
  }

  throw(error?: unknown): IteratorResult<GraphNode<N>, undefined> {
    this.close();
    this.finished = true;
    throw error;
  }

  [Symbol.iterator](): this {
    return this;
  }
}

/**
 * Traversal iterators batch work in chunks so a full traversal pays no
 * per-yield overhead, while the chunk *ramps up* (INITIAL_CHUNK, doubling to
 * MAX_CHUNK) so an early-exiting consumer stays effectively lazy: the first
 * `next()` does ~8 nodes of work, not a full batch. The yield sequence is
 * unchanged either way — batching only moves *when* neighbor expansion runs,
 * never its order.
 */
const INITIAL_CHUNK = 8;
const MAX_CHUNK = 1024;

class BfsIterator<N> extends LazyTraversalIterator<N> {
  private visited!: Uint8Array;
  private queue!: Int32Array;
  private depths: Int32Array | undefined;
  private head = 0;
  private tail = 0;
  private expandCursor = 0;
  private chunk = INITIAL_CHUNK;

  protected onSetup(): void {
    const n = this.csr.ids.length;
    this.visited = new Uint8Array(n);
    this.queue = new Int32Array(n);
    // Depth tracking is only needed for finite radii
    this.depths = this.radius === Infinity ? undefined : new Int32Array(n);
    for (const start of this.starts) {
      this.visited[start] = 1;
      this.queue[this.tail++] = start;
    }
  }

  private expandChunk(): void {
    const visited = this.visited;
    const queue = this.queue;
    const depths = this.depths;
    const outOffsets = this.outOffsets;
    const outTargets = this.outTargets;
    const inOffsets = this.inOffsets;
    const inOrigins = this.inOrigins;
    const useOut = this.useOut;
    const useIn = this.useIn;
    const radius = this.radius;
    let cursor = this.expandCursor;
    let tail = this.tail;
    const limit = Math.min(cursor + this.chunk, tail);
    if (this.chunk < MAX_CHUNK) this.chunk *= 2;

    while (cursor < limit) {
      const u = queue[cursor++];
      let nextDepth = 0;
      if (depths !== undefined) {
        if (depths[u] >= radius) continue;
        nextDepth = depths[u] + 1;
      }
      if (useOut) {
        for (let i = outOffsets[u]; i < outOffsets[u + 1]; i++) {
          const v = outTargets[i];
          if (!visited[v]) {
            visited[v] = 1;
            if (depths !== undefined) depths[v] = nextDepth;
            queue[tail++] = v;
          }
        }
      }
      if (useIn) {
        for (let i = inOffsets[u]; i < inOffsets[u + 1]; i++) {
          const v = inOrigins[i];
          if (!visited[v]) {
            visited[v] = 1;
            if (depths !== undefined) depths[v] = nextDepth;
            queue[tail++] = v;
          }
        }
      }
    }

    this.expandCursor = cursor;
    this.tail = tail;
  }

  // Kept tiny so engines can inline it into for..of loops (letting escape
  // analysis elide the result allocation); everything else lives in nextSlow.
  next(): IteratorResult<GraphNode<N>, undefined> {
    // Hot path: nodes before the expansion cursor are settled queue entries
    const head = this.head;
    if (head < this.expandCursor) {
      this.head = head + 1;
      return { value: this.nodes[this.queue[head]], done: false };
    }
    return this.nextSlow();
  }

  private nextSlow(): IteratorResult<GraphNode<N>, undefined> {
    if (this.finished) return DONE;
    if (!this.started) {
      this.started = true;
      this.setup();
    }
    while (this.expandCursor <= this.head && this.expandCursor < this.tail) {
      this.expandChunk();
    }
    if (this.head >= this.tail) {
      this.finished = true;
      return DONE;
    }
    return { value: this.nodes[this.queue[this.head++]], done: false };
  }

  protected override close(): void {
    // Neutralize the hot serve path for a closed iterator
    this.head = 0;
    this.expandCursor = 0;
    this.tail = 0;
  }
}

export function genBFS<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  return new BfsIterator(graph, startOrOptions) as unknown as Generator<
    GraphNode<N>
  >;
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

/**
 * The classic duplicate-push stack DFS loop runs with pure local state
 * filling a yield buffer; `next()` then serves from the buffer. Same
 * sequence as yielding from inside the loop, but the hot loop carries no
 * per-yield overhead, and the chunk ramp keeps early-exiting consumers
 * effectively lazy (see INITIAL_CHUNK/MAX_CHUNK above).
 */
class DfsIterator<N> extends LazyTraversalIterator<N> {
  private visited!: Uint8Array;
  private reached: Uint8Array | undefined;
  // Every arc pushes its head at most once, so `starts + relevant arcs`
  // bounds the stack — a preallocated Int32Array, no growth checks.
  private stack!: Int32Array;
  private stackSize = 0;
  // Resolved node objects, filled by the traversal loop (where the deref is
  // cache-adjacent) and served by next() with minimal work
  private buffer: Array<GraphNode<N>> = new Array(MAX_CHUNK);
  private bufferLength = 0;
  private bufferPos = 0;
  private chunk = INITIAL_CHUNK;

  protected onSetup(): void {
    const csr = this.csr;
    this.visited = new Uint8Array(csr.ids.length);
    this.reached =
      this.radius === Infinity
        ? undefined
        : getReachableWithinRadius(csr, this.starts, this.direction, this.radius);
    let capacity = this.starts.length;
    if (this.useOut) capacity += csr.outTargets.length;
    if (this.useIn) capacity += csr.inOrigins.length;
    this.stack = new Int32Array(capacity);
    for (let i = this.starts.length - 1; i >= 0; i--) {
      this.stack[this.stackSize++] = this.starts[i];
    }
  }

  private fillBuffer(): void {
    const visited = this.visited;
    const reached = this.reached;
    const stack = this.stack;
    const buffer = this.buffer;
    const nodes = this.nodes;
    const useOut = this.useOut;
    const useIn = this.useIn;
    const outOffsets = this.outOffsets;
    const outTargets = this.outTargets;
    const inOffsets = this.inOffsets;
    const inOrigins = this.inOrigins;
    let top = this.stackSize;
    let produced = 0;
    const chunk = this.chunk;
    if (chunk < MAX_CHUNK) this.chunk = chunk * 2;

    while (produced < chunk && top > 0) {
      const node = stack[--top];
      if (visited[node]) continue;
      visited[node] = 1;
      buffer[produced++] = nodes[node];

      if (useOut) {
        const end = outOffsets[node + 1];
        if (reached === undefined) {
          for (let i = outOffsets[node]; i < end; i++) {
            const neighbor = outTargets[i];
            if (!visited[neighbor]) stack[top++] = neighbor;
          }
        } else {
          for (let i = outOffsets[node]; i < end; i++) {
            const neighbor = outTargets[i];
            if (!visited[neighbor] && reached[neighbor]) stack[top++] = neighbor;
          }
        }
      }
      if (useIn) {
        const end = inOffsets[node + 1];
        if (reached === undefined) {
          for (let i = inOffsets[node]; i < end; i++) {
            const neighbor = inOrigins[i];
            if (!visited[neighbor]) stack[top++] = neighbor;
          }
        } else {
          for (let i = inOffsets[node]; i < end; i++) {
            const neighbor = inOrigins[i];
            if (!visited[neighbor] && reached[neighbor]) stack[top++] = neighbor;
          }
        }
      }
    }

    this.stackSize = top;
    this.bufferLength = produced;
    this.bufferPos = 0;
  }

  // Kept tiny so engines can inline it into for..of loops (letting escape
  // analysis elide the result allocation); everything else lives in nextSlow.
  next(): IteratorResult<GraphNode<N>, undefined> {
    const pos = this.bufferPos;
    if (pos < this.bufferLength) {
      this.bufferPos = pos + 1;
      return { value: this.buffer[pos], done: false };
    }
    return this.nextSlow();
  }

  private nextSlow(): IteratorResult<GraphNode<N>, undefined> {
    if (this.finished) return DONE;
    if (!this.started) {
      this.started = true;
      this.setup();
    }
    this.fillBuffer();
    if (this.bufferLength === 0) {
      this.finished = true;
      return DONE;
    }
    this.bufferPos = 1;
    return { value: this.buffer[0], done: false };
  }

  protected override close(): void {
    // Drop buffered nodes so a closed iterator cannot keep serving
    this.bufferPos = 0;
    this.bufferLength = 0;
  }
}

export function genDFS<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  return new DfsIterator(graph, startOrOptions) as unknown as Generator<
    GraphNode<N>
  >;
}

class PostorderIterator<N> extends LazyTraversalIterator<N> {
  private discovered!: Uint8Array;
  private reached: Uint8Array | undefined;
  private stackNodes!: Int32Array;
  private stackOutCursors!: Int32Array;
  private stackInCursors!: Int32Array;
  private stackSize = 0;
  private startCursor = 0;

  protected onSetup(): void {
    const n = this.csr.ids.length;
    this.discovered = new Uint8Array(n);
    this.reached =
      this.radius === Infinity
        ? undefined
        : getReachableWithinRadius(
            this.csr,
            this.starts,
            this.direction,
            this.radius,
          );
    this.stackNodes = new Int32Array(n);
    this.stackOutCursors = new Int32Array(n);
    this.stackInCursors = new Int32Array(n);
  }

  private push(node: number): void {
    const top = this.stackSize++;
    this.discovered[node] = 1;
    this.stackNodes[top] = node;
    this.stackOutCursors[top] = this.csr.outOffsets[node];
    this.stackInCursors[top] = this.csr.inOffsets[node];
  }

  next(): IteratorResult<GraphNode<N>, undefined> {
    if (this.finished) return DONE;
    if (!this.started) {
      this.started = true;
      this.setup();
    }
    const discovered = this.discovered;
    const reached = this.reached;
    const stackNodes = this.stackNodes;
    const stackOutCursors = this.stackOutCursors;
    const stackInCursors = this.stackInCursors;
    const outOffsets = this.outOffsets;
    const outTargets = this.outTargets;
    const inOffsets = this.inOffsets;
    const inOrigins = this.inOrigins;

    for (;;) {
      if (this.stackSize === 0) {
        // Move on to the next undiscovered start root
        while (
          this.startCursor < this.starts.length &&
          discovered[this.starts[this.startCursor]]
        ) {
          this.startCursor++;
        }
        if (this.startCursor >= this.starts.length) {
          this.finished = true;
          return DONE;
        }
        this.push(this.starts[this.startCursor++]);
      }

      while (this.stackSize > 0) {
        const top = this.stackSize - 1;
        const node = stackNodes[top];
        let neighbor = -1;

        if (this.useOut) {
          const end = outOffsets[node + 1];
          let cursor = stackOutCursors[top];
          while (cursor < end) {
            const candidate = outTargets[cursor++];
            if (
              !discovered[candidate] &&
              (reached === undefined || reached[candidate])
            ) {
              neighbor = candidate;
              break;
            }
          }
          stackOutCursors[top] = cursor;
        }
        if (neighbor === -1 && this.useIn) {
          const end = inOffsets[node + 1];
          let cursor = stackInCursors[top];
          while (cursor < end) {
            const candidate = inOrigins[cursor++];
            if (
              !discovered[candidate] &&
              (reached === undefined || reached[candidate])
            ) {
              neighbor = candidate;
              break;
            }
          }
          stackInCursors[top] = cursor;
        }

        if (neighbor !== -1) {
          this.push(neighbor);
        } else {
          this.stackSize--;
          return { value: this.nodes[node], done: false };
        }
      }
    }
  }
}

/**
 * Lazily yields nodes after their reachable descendants.
 *
 * The active traversal retains its CSR and node-position snapshots, so later
 * structural mutations are visible only to fresh generators.
 */
export function genPostorder<N>(
  graph: Graph<N>,
  startOrOptions: string | TraversalSearchOptions,
): Generator<GraphNode<N>> {
  return new PostorderIterator(graph, startOrOptions) as unknown as Generator<
    GraphNode<N>
  >;
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
  // Kahn's algorithm over the CSR arcs with a typed-array ring queue. The
  // CSR's cached hasNonDirected flag makes the mode bail-out O(1) per call.
  const csr = getCSR(graph);
  if (csr.hasNonDirected) return null;

  const n = csr.ids.length;
  const outOffsets = csr.outOffsets;
  const outTargets = csr.outTargets;
  // Edge-list in-degrees (cached per CSR) so an edge with a dangling
  // *source* still blocks its target, matching the previous behavior where
  // such targets never reached degree 0.
  const inDegree = getEdgeListInDegrees(graph, csr).slice();

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue[tail++] = i;
  }

  const result: GraphNode<N>[] = [];
  while (head < tail) {
    const u = queue[head++];
    result.push(graph.nodes[u]);
    for (let a = outOffsets[u]; a < outOffsets[u + 1]; a++) {
      const v = outTargets[a];
      if (--inDegree[v] === 0) queue[tail++] = v;
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
