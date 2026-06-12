import cytoscape from 'cytoscape';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getNodeSize, type LayoutOptions } from './index';

/**
 * Minimal interface an injected cytoscape factory must satisfy — the
 * `cytoscape()` function itself. Inject your own when you've registered
 * layout extensions via `cytoscape.use(...)` (cola, fcose, dagre, …).
 */
export type CytoscapeLike = (
  options: cytoscape.CytoscapeOptions,
) => cytoscape.Core;

export interface CytoscapeLayoutOptions extends LayoutOptions {
  /**
   * Cytoscape layout name. Built-ins: `'grid'`, `'circle'`, `'concentric'`,
   * `'breadthfirst'`, `'cose'` (default), `'random'`. Extension layouts work
   * when registered on an injected {@link CytoscapeLayoutOptions.cy} factory.
   */
  name?: string;
  /**
   * Raw cytoscape layout options, merged into the layout call last (override
   * everything, including `name`). Engine-specific tuning — spacing knobs,
   * `boundingBox`, `roots`, iteration counts — goes here; the options vary
   * too much between cytoscape layouts to map `LayoutOptions.spacing`
   * generically. See https://js.cytoscape.org/#layouts
   */
  layoutOptions?: Record<string, unknown>;
  /**
   * Injected cytoscape factory — e.g. one with extensions registered via
   * `cytoscape.use(...)`. Defaults to the imported `cytoscape`.
   */
  cy?: CytoscapeLike;
}

/**
 * Lay out a graph with Cytoscape.js (`cytoscape`, an optional peer
 * dependency) — one call unlocks its whole layout ecosystem. Pure: returns a
 * new {@link VisualGraph} with node positions and sizes. Cytoscape layouts
 * position nodes only; edges keep their fields but gain no route `points`.
 * Compound graphs are supported via cytoscape `parent`; parent nodes get
 * cytoscape's computed compound dimensions. All coordinates are absolute
 * (cytoscape does not produce parent-relative positions).
 *
 * Runs headless with `styleEnabled: true` so resolved node sizes
 * ({@link getNodeSize}) participate in overlap avoidance and spacing.
 *
 * Option mapping is deliberately minimal: `measure` resolves sizes,
 * `isFixed` nodes with an existing `x`/`y` are locked in place (cytoscape
 * layouts skip locked nodes), and everything else — including `direction`
 * and `spacing` — is engine-specific and belongs in
 * {@link CytoscapeLayoutOptions.layoutOptions}. `seed` is ignored: the
 * discrete layouts (grid, circle, concentric, breadthfirst) are
 * deterministic, and cose is not seedable.
 *
 * @example
 * ```ts
 * import { getCytoscapeLayout } from '@statelyai/graph/layout/cytoscape';
 *
 * const laidOut = await getCytoscapeLayout(graph, {
 *   name: 'breadthfirst',
 *   layoutOptions: { roots: ['start'] },
 * });
 * ```
 */
export async function getCytoscapeLayout(
  graph: Graph | VisualGraph,
  options?: CytoscapeLayoutOptions,
): Promise<VisualGraph> {
  const elements: cytoscape.ElementDefinition[] = [];
  for (const node of graph.nodes) {
    const size = getNodeSize(node, options);
    const hasPosition = node.x !== undefined && node.y !== undefined;
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        ...(node.parentId != null && { parent: node.parentId }),
        // Resolved sizes ride along in data; the style mapping below feeds
        // them to the layout engine
        width: size.width,
        height: size.height,
      },
      // Cytoscape positions are node centers; ours are top-left corners
      ...(hasPosition && {
        position: {
          x: node.x! + size.width / 2,
          y: node.y! + size.height / 2,
        },
      }),
      ...(hasPosition && options?.isFixed?.(node) && { locked: true }),
    });
  }
  for (const edge of graph.edges) {
    elements.push({
      group: 'edges',
      data: { id: edge.id, source: edge.sourceId, target: edge.targetId },
    });
  }

  const createCytoscape = options?.cy ?? (cytoscape as CytoscapeLike);
  // styleEnabled is required headless — without it nodes have no dimensions
  // and layouts treat them as points
  const cy = createCytoscape({
    headless: true,
    styleEnabled: true,
    style: [
      {
        selector: 'node',
        style: {
          width: 'data(width)',
          height: 'data(height)',
          shape: 'rectangle',
        },
      },
    ],
    elements,
  });

  try {
    const layout = cy.layout({
      name: options?.name ?? 'cose',
      animate: false,
      ...options?.layoutOptions,
    } as cytoscape.LayoutOptions);
    // layoutstop fires for both sync (grid) and async (cose) layouts
    const stopped = layout.promiseOn('layoutstop');
    layout.run();
    await stopped;

    return createVisualGraph({
      id: graph.id,
      mode: graph.mode,
      initialNodeId: graph.initialNodeId ?? undefined,
      direction: options?.direction ?? graph.direction,
      data: graph.data,
      ...(graph.style !== undefined && { style: graph.style }),
      nodes: graph.nodes.map((node) => {
        const ele = cy.getElementById(node.id);
        // Read dimensions back from cytoscape: compound parents get their
        // computed size, leaves get the resolved size fed in above
        const width = ele.width();
        const height = ele.height();
        const position = ele.position();
        return {
          ...toNodeConfig(node),
          width,
          height,
          x: position.x - width / 2,
          y: position.y - height / 2,
        };
      }),
      edges: graph.edges.map((edge) => toEdgeConfig(edge)),
    });
  } finally {
    cy.destroy();
  }
}
