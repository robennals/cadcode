// Loads the OpenCascade WASM kernel into replicad in a Node environment
// (used by tests and the headless CLI export path). Resolves the .wasm via
// createRequire. The browser equivalent is oc.browser.ts.
import { setOC } from "replicad";
import * as ocModule from "replicad-opencascadejs/src/replicad_single.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Depending on the loader (vitest/Vite vs tsx/Node), the emscripten factory may
// arrive as the namespace, its default export, or default.default — pick the
// first thing that's actually callable.
type OcFactory = (opts: { locateFile: () => string }) => Promise<unknown>;
const candidates = [
  ocModule,
  (ocModule as { default?: unknown }).default,
  (ocModule as { default?: { default?: unknown } }).default?.default,
];
const ocFactory = candidates.find((c) => typeof c === "function") as OcFactory;

let ready: Promise<void> | undefined;

/** Idempotently load OpenCascade into replicad (Node build). Safe to call many times. */
export function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const wasmPath = require.resolve(
        "replicad-opencascadejs/src/replicad_single.wasm",
      );
      const OC = await ocFactory({ locateFile: () => wasmPath });
      setOC(OC as never);
    })();
  }
  return ready;
}
