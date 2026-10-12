import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, join, delimiter } from "node:path";
export async function getGraphSONOracle(
  source: unknown | "GENERATE_MODERN",
): Promise<any> {
  const java =
    process.env.GRAPH_NATIVE_JAVA ??
    (process.env.JAVA_HOME
      ? join(process.env.JAVA_HOME, "bin/java")
      : resolve(".tools-native/java/bin/java"));
  const metadata = JSON.parse(
    await readFile(resolve("scripts/native/graphson-tools.json"), "utf8"),
  );
  const jars =
    process.env.GRAPH_NATIVE_GRAPHSON_LIB ??
    metadata.artifacts
      .map((artifact: { filename: string }) =>
        resolve(".tools-native/graphson/lib", artifact.filename),
      )
      .join(delimiter);
  const script = resolve("scripts/native/graphson_oracle.groovy");
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      java,
      ["-Djava.awt.headless=true", "-cp", jars, "groovy.ui.GroovyMain", script],
      { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `TinkerPop native oracle failed: ${stderr || error.message}`,
            ),
          );
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result.version !== "3.8.2")
            throw new Error(`Unexpected TinkerPop ${result.version}`);
          resolveResult(result);
        } catch (error) {
          reject(error);
        }
      },
    );
    child.stdin!.end(
      source === "GENERATE_MODERN" ? source : JSON.stringify(source),
    );
  });
}
