import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { CX2JSON } from '../../src/formats/cx2';
export function getCX2Oracle(source: CX2JSON): {
  oracle: string;
  version: string;
  nodes: any[];
  edges: any[];
  attributes: any;
  declarations: any;
  opaque: any;
  status: any;
} {
  const result = spawnSync(
    process.env.GRAPH_NATIVE_PYTHON ?? resolve('.venv-native/bin/python'),
    [resolve('tests/native/cx2-oracle.py')],
    {
      input: JSON.stringify(source),
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `NDEx CX2 oracle failed: ${result.error?.message ?? result.stderr}`
    );
  const output = JSON.parse(result.stdout);
  if (output.oracle !== 'ndex2' || output.version !== '3.12.0')
    throw new Error('NDEx CX2 oracle pin changed');
  return output;
}
