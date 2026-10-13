import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import type { RDFDataset } from '../../src/formats/rdf';
import type { RDFSyntax } from '../../src/formats/rdf/syntax';
export interface RDFLibOracleRequest { operation?: 'version'; source?: string; format?: RDFSyntax; baseIRI?: string; expected?: RDFDataset }
export interface RDFLibOracleResult { oracle: 'rdflib'; version: string; python: string; dataset?: RDFDataset; isomorphic?: boolean; store?: { quadCount: number; namedGraphCount: number; observer: string } }
/** Actual pinned Python parser plus RDFLib isomorphism, with bounded process/output. */
export async function getRDFLibOracle(request: RDFLibOracleRequest): Promise<RDFLibOracleResult> {
  const python = process.env.GRAPH_NATIVE_PYTHON ?? resolve('.venv-native/bin/python');
  const result = await new Promise<string>((resolveResult, reject) => {
    const child = execFile(python, [resolve('scripts/native/rdflib_oracle.py')], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`RDFLib native oracle failed: ${stderr.trim() || error.message}`)); else resolveResult(stdout);
    });
    child.stdin!.end(JSON.stringify(request));
  });
  const parsed = JSON.parse(result) as RDFLibOracleResult;
  if (parsed.oracle !== 'rdflib' || parsed.version !== '7.6.0') throw new Error('RDFLib native oracle version mismatch');
  return parsed;
}
