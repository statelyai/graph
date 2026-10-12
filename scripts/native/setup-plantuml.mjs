import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve('.tools-native');
const manifest = JSON.parse(readFileSync(new URL('./plantuml-tools.json', import.meta.url), 'utf8'));
mkdirSync(root, { recursive: true });
function getArtifact(spec, name) {
  const target = join(root, name);
  if (!existsSync(target)) execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '180', spec.url, '--output', target], { timeout: 185000 });
  const actual = createHash('sha256').update(readFileSync(target)).digest('hex');
  if (actual !== spec.sha256) throw new Error(`Native oracle checksum mismatch: ${name}; delete the task-local file before retrying`);
  return target;
}
getArtifact(manifest.plantuml, 'plantuml.jar');
if (process.argv.includes('--jre')) {
  if (`${process.platform}-${process.arch}` !== manifest.localJRE.platform) throw new Error('Pinned local JRE is darwin-arm64; use setup-java21/JAVA_HOME on CI');
  const archive = getArtifact(manifest.localJRE, 'jre.tar.gz');
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  if (entries.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('Unsafe native JRE archive path');
  const extraction = join(root, 'jre');
  if (!existsSync(extraction)) { mkdirSync(extraction); execFileSync('tar', ['-xzf', archive, '-C', extraction]); }
  const folders = readdirSync(extraction);
  if (folders.length !== 1) throw new Error('Unexpected pinned JRE archive layout');
  const home = join(extraction, folders[0], 'Contents', 'Home');
  if (!existsSync(join(root, 'java'))) symlinkSync(home, join(root, 'java'), 'dir');
  execFileSync(join(root, 'java', 'bin', 'java'), ['-version'], { stdio: 'inherit' });
}
console.log('Pinned PlantUML oracle ready at .tools-native/plantuml.jar');
