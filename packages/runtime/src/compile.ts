// Compiles user TypeScript to runnable CommonJS. `CompileFn` is the pluggable
// interface; `nodeCompile` is the Node (native esbuild) implementation. The
// browser worker supplies its own esbuild-wasm-based CompileFn instead.
import { transform } from "esbuild";

/** Transforms user TypeScript to runnable CommonJS. Pluggable so the browser
 *  worker can supply an esbuild-wasm version instead. */
export type CompileFn = (source: string) => Promise<string>;

export const nodeCompile: CompileFn = async (source) => {
  const result = await transform(source, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });
  return result.code;
};
