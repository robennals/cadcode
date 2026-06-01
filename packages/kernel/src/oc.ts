import { setOC } from "replicad";
import ocFactory from "replicad-opencascadejs/src/replicad_single.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let ready: Promise<void> | undefined;

/** Idempotently load OpenCascade into replicad (Node build). Safe to call many times. */
export function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const wasmPath = require.resolve(
        "replicad-opencascadejs/src/replicad_single.wasm",
      );
      const OC = await (ocFactory as unknown as (opts: {
        locateFile: () => string;
      }) => Promise<unknown>)({ locateFile: () => wasmPath });
      setOC(OC as never);
    })();
  }
  return ready;
}
