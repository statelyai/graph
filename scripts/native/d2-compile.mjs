// Bounded subprocess: D2's public wrapper has no worker shutdown API.
import { D2 } from '@terrastruct/d2';
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
try {
  const sources = JSON.parse(input);
  const compiler = new D2();
  const results = [];
  for (const source of sources) {
    try {
      const result = await compiler.compile(source);
      results.push({ ok: true, diagram: result.diagram, graphEdges: (result.graph.edges ?? []).map((edge) => ({ srcTableColumnIndex: edge?.srcTableColumnIndex, dstTableColumnIndex: edge?.dstTableColumnIndex })) });
    } catch (error) {
      results.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  process.stdout.write(JSON.stringify(results), () => process.exit(0));
} catch (error) {
  process.stderr.write(String(error), () => process.exit(1));
}
