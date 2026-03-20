/**
 * Async Workflow Example (n8n / Zapier style)
 *
 * Demonstrates async node execution with automatic parallelism.
 * Independent branches run concurrently via Promise.all; nodes
 * that share no data dependency execute in parallel.
 *
 * Workflow:
 *
 *                        ┌→ [fetch_user] ─────────→ user ─┐
 *   [webhook] ─ userId → ┤                                ├→ [compose] ─ html → [send_email]
 *             ─ userId → └→ [fetch_orders] → [summarize] → summary ─┘
 *
 * - webhook:     triggers the flow, outputs a userId
 * - fetch_user:  async lookup (simulated 120ms)
 * - fetch_orders: async lookup (simulated 200ms)  ← runs in parallel with fetch_user
 * - summarize:   sync transform on orders
 * - compose:     waits for BOTH user + summary, merges into email HTML
 * - send_email:  async side-effect (simulated 80ms)
 */

import {
  createGraph,
  type Graph,
  type GraphNode,
  type GraphEdge,
  getTopologicalSort,
  getEdgesByPort,
  getPorts,
  getSources,
} from '../src';

// --- Types ---

type StepFn = (inputs: Record<string, unknown>) => unknown | Promise<unknown>;

type NodeData = {
  /** Human-readable label */
  label: string;
  /** The async (or sync) handler for this node */
  run: StepFn;
};

type WorkflowGraph = Graph<NodeData>;

// --- Simulated services ---

const users: Record<string, { name: string; email: string }> = {
  u1: { name: 'Alice', email: 'alice@example.com' },
  u2: { name: 'Bob', email: 'bob@example.com' },
};

const orders: Record<string, { item: string; amount: number }[]> = {
  u1: [
    { item: 'Widget', amount: 29.99 },
    { item: 'Gadget', amount: 49.99 },
  ],
  u2: [{ item: 'Thingamajig', amount: 9.99 }],
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Build the workflow graph ---

const workflow: WorkflowGraph = createGraph<NodeData>({
  initialNodeId: 'webhook',
  nodes: [
    {
      id: 'webhook',
      data: {
        label: 'Webhook Trigger',
        run: (inputs) => inputs['payload'],
      },
      ports: [
        { name: 'payload', direction: 'in' },
        { name: 'userId', direction: 'out' },
      ],
    },
    {
      id: 'fetch_user',
      data: {
        label: 'Fetch User',
        run: async (inputs) => {
          await delay(120);
          const id = inputs['userId'] as string;
          return users[id] ?? { name: 'Unknown', email: 'unknown@example.com' };
        },
      },
      ports: [
        { name: 'userId', direction: 'in' },
        { name: 'user', direction: 'out' },
      ],
    },
    {
      id: 'fetch_orders',
      data: {
        label: 'Fetch Orders',
        run: async (inputs) => {
          await delay(200);
          const id = inputs['userId'] as string;
          return orders[id] ?? [];
        },
      },
      ports: [
        { name: 'userId', direction: 'in' },
        { name: 'orders', direction: 'out' },
      ],
    },
    {
      id: 'summarize',
      data: {
        label: 'Summarize Orders',
        run: (inputs) => {
          const items = inputs['orders'] as { item: string; amount: number }[];
          const total = items.reduce((sum, o) => sum + o.amount, 0);
          return `${items.length} order(s), total $${total.toFixed(2)}`;
        },
      },
      ports: [
        { name: 'orders', direction: 'in' },
        { name: 'summary', direction: 'out' },
      ],
    },
    {
      id: 'compose',
      data: {
        label: 'Compose Email',
        run: (inputs) => {
          const user = inputs['user'] as { name: string; email: string };
          const summary = inputs['summary'] as string;
          return {
            to: user.email,
            subject: `Order Summary for ${user.name}`,
            html: `<p>Hi ${user.name},</p><p>${summary}</p>`,
          };
        },
      },
      ports: [
        { name: 'user', direction: 'in' },
        { name: 'summary', direction: 'in' },
        { name: 'email', direction: 'out' },
      ],
    },
    {
      id: 'send_email',
      data: {
        label: 'Send Email',
        run: async (inputs) => {
          await delay(80);
          const email = inputs['email'] as {
            to: string;
            subject: string;
            html: string;
          };
          return { sent: true, to: email.to, subject: email.subject };
        },
      },
      ports: [
        { name: 'email', direction: 'in' },
        { name: 'result', direction: 'out' },
      ],
    },
  ],
  edges: [
    // webhook fans out to two parallel branches
    {
      id: 'e1',
      sourceId: 'webhook',
      targetId: 'fetch_user',
      sourcePort: 'userId',
      targetPort: 'userId',
    },
    {
      id: 'e2',
      sourceId: 'webhook',
      targetId: 'fetch_orders',
      sourcePort: 'userId',
      targetPort: 'userId',
    },
    // orders branch
    {
      id: 'e3',
      sourceId: 'fetch_orders',
      targetId: 'summarize',
      sourcePort: 'orders',
      targetPort: 'orders',
    },
    // both branches merge into compose
    {
      id: 'e4',
      sourceId: 'fetch_user',
      targetId: 'compose',
      sourcePort: 'user',
      targetPort: 'user',
    },
    {
      id: 'e5',
      sourceId: 'summarize',
      targetId: 'compose',
      sourcePort: 'summary',
      targetPort: 'summary',
    },
    // compose → send
    {
      id: 'e6',
      sourceId: 'compose',
      targetId: 'send_email',
      sourcePort: 'email',
      targetPort: 'email',
    },
  ],
});

// --- Async runner with automatic parallelism ---

/**
 * Groups topologically-sorted nodes into levels that can run in parallel.
 * Nodes in the same level have all their dependencies satisfied by prior levels.
 */
function getLevels<N>(
  g: Graph<N>,
  sorted: GraphNode<N>[],
): GraphNode<N>[][] {
  const nodeLevel = new Map<string, number>();

  for (const node of sorted) {
    let maxParentLevel = -1;

    for (const edge of g.edges) {
      if (edge.targetId === node.id) {
        const parentLevel = nodeLevel.get(edge.sourceId) ?? 0;
        maxParentLevel = Math.max(maxParentLevel, parentLevel);
      }
    }

    nodeLevel.set(node.id, maxParentLevel + 1);
  }

  const levels: GraphNode<N>[][] = [];
  for (const node of sorted) {
    const level = nodeLevel.get(node.id)!;
    if (!levels[level]) levels[level] = [];
    levels[level].push(node);
  }

  return levels;
}

/**
 * Run an async workflow graph to completion with automatic parallelism.
 *
 * Nodes at the same topological level execute concurrently via Promise.all.
 * Each node's `data.run` function receives its input port values and
 * returns output that is routed to downstream ports.
 *
 * @example
 * ```ts
 * const result = await runWorkflow(workflow, { userId: 'u1' });
 * ```
 */
async function runWorkflow(
  g: WorkflowGraph,
  triggerPayload: unknown,
): Promise<{ outputs: Map<string, Record<string, unknown>>; log: string[] }> {
  const sorted = getTopologicalSort(g);
  if (!sorted) throw new Error('Cycle detected — workflow must be acyclic');

  const levels = getLevels(g, sorted);

  // portValues[nodeId][portName] = value
  const portValues = new Map<string, Record<string, unknown>>();
  const log: string[] = [];

  for (const [levelIdx, level] of levels.entries()) {
    const nodeNames = level.map((n) => n.data.label).join(', ');
    const parallel = level.length > 1;
    log.push(
      `Level ${levelIdx}: ${parallel ? '⚡ parallel' : '→ sequential'} [${nodeNames}]`,
    );

    const start = performance.now();

    await Promise.all(
      level.map(async (node) => {
        const nodeStart = performance.now();

        // Gather input port values
        const nodeInputs: Record<string, unknown> = {};

        // Seed trigger node from payload
        if (node.id === g.initialNodeId) {
          nodeInputs['payload'] = triggerPayload;
        }

        // Collect from upstream edges
        for (const edge of g.edges) {
          if (edge.targetId === node.id && edge.targetPort && edge.sourcePort) {
            const sourceVals = portValues.get(edge.sourceId);
            if (sourceVals && edge.sourcePort in sourceVals) {
              nodeInputs[edge.targetPort] = sourceVals[edge.sourcePort];
            }
          }
        }

        // Execute
        const result = await node.data.run(nodeInputs);
        const elapsed = (performance.now() - nodeStart).toFixed(0);

        // Route output to all output ports (single-output convention)
        const outPorts = getPorts(g, node.id).filter(
          (p) => p.direction === 'out',
        );
        const outputs: Record<string, unknown> = {};
        for (const port of outPorts) {
          outputs[port.name] = result;
        }
        portValues.set(node.id, outputs);

        log.push(`  ✓ ${node.data.label} (${elapsed}ms)`);
      }),
    );

    const levelElapsed = (performance.now() - start).toFixed(0);
    if (parallel) {
      log.push(`  ⏱ level total: ${levelElapsed}ms (parallel — not sum)`);
    }
  }

  return { outputs: portValues, log };
}

// --- Demo ---

async function main() {
  console.log('=== Async Workflow (n8n / Zapier style) ===\n');

  // Show graph structure
  console.log('Nodes:');
  for (const node of workflow.nodes) {
    const ports = getPorts(workflow, node.id);
    const inPorts = ports
      .filter((p) => p.direction === 'in')
      .map((p) => p.name);
    const outPorts = ports
      .filter((p) => p.direction === 'out')
      .map((p) => p.name);
    console.log(
      `  ${node.data.label} (${node.id})  in:[${inPorts}] out:[${outPorts}]`,
    );
  }

  console.log('\nEdges:');
  for (const edge of workflow.edges) {
    console.log(
      `  ${edge.sourceId}:${edge.sourcePort} → ${edge.targetId}:${edge.targetPort}`,
    );
  }

  console.log(`\ninitialNodeId: "${workflow.initialNodeId}"`);

  // Show parallelism plan
  const sorted = getTopologicalSort(workflow)!;
  const levels = getLevels(workflow, sorted);
  console.log(`\nExecution plan (${levels.length} levels):`);
  for (const [i, level] of levels.entries()) {
    const names = level.map((n) => n.data.label);
    console.log(
      `  Level ${i}: ${names.join(' | ')}${level.length > 1 ? ' ⚡' : ''}`,
    );
  }

  // Run for user u1
  console.log('\n--- Run: userId = "u1" ---\n');
  const { outputs, log } = await runWorkflow(workflow, 'u1');
  for (const line of log) console.log(line);

  const sendResult = outputs.get('send_email');
  console.log(`\nResult: ${JSON.stringify(sendResult, null, 2)}`);

  // Run for user u2
  console.log('\n--- Run: userId = "u2" ---\n');
  const { outputs: out2, log: log2 } = await runWorkflow(workflow, 'u2');
  for (const line of log2) console.log(line);

  const sendResult2 = out2.get('send_email');
  console.log(`\nResult: ${JSON.stringify(sendResult2, null, 2)}`);

  // Show port queries
  console.log('\n--- Port queries ---');
  console.log(
    'Edges into compose:user →',
    getEdgesByPort(workflow, 'compose', 'user').map((e) => e.id),
  );
  console.log(
    'Edges into compose:summary →',
    getEdgesByPort(workflow, 'compose', 'summary').map((e) => e.id),
  );

  // Show fan-out from webhook
  const sources = getSources(workflow);
  console.log(
    'Source nodes (inDegree 0):',
    sources.map((n) => n.id),
  );
}

main();
