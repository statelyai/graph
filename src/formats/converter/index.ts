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
export function createFormatConverter<TSerial>(
  to: (graph: Graph) => TSerial,
  from: (input: TSerial) => Graph,
): GraphFormatConverter<TSerial> {
  return { to, from };
}

/** Bidirectional converter for adjacency-list format (`Record<string, string[]>`). */
export const adjacencyListConverter: GraphFormatConverter<
  Record<string, string[]>
> = createFormatConverter(toAdjacencyList, fromAdjacencyList);

/** Bidirectional converter for edge-list format (`[source, target][]`). */
export const edgeListConverter: GraphFormatConverter<[string, string][]> =
  createFormatConverter(toEdgeList, fromEdgeList);
