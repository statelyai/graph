import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackResult = {
  filename: string;
};

type PackageJson = {
  exports: Record<string, string>;
};

type ExportCheck = {
  phase: 'core' | 'optional';
  runtime: string[];
  types: string[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

function getExportSpecifier(exportKey: string): string {
  return exportKey === '.'
    ? '@statelyai/graph'
    : `@statelyai/graph/${exportKey.slice(2)}`;
}

function buildRuntimeCheckScript(
  exportKeys: string[],
  exportChecks: Record<string, ExportCheck>,
): string {
  const importLines = exportKeys.map(
    (key, index) =>
      `const m${index + 1} = await import(${JSON.stringify(getExportSpecifier(key))});`,
  );
  const assertionBlocks = exportKeys.map((key, index) =>
    [
      '{',
      ...exportChecks[key].runtime.map((line) =>
        line.replaceAll('$MOD', `m${index + 1}`),
      ),
      '}',
    ].join('\n'),
  );

  return `
import assert from 'node:assert/strict';
const m0 = await import('@statelyai/graph');
${importLines.join('\n')}

${assertionBlocks.join('\n\n')}
  `.trimStart();
}

function buildTypeCheckScript(
  exportKeys: string[],
  exportChecks: Record<string, ExportCheck>,
): string {
  const importLines = exportKeys.map(
    (key, index) =>
      `import * as m${index + 1} from ${JSON.stringify(getExportSpecifier(key))};`,
  );
  const assertionBlocks = exportKeys.map((key, index) =>
    [
      '{',
      ...exportChecks[key].types.map((line) =>
        line.replaceAll('$MOD', `m${index + 1}`),
      ),
      '}',
    ].join('\n'),
  );

  return `
import * as m0 from '@statelyai/graph';
${importLines.join('\n')}

${assertionBlocks.join('\n\n')}
  `.trimStart();
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(join(rootDir, 'package.json'), 'utf8'),
  ) as PackageJson;
  const publishedExportKeys = Object.keys(packageJson.exports).filter(
    (key) => key !== './package.json',
  );
  const exportChecks: Record<string, ExportCheck> = {
    '.': {
      phase: 'core',
      runtime: [
        `assert.equal(typeof $MOD.createGraph, 'function');`,
        `assert.equal(typeof $MOD.createVisualGraph, 'function');`,
        `const graph = $MOD.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }, { id: 'e2', sourceId: 'b', targetId: 'c' }] });`,
        `const visualGraph = $MOD.createVisualGraph(graph);`,
        `assert.deepEqual([graph.id, visualGraph.nodes.length], ['', 3]);`,
        `assert.deepEqual([ $MOD.getShortestPath(graph, { from: 'a', to: 'c' })?.source.id, ...($MOD.getShortestPath(graph, { from: 'a', to: 'c' })?.steps.map((step) => step.node.id) ?? []) ], ['a', 'b', 'c']);`,
      ],
      types: [
        `const graph: m0.Graph = $MOD.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `graph.nodes[0]?.id;`,
      ],
    },
    './algorithms': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }, { id: 'e2', sourceId: 'b', targetId: 'c' }] });`,
        `assert.equal(typeof $MOD.getTopologicalSort, 'function');`,
        `assert.equal(typeof $MOD.getConnectedComponents, 'function');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const topo = $MOD.getTopologicalSort(graph);`,
        `topo?.[0]?.id;`,
      ],
    },
    './format-support': {
      phase: 'core',
      runtime: [
        `assert.equal($MOD.getFormatSupportEntry('dot')?.features.roundTrip, 'partial');`,
      ],
      types: [
        `const support = $MOD.getFormatSupportEntry('graphml');`,
        `support?.features.ports;`,
      ],
    },
    './adjacency-list': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }, { id: 'e2', sourceId: 'b', targetId: 'c' }] });`,
        `assert.deepEqual($MOD.toAdjacencyList(graph), { a: ['b'], b: ['c'], c: [] });`,
        `assert.equal($MOD.fromAdjacencyList($MOD.toAdjacencyList(graph)).edges.length, 2);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const adjacency = $MOD.toAdjacencyList(graph);`,
        `adjacency.a?.[0];`,
      ],
    },
    './converter': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }, { id: 'e2', sourceId: 'b', targetId: 'c' }] });`,
        `assert.deepEqual($MOD.adjacencyListConverter.to(graph), { a: ['b'], b: ['c'], c: [] });`,
        `assert.deepEqual($MOD.edgeListConverter.to(graph), [['a', 'b'], ['b', 'c']]);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const edgeList = $MOD.edgeListConverter.to(graph);`,
        `edgeList[0]?.[0];`,
      ],
    },
    './cytoscape': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.fromCytoscapeJSON($MOD.toCytoscapeJSON(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const cyto = $MOD.toCytoscapeJSON(graph);`,
        `cyto.elements.nodes[0]?.data.id;`,
      ],
    },
    './d3': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.fromD3Graph($MOD.toD3Graph(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const d3 = $MOD.toD3Graph(graph);`,
        `d3.links[0]?.source;`,
      ],
    },
    './d2': {
      phase: 'core',
      runtime: [
        `const graph = $MOD.fromD2('a -> b: hello');`,
        `assert.equal(graph.edges[0]?.label, 'hello');`,
        `assert.equal($MOD.fromD2($MOD.toD2(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = $MOD.fromD2('a -> b');`,
        `const d2 = $MOD.toD2(graph);`,
        `d2.toUpperCase();`,
      ],
    },
    './dot': {
      phase: 'optional',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', sourcePort: 'out', targetId: 'b', targetPort: 'in' }] });`,
        `assert.equal($MOD.fromDOT($MOD.toDOT(graph)).edges[0]?.sourcePort, 'out');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const dot = $MOD.toDOT(graph);`,
        `dot.toUpperCase();`,
      ],
    },
    './edge-list': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }, { id: 'e2', sourceId: 'b', targetId: 'c' }] });`,
        `assert.deepEqual($MOD.toEdgeList(graph), [['a', 'b'], ['b', 'c']]);`,
        `assert.equal($MOD.fromEdgeList($MOD.toEdgeList(graph)).edges.length, 2);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const edgeList = $MOD.toEdgeList(graph);`,
        `edgeList[0]?.[1];`,
      ],
    },
    './elk': {
      phase: 'core',
      runtime: [
        `const graph = m0.createVisualGraph({ nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', x: 20, y: 0, width: 10, height: 10 }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 0, height: 0 }] });`,
        `assert.equal($MOD.fromELK($MOD.toELK(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = m0.createVisualGraph({ nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', x: 20, y: 0, width: 10, height: 10 }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 0, height: 0 }] });`,
        `const elkGraph = $MOD.toELK(graph);`,
        `elkGraph.children?.[0]?.id;`,
      ],
    },
    './gexf': {
      phase: 'optional',
      runtime: [
        `const graph = m0.createGraph({ id: 'g', initialNodeId: 'a', direction: 'right', data: { ok: true }, nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const parsed = $MOD.fromGEXF($MOD.toGEXF(graph));`,
        `assert.equal(parsed.initialNodeId, 'a');`,
        `assert.deepEqual(parsed.data, { ok: true });`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const xml = $MOD.toGEXF(graph);`,
        `xml.toUpperCase();`,
      ],
    },
    './gml': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b', parentId: 'a' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.fromGML($MOD.toGML(graph)).nodes[1]?.parentId, 'a');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b', parentId: 'a' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const gml = $MOD.toGML(graph);`,
        `gml.toUpperCase();`,
      ],
    },
    './graphml': {
      phase: 'optional',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a', ports: [{ name: 'out' }] }, { id: 'b', ports: [{ name: 'in' }] }], edges: [{ id: 'e1', sourceId: 'a', sourcePort: 'out', targetId: 'b', targetPort: 'in' }] });`,
        `assert.equal($MOD.fromGraphML($MOD.toGraphML(graph)).edges[0]?.targetPort, 'in');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const xml = $MOD.toGraphML(graph);`,
        `xml.toUpperCase();`,
      ],
    },
    './jgf': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ initialNodeId: 'a', nodes: [{ id: 'a' }, { id: 'b', parentId: 'a' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.fromJGF($MOD.toJGF(graph)).nodes[1]?.parentId, 'a');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const jgf = $MOD.toJGF(graph);`,
        `jgf.graph.nodes[0]?.id;`,
      ],
    },
    './mermaid': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.match($MOD.toMermaidFlowchart(graph), /flowchart/i);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const flowchart = $MOD.toMermaidFlowchart(graph);`,
        `flowchart.toUpperCase();`,
      ],
    },
    './tgf': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.fromTGF($MOD.toTGF(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const tgf = $MOD.toTGF(graph);`,
        `tgf.toUpperCase();`,
      ],
    },
    './xyflow': {
      phase: 'core',
      runtime: [
        `const graph = m0.createVisualGraph({ nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', x: 20, y: 0, width: 10, height: 10 }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 0, height: 0 }] });`,
        `assert.equal($MOD.fromXYFlow($MOD.toXYFlow(graph)).edges.length, 1);`,
      ],
      types: [
        `const graph = m0.createVisualGraph({ nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }, { id: 'b', x: 20, y: 0, width: 10, height: 10 }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 0, height: 0 }] });`,
        `const flow = $MOD.toXYFlow(graph);`,
        `flow.nodes[0]?.id;`,
      ],
    },
    './queries': {
      phase: 'core',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.getNeighbors(graph, 'a')[0]?.id, 'b');`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const neighbors = $MOD.getNeighbors(graph, 'a');`,
        `neighbors[0]?.id;`,
      ],
    },
    './schemas': {
      phase: 'optional',
      runtime: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `assert.equal($MOD.GraphSchema.safeParse(graph).success, true);`,
        `assert.equal($MOD.isGraph(graph), true);`,
        `assert.deepEqual($MOD.getGraphIssues(graph), []);`,
      ],
      types: [
        `const graph = m0.createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });`,
        `const issues: $MOD.GraphValidationIssue[] = $MOD.getGraphIssues(graph);`,
        `issues[0]?.message;`,
      ],
    },
  };
  const missingChecks = publishedExportKeys.filter((key) => !(key in exportChecks));
  const staleChecks = Object.keys(exportChecks).filter(
    (key) => !publishedExportKeys.includes(key),
  );

  if (missingChecks.length > 0 || staleChecks.length > 0) {
    throw new Error(
      [
        missingChecks.length > 0
          ? `Missing smoke-package coverage for exports: ${missingChecks.join(', ')}`
          : '',
        staleChecks.length > 0
          ? `Stale smoke-package coverage for non-exported subpaths: ${staleChecks.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  const coreExportKeys = publishedExportKeys.filter(
    (key) => exportChecks[key].phase === 'core',
  );
  const optionalExportKeys = publishedExportKeys.filter(
    (key) => exportChecks[key].phase === 'optional',
  );
  const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const jsonStart = packOutput.indexOf('[\n  {');
  const jsonEnd = packOutput.lastIndexOf('\n]');
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Unable to parse npm pack output as JSON:\n${packOutput}`);
  }
  const parsedOutput = JSON.parse(
    packOutput.slice(jsonStart, jsonEnd + 2),
  ) as PackResult[];
  const [{ filename }] = parsedOutput;
  const tarballPath = join(rootDir, filename);
  const tempDir = await mkdtemp(join(tmpdir(), 'statelyai-graph-smoke-'));
  const consumerDir = join(tempDir, 'consumer');
  const coreCheckPath = join(consumerDir, 'check-core.mjs');
  const coreTypesPath = join(consumerDir, 'check-core.ts');
  const optionalCheckPath = join(consumerDir, 'check-optional.mjs');
  const optionalTypesPath = join(consumerDir, 'check-optional.ts');

  try {
    await mkdir(consumerDir, { recursive: true });
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify(
        {
          name: 'graph-smoke-consumer',
          private: true,
          type: 'module',
        },
        null,
        2,
      ) + '\n',
    );

    execFileSync('pnpm', ['add', '--ignore-workspace', tarballPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });
    execFileSync('pnpm', ['add', '--ignore-workspace', '--save-dev', 'typescript'], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    await writeFile(
      coreCheckPath,
      buildRuntimeCheckScript(coreExportKeys, exportChecks),
    );

    execFileSync('node', [coreCheckPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    await writeFile(
      coreTypesPath,
      buildTypeCheckScript(coreExportKeys, exportChecks),
    );

    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--moduleResolution',
        'bundler',
        '--module',
        'preserve',
        '--target',
        'esnext',
        '--strict',
        '--skipLibCheck',
        coreTypesPath,
      ],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    execFileSync(
      'pnpm',
      ['add', '--ignore-workspace', 'dotparser', 'fast-xml-parser', 'zod'],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    await writeFile(
      optionalCheckPath,
      buildRuntimeCheckScript(optionalExportKeys, exportChecks),
    );

    execFileSync('node', [optionalCheckPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    const installedPackageDir = join(
      consumerDir,
      'node_modules',
      '@statelyai',
      'graph',
    );
    const schemaFiles = ['graph.schema.json', 'node.schema.json', 'edge.schema.json'];
    for (const schemaFile of schemaFiles) {
      const schemaText = await readFile(
        join(installedPackageDir, 'schemas', schemaFile),
        'utf8',
      );
      JSON.parse(schemaText);
    }

    await writeFile(
      optionalTypesPath,
      buildTypeCheckScript(optionalExportKeys, exportChecks),
    );

    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--moduleResolution',
        'bundler',
        '--module',
        'preserve',
        '--target',
        'esnext',
        '--strict',
        '--skipLibCheck',
        optionalTypesPath,
      ],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    console.log('Package smoke test passed');
  } finally {
    await unlink(tarballPath).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
