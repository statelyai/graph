import { getNode } from '../graph';
import { getEdgeMode } from '../mode';
import type {
  EulerianPathOptions,
  Graph,
  GraphEdge,
  GraphPath,
  GraphStep,
} from '../types';

type Arc<E> = { edge: GraphEdge<E>; toId: string };

function getEulerianPathInternal<N, E>(
  graph: Graph<N, E>,
  options: EulerianPathOptions | undefined,
  circuitOnly: boolean,
): GraphPath<N, E> | undefined {
  const modes = new Set(graph.edges.map((edge) => getEdgeMode(graph, edge)));
  const hasDirected = modes.has('directed');
  const hasNonDirected = modes.has('undirected') || modes.has('bidirectional');
  if (hasDirected && hasNonDirected) return undefined;

  const directed = hasDirected || (modes.size === 0 && graph.mode === 'directed');
  const adjacency = new Map<string, Arc<E>[]>();
  const inDegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outDegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const node of graph.nodes) adjacency.set(node.id, []);

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceId)?.push({ edge, toId: edge.targetId });
    if (directed) {
      outDegree.set(edge.sourceId, (outDegree.get(edge.sourceId) ?? 0) + 1);
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
    } else {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
      if (edge.sourceId !== edge.targetId) {
        adjacency.get(edge.targetId)?.push({ edge, toId: edge.sourceId });
      }
    }
  }

  let requiredStart: string | undefined;
  let allowedUndirectedStarts: Set<string> | undefined;
  if (directed) {
    let startCount = 0;
    let endCount = 0;
    for (const node of graph.nodes) {
      const difference =
        (outDegree.get(node.id) ?? 0) - (inDegree.get(node.id) ?? 0);
      if (difference === 1) {
        startCount++;
        requiredStart = node.id;
      } else if (difference === -1) {
        endCount++;
      } else if (difference !== 0) {
        return undefined;
      }
    }
    if (circuitOnly ? startCount !== 0 || endCount !== 0 : !(
      (startCount === 0 && endCount === 0) ||
      (startCount === 1 && endCount === 1)
    )) {
      return undefined;
    }
  } else {
    const odd = graph.nodes.filter((node) => (degree.get(node.id) ?? 0) % 2 === 1);
    if (circuitOnly ? odd.length !== 0 : odd.length !== 0 && odd.length !== 2) {
      return undefined;
    }
    requiredStart = odd[0]?.id;
    if (odd.length === 2) {
      allowedUndirectedStarts = new Set(odd.map((node) => node.id));
    }
  }

  const inferredStart =
    requiredStart ??
    graph.initialNodeId ??
    graph.nodes.find((node) => (adjacency.get(node.id)?.length ?? 0) > 0)?.id ??
    graph.nodes[0]?.id;
  const startId = options?.from ?? inferredStart;
  if (!startId || !getNode(graph, startId)) return undefined;
  if (
    requiredStart &&
    startId !== requiredStart &&
    !allowedUndirectedStarts?.has(startId)
  ) {
    return undefined;
  }

  const used = new Set<string>();
  const positions = new Map<string, number>();
  const nodeStack = [startId];
  const edgeStack: GraphEdge<E>[] = [];
  const reversedSteps: GraphStep<N, E>[] = [];

  while (nodeStack.length > 0) {
    const currentId = nodeStack[nodeStack.length - 1];
    const arcs = adjacency.get(currentId) ?? [];
    let position = positions.get(currentId) ?? 0;
    while (position < arcs.length && used.has(arcs[position].edge.id)) position++;
    positions.set(currentId, position);

    const arc = arcs[position];
    if (arc) {
      positions.set(currentId, position + 1);
      if (used.has(arc.edge.id)) continue;
      used.add(arc.edge.id);
      nodeStack.push(arc.toId);
      edgeStack.push(arc.edge);
      continue;
    }

    const nodeId = nodeStack.pop()!;
    const edge = edgeStack.pop();
    if (edge) {
      const node = getNode(graph, nodeId)!;
      reversedSteps.push({ edge, node });
    }
  }

  if (used.size !== graph.edges.length) return undefined;
  const source = getNode(graph, startId)!;
  const path = { source, steps: reversedSteps.reverse() };
  if (
    circuitOnly &&
    path.steps.length > 0 &&
    path.steps[path.steps.length - 1].node.id !== source.id
  ) {
    return undefined;
  }
  return path;
}

/** Return an Eulerian path, or `undefined` when none exists. */
export function getEulerianPath<N, E>(
  graph: Graph<N, E>,
  options?: EulerianPathOptions,
): GraphPath<N, E> | undefined {
  return getEulerianPathInternal(graph, options, false);
}

/** Return an Eulerian circuit, or `undefined` when none exists. */
export function getEulerianCircuit<N, E>(
  graph: Graph<N, E>,
  options?: EulerianPathOptions,
): GraphPath<N, E> | undefined {
  return getEulerianPathInternal(graph, options, true);
}
