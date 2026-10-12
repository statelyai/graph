import { execFile } from 'node:child_process';
import { resolve, join } from 'node:path';
export async function getPlantUMLOracle(source: string, format: 'svg' | 'xmi' | 'xmi:star' = 'svg'): Promise<string> {
  const java = process.env.GRAPH_NATIVE_JAVA ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : resolve('.tools-native/java/bin/java'));
  const jar = process.env.GRAPH_NATIVE_PLANTUML ?? resolve('.tools-native/plantuml.jar');
  return new Promise<string>((resolveResult, reject) => {
    const child = execFile(java, ['-Djava.awt.headless=true', '-jar', jar, format === 'xmi:star' ? '--xmi:star' : `-t${format}`, '-pipe'], { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error || /(?:^|\n)ERROR(?:\n|$)/.test(stderr) || stdout.includes('Syntax Error?')) reject(new Error(`PlantUML native oracle failed: ${stderr.trim() || (error ? `${error.message}; killed=${error.killed}; signal=${error.signal}` : 'native syntax error')}`));
      else resolveResult(stdout);
    }); child.stdin!.end(source);
  });
}

export async function getPlantUMLOracleVersion(): Promise<{ compiler: string; compilerExitCode: number; java: string }> {
  const java = process.env.GRAPH_NATIVE_JAVA ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : resolve('.tools-native/java/bin/java'));
  const jar = process.env.GRAPH_NATIVE_PLANTUML ?? resolve('.tools-native/plantuml.jar');
  const compiler = await new Promise<{ text: string; exitCode: number }>((resolveResult, reject) => {
    const child = execFile(java, ['-Djava.awt.headless=true', '-jar', jar, '--version'], { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== 'number')) reject(new Error(`${stderr || error.message}; killed=${error.killed}; signal=${error.signal}`));
      else resolveResult({ text: stdout + stderr, exitCode: error?.code as number ?? 0 });
    }); child.stdin!.end();
  });
  const javaVersion = await new Promise<string>((resolveResult, reject) => {
    const child = execFile(java, ['-version'], { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolveResult(stdout + stderr)); child.stdin!.end();
  });
  return { compiler: compiler.text, compilerExitCode: compiler.exitCode, java: javaVersion };
}
