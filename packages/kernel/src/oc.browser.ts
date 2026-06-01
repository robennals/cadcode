import { setOC } from "replicad";
// @ts-expect-error - emscripten module has no types for this entry
import ocFactory from "replicad-opencascadejs/src/replicad_single.js";
import wasmUrl from "replicad-opencascadejs/src/replicad_single.wasm?url";

let ready: Promise<void> | undefined;

/** Idempotently load OpenCascade into replicad (browser build). */
export function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const OC = await (ocFactory as unknown as (opts: {
        locateFile: () => string;
      }) => Promise<unknown>)({ locateFile: () => wasmUrl });
      setOC(OC as never);
    })();
  }
  return ready;
}
