import type { Graph } from '../types';
import { createGraph } from '../graph';
import { getCSR } from './csr';
import { getStronglyConnectedComponents } from './paths';

/** Node data of a {@link getCondensation} result. */
export interface CondensationNodeData {
  /** Ids of the original nodes in this strongly connected component. */
  nodeIds: string[];
}

/** Edge data of a {@link getCondensation} result. */
export interface CondensationEdgeData {
  /** Ids of the original edges between the two components, in edge order. */
  edgeIds: string[];
}

/**
 * Returns the condensation of a graph: every strongly connected component
 * collapses into one node, giving a directed acyclic graph of components.
 *
 * Use it to get a DAG view of a cyclic graph, such as a state machine whose
 * states loop: each component node lists its members in `data.nodeIds`.
 *
 * - A component node takes the id of its first member in `graph.nodes`
 *   order, so ids stay readable and unique. Nodes appear in the order of
 *   their first member.
 * - Edges between two components merge into one directed edge with id
 *   `condensation:["<sourceId>","<targetId>"]`, listing the original edges
 *   in `data.edgeIds`. Edges inside a component are dropped.
 * - Non-directed edges make their endpoints mutually reachable, so they
 *   never cross components. Dangling edges are ignored.
 *
 * The result is a new directed, flat graph; hierarchy and visual fields are
 * not carried over.
 *
 * @example
 * ```ts
 * // a ⇄ b → c
 * const dag = getCondensation(graph);
 * dag.nodes.map((node) => node.data.nodeIds); // [['a', 'b'], ['c']]
 * ```
 */
export function getCondensation(
  graph: Graph,
): Graph<CondensationNodeData, CondensationEdgeData> {
  const csr = getCSR(graph);
  const componentOf = new Int32Array(csr.ids.length);
  const components = getStronglyConnectedComponents(graph)
    .map((component) =>
      component
        .map((node) => csr.indexOf.get(node.id)!)
        .sort((a, b) => a - b),
    )
    .sort((a, b) => a[0] - b[0]);
  components.forEach((members, c) => {
    for (const member of members) componentOf[member] = c;
  });

  const componentIds = components.map((members) => csr.ids[members[0]]);
  const edgeIdsByPair = new Map<string, string[]>();
  const pairs: Array<[number, number]> = [];
  for (const edge of graph.edges) {
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    const cs = componentOf[s];
    const ct = componentOf[t];
    if (cs === ct) continue;
    const key = `${cs},${ct}`;
    let edgeIds = edgeIdsByPair.get(key);
    if (!edgeIds) {
      edgeIds = [];
      edgeIdsByPair.set(key, edgeIds);
      pairs.push([cs, ct]);
    }
    edgeIds.push(edge.id);
  }

  return createGraph<CondensationNodeData, CondensationEdgeData>({
    mode: 'directed',
    nodes: components.map((members, c) => ({
      id: componentIds[c],
      data: { nodeIds: members.map((member) => csr.ids[member]) },
    })),
    edges: pairs.map(([cs, ct]) => ({
      id: `condensation:${JSON.stringify([componentIds[cs], componentIds[ct]])}`,
      sourceId: componentIds[cs],
      targetId: componentIds[ct],
      data: { edgeIds: edgeIdsByPair.get(`${cs},${ct}`)! },
    })),
  });
}
