import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

export interface IGraphOracleRequest { operation: 'version' | 'pajek'; source?: string }
export interface IGraphOracleResult {
  oracle: 'igraph'; version: string; python: string; warnings?: string[];
  summary?: { directed: boolean; graph: Record<string, any>;
    nodes: Array<{ id: number; attributes: Record<string, any> }>;
    edges: Array<{ source: number; target: number; attributes: Record<string, any> }> };
}

/** Execute the pinned C-backed reader; no native identity is replaced by its label. */
export async function getIGraphOracle(request: IGraphOracleRequest): Promise<IGraphOracleResult> {
  const python = process.env.GRAPH_NATIVE_PYTHON ?? resolve('.venv-native/bin/python');
  const result = await new Promise<string>((resolveResult, reject) => {
    const child = execFile(python, [resolve('scripts/native/igraph_oracle.py')], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`igraph native oracle failed: ${stderr.trim() || error.message}`));
      else resolveResult(stdout);
    });
    child.stdin!.end(JSON.stringify(request));
  });
  const parsed = JSON.parse(result) as IGraphOracleResult;
  if (parsed.oracle !== 'igraph' || parsed.version !== '1.0.0') throw new Error('igraph native oracle version mismatch');
  return parsed;
}
