import ELK from 'elkjs';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { toELK, fromELK } from '../formats/elk';
import { getNodeSize, type LayoutOptions } from './index';

/** Minimal interface an injected ELK instance must satisfy. */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>;
}

export interface ElkLayoutOptions extends LayoutOptions {
  /**
   * ELK algorithm. Common choices: `'layered'` (default), `'mrtree'`,
   * `'force'`, `'stress'`, `'radial'`, `'rectpacking'`.
   */
  algorithm?: string;
  /**
   * Raw ELK layout options, spread onto the root last (override everything).
   * See https://eclipse.dev/elk/reference/options.html
   */
  layoutOptions?: Record<string, string>;
  /**
   * Injected ELK instance — e.g. one constructed with a web worker factory.
   * Defaults to `new ELK()` (in-process).
   */
  elk?: ElkLike;
}

let defaultElk: ElkLike | undefined;

/**
 * Lay out a graph with ELK (via `elkjs`, an optional peer dependency).
 * Pure: returns a new {@link VisualGraph} with node positions/sizes, routed
 * edge `points`, and computed edge label rects (edge `x`/`y`/`width`/`height`).
 * Hierarchy (`parentId`) and ports are first-class — ELK is the engine of
 * choice for compound and port-aware graphs. Child node coordinates are
 * relative to their parent (matching xyflow's convention).
 *
 * @example
 * ```ts
 * import { getElkLayout } from '@statelyai/graph/layout/elk';
 *
 * const laidOut = await getElkLayout(graph, {
 *   algorithm: 'layered',
 *   measure: (node) => measureText(node.label),
 * });
 * ```
 */
export async function getElkLayout(
  graph: Graph | VisualGraph,
  options?: ElkLayoutOptions,
): Promise<VisualGraph> {
  // Resolve sizes up front (measure → own size → default), then hand a fully
  // sized VisualGraph to toELK
  const sized = createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction: options?.direction ?? graph.direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => ({
      ...toNodeConfig(node),
      ...getNodeSize(node, options),
    })),
    edges: graph.edges.map((edge) => toEdgeConfig(edge)),
  });

  const root = toELK(sized);

  // constraints.layer → ELK partitions (same value = same layer, ordered
  // along the flow axis)
  const layerOf = options?.constraints?.layer;
  let hasPartitions = false;
  if (layerOf) {
    const nodeById = new Map(sized.nodes.map((node) => [node.id, node]));
    const visit = (elkNode: ElkNode): void => {
      for (const child of elkNode.children ?? []) {
        const node = nodeById.get(child.id);
        const layer = node === undefined ? undefined : layerOf(node);
        if (layer !== undefined) {
          hasPartitions = true;
          child.layoutOptions = {
            ...child.layoutOptions,
            'elk.partitioning.partition': String(layer),
          };
        }
        visit(child);
      }
    };
    visit(root);
  }

  root.layoutOptions = {
    'elk.algorithm': options?.algorithm ?? 'layered',
    ...(hasPartitions && { 'elk.partitioning.activate': 'true' }),
    ...(options?.spacing?.node !== undefined && {
      'elk.spacing.nodeNode': String(options.spacing.node),
    }),
    ...(options?.spacing?.layer !== undefined && {
      'elk.layered.spacing.nodeNodeBetweenLayers': String(
        options.spacing.layer,
      ),
    }),
    ...root.layoutOptions,
    ...options?.layoutOptions,
  };

  const elk = options?.elk ?? (defaultElk ??= new ELK());
  const laidOut = await elk.layout(root);
  return fromELK(laidOut);
}
