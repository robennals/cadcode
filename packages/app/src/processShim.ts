// The emscripten OpenCascade glue and esbuild-wasm probe `process` for
// environment detection. In a browser worker there is no `process`, so we
// provide a minimal shim. Imported first (before any other module) so it is
// defined by the time those modules evaluate.
const g = globalThis as unknown as { process?: unknown };
g.process ??= {
  env: {},
  argv: [],
  versions: {},
  platform: "browser",
  cwd: () => "/",
};
