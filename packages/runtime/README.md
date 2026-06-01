# @cadcode/runtime

Ties the other packages together for one model evaluation. Given a user source
string and a compile function, it:

1. compiles the TypeScript to CommonJS,
2. executes it with the `@cadcode/core` API injected as globals
   (`rect`, `extrude`, `fillet`, `edges`, `dimension`),
3. walks the resulting model graph through `@cadcode/kernel`, producing a mesh
   for every alive body plus a serialized hierarchy.

All errors — compile, runtime, or geometry — are caught and returned in the
`RunResult`, never thrown, so a bad edit can't crash the host.

The compile step is pluggable (`CompileFn`) so the same `run` works in Node
(native esbuild) and in the browser worker (esbuild-wasm).

In the shipped viewer-only setup, the **CLI** bundles the entry file + its imports
with esbuild and calls `runCode` directly; `run` (single-file, with a compile step)
is retained for tests and the optional browser path.

## Files

- `src/run.ts` — `runCode(code)` executes already-bundled CJS with the API
  injected and walks the graph into meshes; `run(source, { compile })` is the
  single-file convenience wrapper. Imports `compile` as a **type only**, so
  importing `runCode`/`run` does not pull native esbuild into a browser bundle.
- `src/compile.ts` — the `CompileFn` type and `nodeCompile` (native esbuild).
- `src/index.ts` — public entry point.
- `src/run.test.ts` — end-to-end test (valid source → mesh; invalid → errors).

## Subpath exports

- `@cadcode/runtime` — everything (includes `nodeCompile`, hence native esbuild).
- `@cadcode/runtime/run` — just `run`, with no native-esbuild dependency; this is
  what the browser worker imports.
- `@cadcode/runtime/compile-node` — `nodeCompile` on its own.
