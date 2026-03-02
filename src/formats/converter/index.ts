import type { Graph, GraphFormatConverter } from '../../types';
import { toAdjacencyList, fromAdjacencyList } from '../adjacency-list';
import { toEdgeList, fromEdgeList } from '../edge-list';

/**
 * Create a `GraphFormatConverter` from a pair of `to`/`from` functions.
 *
 * @example
 * ```ts
 * import { createFormatConverter } from '@statelyai/graph';
 *
 * const yamlConverter = createFormatConverter(
 *   (graph) => toYAML(graph),
 *   (yaml) => fromYAML(yaml),
 * );
 *
 * const yaml = yamlConverter.to(graph);
 * const graph = yamlConverter.from(yaml);
 * ```
 */
export function createFormatConverter<TSerial, N = any, E = any, G = any>(
  to: (graph: Graph<N, E, G>) => TSerial,
  from: (input: TSerial) => Graph<N, E, G>,
): GraphFormatConverter<TSerial, N, E, G> {
  return { to, from };
}

/**
 * Bidirectional converter for adjacency-list format (`Record<string, string[]>`).
 *
 * @example
 * ```ts
 * import { adjacencyListConverter, createGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {} },
 *   edges: [{ source: 'a', target: 'b' }],
 * });
 *
 * const adj = adjacencyListConverter.to(graph);
 * // { a: ['b'], b: [] }
 *
 * const roundTripped = adjacencyListConverter.from(adj);
 * ```
 */
export const adjacencyListConverter: GraphFormatConverter<
  Record<string, string[]>
> = createFormatConverter(toAdjacencyList, fromAdjacencyList);

/**
 * Bidirectional converter for edge-list format (`[source, target][]`).
 *
 * @example
 * ```ts
 * import { edgeListConverter, createGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {} },
 *   edges: [{ source: 'a', target: 'b' }],
 * });
 *
 * const edges = edgeListConverter.to(graph);
 * // [['a', 'b']]
 *
 * const roundTripped = edgeListConverter.from(edges);
 * ```
 */
export const edgeListConverter: GraphFormatConverter<[string, string][]> =
  createFormatConverter(toEdgeList, fromEdgeList);
