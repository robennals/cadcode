// Bundles a model file and its imports from disk into a single CommonJS string
// using esbuild. Following `import` statements is what lets a model file pull in
// other local files (and npm libraries). Returns the bundled code plus the list
// of input files so the dev server knows what to watch.
import { build } from "esbuild";
import { resolve } from "node:path";

export interface BundleResult {
  code: string;
  /** Absolute paths of every file that fed into the bundle. */
  inputs: string[];
  /** Set when bundling failed (e.g. missing import, syntax error). */
  error?: string;
}

export async function bundleFile(absEntry: string): Promise<BundleResult> {
  try {
    const result = await build({
      entryPoints: [absEntry],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "es2022",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    const inputs = Object.keys(result.metafile?.inputs ?? {}).map((p) => resolve(p));
    return { code, inputs };
  } catch (e) {
    const err = e as { message?: string };
    return { code: "", inputs: [absEntry], error: err.message ?? String(e) };
  }
}
