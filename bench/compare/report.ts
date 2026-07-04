/**
 * Report generation for the cross-library benchmark.
 *
 * Two entry points:
 *   - `renderRawMarkdown(results)` — the standalone `results/<date>.md` snapshot.
 *   - `renderDocsTables(results)` — the tables block injected into
 *     `docs/benchmarks.md` between the `<!-- BENCH:TABLES -->` markers, so the
 *     published doc's numbers are generated from JSON, never hand-typed.
 *
 * CLI:  tsx bench/compare/report.ts <results.json>
 *   Regenerates docs/benchmarks.md and results/<date>.md from a stored JSON
 *   run without re-benchmarking. Used by `pnpm bench:report`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Cell {
  lib: string;
  shape: string;
  size: number;
  workload: string;
  medianMs: number | null; // null = unsupported / skipped / crashed
  skipped?: 'too-slow' | 'error';
  error?: string;
  samples?: number;
}

export interface BenchEnv {
  date: string; // ISO timestamp
  node: string; // process.version
  os: string; // `${platform}/${arch}`
  cpu: string; // model
  cores: number;
}

export interface BenchResults {
  env: BenchEnv;
  libs: string[]; // adapter names, in table-column order
  libVersions: Record<string, string>; // lib name -> installed version
  sizes: number[];
  shapes: string[]; // shape names, in row order
  workloads: string[]; // workload names, in section order
  slowSkipMs: number;
  cells: Cell[];
}

/** Human-readable title per workload for the docs section headings. */
const WORKLOAD_TITLES: Record<string, string> = {
  build: 'Build',
  bfs: 'BFS',
  sssp: 'Single-pair shortest path (sssp)',
  pagerank: 'PageRank',
  components: 'Connected components',
  betweenness: 'Betweenness centrality',
  degreeSweep: 'Degree sweep',
};

function fmt(cell: Cell | undefined, best: number | null): string {
  if (!cell || cell.medianMs === null) {
    if (cell?.skipped === 'too-slow') return '>10s';
    if (cell?.skipped === 'error') return 'crash';
    return '—';
  }
  const ms =
    cell.medianMs >= 100
      ? cell.medianMs.toFixed(0)
      : cell.medianMs >= 1
        ? cell.medianMs.toFixed(1)
        : cell.medianMs.toFixed(2);
  if (best !== null && best > 0) {
    const ratio = cell.medianMs / best;
    return ratio <= 1.001 ? `**${ms}**` : `${ms} (${ratio.toFixed(1)}×)`;
  }
  return ms;
}

/** One markdown table per workload, keyed by shape × size rows. */
function renderTable(results: BenchResults, workload: string): string {
  const { libs, sizes, shapes, cells } = results;
  const rows = cells.filter((c) => c.workload === workload);
  if (rows.length === 0) return '';
  let md = `| graph | ${libs.join(' | ')} |\n|---|${libs.map(() => '---').join('|')}|\n`;
  for (const size of sizes) {
    for (const shape of shapes) {
      const rowCells = libs.map((lib) =>
        rows.find((c) => c.lib === lib && c.size === size && c.shape === shape),
      );
      if (rowCells.every((c) => c === undefined)) continue;
      const best = Math.min(
        ...rowCells.filter((c) => c?.medianMs != null).map((c) => c!.medianMs!),
      );
      md += `| ${shape} ${size.toLocaleString('en-US')} | ${rowCells
        .map((c) => fmt(c, Number.isFinite(best) ? best : null))
        .join(' | ')} |\n`;
    }
  }
  return md;
}

function envLine(env: BenchEnv): string {
  return `${env.cpu} · ${env.cores} cores · node ${env.node} (${env.os})`;
}

/** The standalone `results/<date>.md` snapshot (self-contained, no prose). */
export function renderRawMarkdown(results: BenchResults): string {
  let md = `# Cross-library benchmark\n\n`;
  md += `- Date: ${results.env.date}\n`;
  md += `- Machine: ${envLine(results.env)}\n`;
  md += `- Method: identical seeded edge lists per cell; idiomatic public API per library; median of ≥5 runs (1.5 s budget) after warmup. Bold = fastest; (n.n×) = slower than fastest; — = no equivalent API; >10s = skipped after exceeding ${results.slowSkipMs / 1000} s.\n`;
  md += `- graphlib's \`sssp\` is full single-source Dijkstra (its only shortest-path API).\n`;
  md += `- Betweenness capped at n=1,000 (Brandes is O(V·E) for every library).\n`;
  md += `- Sub-millisecond cells (e.g. scaleFree traversals, which reach few nodes from n0) are dominated by call overhead — treat their ratios as noise.\n`;
  for (const workload of results.workloads) {
    const table = renderTable(results, workload);
    if (!table) continue;
    md += `\n## ${workload}\n\n${table}`;
  }
  return md;
}

const TABLES_START = '<!-- BENCH:TABLES:START -->';
const TABLES_END = '<!-- BENCH:TABLES:END -->';

/**
 * The generated block for docs/benchmarks.md: the "Measured" line plus one
 * section (heading + description + table) per workload. Curated prose in the
 * doc lives outside the markers and is preserved.
 */
export function renderDocsTables(results: BenchResults): string {
  const { env } = results;
  const versions = results.libs
    .filter((l) => l !== '@statelyai/graph' && results.libVersions[l])
    .map((l) => `${l.replace(' (headless)', '')} ${results.libVersions[l]}`)
    .join(', ');
  const dateOnly = env.date.slice(0, 10);

  let md = `${TABLES_START}\n`;
  md += `<!-- Generated by bench/compare/report.ts — do not edit by hand. Run \`pnpm bench:report\` to regenerate. -->\n\n`;
  md += `- **Measured:** ${dateOnly} on ${env.cpu} (${env.cores} cores), node ${env.node} (${env.os}).`;
  if (versions) md += ` Library versions: ${versions}.`;
  md += `\n`;
  md += `- **Numbers are medians** (milliseconds) of ≥5 runs after warmup, within a 1.5 s sampling budget per cell.\n\n`;
  md += `Cell legend: **bold** = fastest for that row; \`(n.n×)\` = multiple of the fastest; \`—\` = the library has no equivalent API; \`>10s\` = skipped after a prior run exceeded ${results.slowSkipMs / 1000} s; \`crash\` = the library threw (the error is recorded in the JSON results).\n\n`;
  md += `> **Sub-millisecond caveat:** cells under ~0.1 ms (notably scaleFree traversals, which reach few nodes from the start node) are dominated by call overhead. Treat their ratios as noise, in either direction.\n`;

  for (const workload of results.workloads) {
    const table = renderTable(results, workload);
    if (!table) continue;
    md += `\n## ${WORKLOAD_TITLES[workload] ?? workload}\n\n`;
    const desc = WORKLOAD_DESCRIPTIONS[workload];
    if (desc) md += `${desc}\n\n`;
    md += table;
    const note = WORKLOAD_NOTES[workload];
    if (note) md += `\n${note}\n`;
  }
  md += `${TABLES_END}`;
  return md;
}

/** Short description printed under each workload heading in the docs. */
const WORKLOAD_DESCRIPTIONS: Record<string, string> = {
  build: 'Construct the graph from an identical node/edge list.',
  bfs: 'Full directed reachability sweep from node 0. Libraries without a built-in traversal get a minimal queue loop over their neighbor API.',
  sssp: 'Weighted shortest path from node 0 to node n−1. `@statelyai/graph` uses `getShortestPath` (bidirectional Dijkstra); graphology uses `dijkstra.bidirectional`; ngraph uses `ngraph.path` A\\*. graphlib\'s only shortest-path API is full single-source Dijkstra, so its cell pays the all-targets cost — that is the cost a graphlib user pays for one query.',
  betweenness:
    'Run only at n=1,000 — Brandes is O(V·E) for every library, so larger sizes are capped for everyone.',
  degreeSweep: 'Sum the degree of every node via each library\'s degree API.',
};

/** Optional trailing note after a workload's table. */
const WORKLOAD_NOTES: Record<string, string> = {
  bfs: 'The scaleFree rows are sub-millisecond for everyone (few nodes are reachable from node 0); their ratios are noise.',
  sssp: 'graphology wins the scaleFree rows; on those graphs node n−1 is typically unreachable from node 0 and the search terminates almost immediately, so the cells are sub-millisecond for both bidirectional implementations.',
  pagerank:
    'ngraph and graphlib have no PageRank. cytoscape\'s PageRank threw `Invalid array length` on three of the four 100k graphs.',
  components:
    'graphlib\'s `alg.components` uses recursive DFS and overflowed the call stack (`Maximum call stack size exceeded`) at 10,000 nodes on the random, grid, and layeredDag graphs, and at 100,000 on scaleFree. Where it survived, it was 17–50× slower; the remaining 100k cells were skipped after exceeding 10 s.',
};

/** Replace the generated block in docs/benchmarks.md, preserving all prose. */
export function injectDocsTables(docSource: string, results: BenchResults): string {
  const start = docSource.indexOf(TABLES_START);
  const end = docSource.indexOf(TABLES_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `docs/benchmarks.md is missing ${TABLES_START} / ${TABLES_END} markers`,
    );
  }
  const before = docSource.slice(0, start);
  const after = docSource.slice(end + TABLES_END.length);
  return before + renderDocsTables(results) + after;
}

// --- CLI: regenerate docs + raw md from a stored JSON, no re-run ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_PATH = join(__dirname, '..', '..', 'docs', 'benchmarks.md');
const RESULTS_DIR = join(__dirname, 'results');

/** Write results/<date>.md and refresh docs/benchmarks.md tables from results. */
export function writeReports(results: BenchResults): void {
  const stamp = results.env.date.slice(0, 10);
  writeFileSync(join(RESULTS_DIR, `${stamp}.md`), renderRawMarkdown(results));
  const doc = readFileSync(DOCS_PATH, 'utf8');
  writeFileSync(DOCS_PATH, injectDocsTables(doc, results));
  console.log(
    `Wrote results/${stamp}.md and refreshed docs/benchmarks.md tables.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonArg = process.argv[2];
  if (!jsonArg) {
    console.error('usage: tsx bench/compare/report.ts <results.json>');
    process.exit(1);
  }
  const results: BenchResults = JSON.parse(readFileSync(jsonArg, 'utf8'));
  writeReports(results);
  console.log(`Regenerated from ${basename(jsonArg)}.`);
}
