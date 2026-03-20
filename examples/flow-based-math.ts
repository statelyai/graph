/**
 * Flow-Based Programming Example
 *
 * Demonstrates using @statelyai/graph ports to build a dataflow graph
 * that performs math operations. The `run()` function interprets the
 * graph to compute results by propagating values through ports.
 *
 * Graph:
 *
 *   [input]─out──→in─[double]─out──→a─[add]─out──→in─[output]
 *                                     │
 *              [constant(10)]─out──→b─┘
 *
 * Computation: output = (input * 2) + 10
 */

import {
  createGraph,
  type Graph,
  type GraphNode,
  getTopologicalSort,
  getEdgesByPort,
  getPorts,
} from '../src';

// --- Port data describes the value type flowing through ---

type PortData = { type: 'number' | 'string' };

// --- Node data holds the operation and optional config ---

type NodeData = {
  op: 'input' | 'output' | 'constant' | 'double' | 'add' | 'multiply' | 'negate';
  value?: number; // for 'constant' and 'input' (initial)
};

type FlowGraph = Graph<NodeData, any, any, PortData>;

// --- Build the graph ---

const graph: FlowGraph = createGraph<NodeData, any, any, PortData>({
  initialNodeId: 'input',
  nodes: [
    {
      id: 'input',
      data: { op: 'input' },
      ports: [{ name: 'out', direction: 'out', data: { type: 'number' } }],
    },
    {
      id: 'double',
      data: { op: 'multiply', value: 2 },
      ports: [
        { name: 'in', direction: 'in', data: { type: 'number' } },
        { name: 'out', direction: 'out', data: { type: 'number' } },
      ],
    },
    {
      id: 'offset',
      data: { op: 'constant', value: 10 },
      ports: [{ name: 'out', direction: 'out', data: { type: 'number' } }],
    },
    {
      id: 'add',
      data: { op: 'add' },
      ports: [
        { name: 'a', direction: 'in', data: { type: 'number' } },
        { name: 'b', direction: 'in', data: { type: 'number' } },
        { name: 'out', direction: 'out', data: { type: 'number' } },
      ],
    },
    {
      id: 'output',
      data: { op: 'output' },
      ports: [{ name: 'in', direction: 'in', data: { type: 'number' } }],
    },
  ],
  edges: [
    {
      id: 'e1',
      sourceId: 'input',
      targetId: 'double',
      sourcePort: 'out',
      targetPort: 'in',
    },
    {
      id: 'e2',
      sourceId: 'double',
      targetId: 'add',
      sourcePort: 'out',
      targetPort: 'a',
    },
    {
      id: 'e3',
      sourceId: 'offset',
      targetId: 'add',
      sourcePort: 'out',
      targetPort: 'b',
    },
    {
      id: 'e4',
      sourceId: 'add',
      targetId: 'output',
      sourcePort: 'out',
      targetPort: 'in',
    },
  ],
});

// --- Interpreter ---

/**
 * Evaluate a single node given its input port values.
 * Returns a map of output port name → value.
 */
function evaluate(
  node: GraphNode<NodeData>,
  inputs: Record<string, number>,
): Record<string, number> {
  const { op, value } = node.data;

  switch (op) {
    case 'input':
      // Value comes from run() initial inputs
      return { out: inputs['out'] ?? value ?? 0 };

    case 'constant':
      return { out: value ?? 0 };

    case 'double':
      return { out: (inputs['in'] ?? 0) * 2 };

    case 'multiply':
      return { out: (inputs['in'] ?? 0) * (value ?? 1) };

    case 'add':
      return { out: (inputs['a'] ?? 0) + (inputs['b'] ?? 0) };

    case 'negate':
      return { out: -(inputs['in'] ?? 0) };

    case 'output':
      return { in: inputs['in'] ?? 0 };

    default:
      throw new Error(`Unknown op: ${op}`);
  }
}

/**
 * Run a flow graph to completion.
 *
 * @param g - The flow graph
 * @param inputs - Initial values keyed by node ID (or a single number seeded via graph.initialNodeId)
 * @returns Map of output node IDs to their computed values
 *
 * @example
 * ```ts
 * const result = run(graph, 42);  // seeds graph.initialNodeId
 * // result = { output: 94 }  // (42 * 2) + 10
 * ```
 */
function run(
  g: FlowGraph,
  inputs: Record<string, number> | number,
): Record<string, number> {
  const sorted = getTopologicalSort(g);
  if (!sorted) throw new Error('Cycle detected — flow graph must be acyclic');

  // Normalize: if a single number is passed, seed it via graph.initialNodeId
  const inputMap: Record<string, number> =
    typeof inputs === 'number'
      ? { [g.initialNodeId ?? sorted[0].id]: inputs }
      : inputs;

  // portValues[nodeId][portName] = number
  const portValues = new Map<string, Record<string, number>>();

  for (const node of sorted) {
    // Collect input port values from upstream edges
    const nodeInputs: Record<string, number> = {};

    if (node.data.op === 'input') {
      // Seed from external inputs using node ID
      nodeInputs['out'] = inputMap[node.id] ?? node.data.value ?? 0;
    } else {
      // Gather values from incoming edges
      for (const edge of g.edges) {
        if (edge.targetId === node.id && edge.targetPort && edge.sourcePort) {
          const sourceVals = portValues.get(edge.sourceId);
          if (sourceVals && edge.sourcePort in sourceVals) {
            nodeInputs[edge.targetPort] = sourceVals[edge.sourcePort];
          }
        }
      }
    }

    // Evaluate and store output port values
    const outputs = evaluate(node, nodeInputs);
    portValues.set(node.id, outputs);
  }

  // Collect results from output nodes
  const results: Record<string, number> = {};
  for (const node of g.nodes) {
    if (node.data.op === 'output') {
      const vals = portValues.get(node.id);
      results[node.id] = vals?.['in'] ?? 0;
    }
  }

  return results;
}

// --- Demo ---

console.log('Flow graph: output = (input * 2) + 10');
console.log(`  initialNodeId: "${graph.initialNodeId}"\n`);

// Single number seeds graph.initialNodeId ("input" node)
const test1 = run(graph, 42);
console.log(`run(graph, 42)  → ${JSON.stringify(test1)}`);
// { output: 94 }

const test2 = run(graph, 0);
console.log(`run(graph, 0)   → ${JSON.stringify(test2)}`);
// { output: 10 }

const test3 = run(graph, -5);
console.log(`run(graph, -5)  → ${JSON.stringify(test3)}`);
// { output: 0 }

// Record form still works for multi-input graphs
const test4 = run(graph, { input: 100 });
console.log(`run(graph, { input: 100 }) → ${JSON.stringify(test4)}`);
// { output: 210 }

console.log('\nPort inspection:');
for (const node of graph.nodes) {
  const ports = getPorts(graph, node.id);
  if (ports.length > 0) {
    const portInfo = ports
      .map((p) => `${p.name}(${p.direction})`)
      .join(', ');
    console.log(`  ${node.id}: [${portInfo}]`);
  }
}

console.log('\nEdge routing:');
for (const edge of graph.edges) {
  console.log(
    `  ${edge.sourceId}:${edge.sourcePort} → ${edge.targetId}:${edge.targetPort}`,
  );
}

// --- Verify with port queries ---

console.log('\nPort query: edges connected to add:a');
const addAEdges = getEdgesByPort(graph, 'add', 'a');
console.log(`  ${addAEdges.map((e) => e.id).join(', ')}`);
// e2
