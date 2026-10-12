import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

export interface NetworkXOracleRequest {
  operation: 'version' | 'node-link' | 'gml' | 'pajek';
  data?: unknown;
  source?: string;
  options?: { source?: string; target?: string; name?: string; key?: string; edges?: string; nodes?: string; label?: string | null };
}
export interface NetworkXOracleResult {
  oracle: 'networkx'; version: string; python: string;
  summary?: { directed: boolean; multigraph: boolean; graph: Record<string, any>;
    nodes: Array<{ id: string | number | boolean; attributes: Record<string, any> }>;
    edges: Array<{ source: string | number | boolean; target: string | number | boolean; key?: string | number | boolean; attributes: Record<string, any> }> };
  roundTrip?: Record<string, any>;
}

/** Actual pinned Python NetworkX, with bounded process lifetime and output size. */
export async function getNetworkXOracle(request: NetworkXOracleRequest): Promise<NetworkXOracleResult> {
  const python = process.env.GRAPH_NATIVE_PYTHON ?? resolve('.venv-native/bin/python');
  const result = await new Promise<string>((resolveResult, reject) => {
    const child = execFile(python, [resolve('scripts/native/networkx_oracle.py')], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`NetworkX native oracle failed: ${stderr.trim() || error.message}`));
      else resolveResult(stdout);
    });
    child.stdin!.end(JSON.stringify(request));
  });
  const parsed = JSON.parse(result) as NetworkXOracleResult;
  if (parsed.oracle !== 'networkx' || parsed.version !== '3.7') throw new Error('NetworkX native oracle version mismatch');
  return parsed;
}
