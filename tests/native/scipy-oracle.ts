import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
export interface SciPyOracleResult {
  oracle: 'scipy'; scipy: '1.18.1'; numpy: '2.5.4'; shape: [number, number]; sparse: boolean;
  entries: Array<{ row: number; col: number; value: number }>; storedZeros: number | null;
  dense?: number[][]; roundTrip: string;
}
export async function getSciPyOracle(source: string, options?: { symmetry?: 'general' | 'symmetric'; field?: 'real' | 'integer' | 'pattern' }): Promise<SciPyOracleResult> {
  const python = process.env.GRAPH_NATIVE_PYTHON ?? resolve('.venv-native/bin/python');
  const output = await new Promise<string>((resolveResult, reject) => {
    const child = execFile(python, [resolve('scripts/native/scipy_oracle.py')], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(`SciPy oracle failed: ${stderr.trim() || error.message}`)) : resolveResult(stdout));
    child.stdin!.end(JSON.stringify({ source, options }));
  });
  const result = JSON.parse(output) as SciPyOracleResult;
  if (result.scipy !== '1.18.1' || result.numpy !== '2.5.4') throw new Error('SciPy oracle version mismatch');
  return result;
}
