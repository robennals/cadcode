import "./processShim";
import { initialize, transform } from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { init as initKernel } from "@cadcode/kernel/oc-browser";
import { run } from "@cadcode/runtime/run";
import type { WorkerRequest, WorkerResponse } from "@cadcode/protocol";

let ready: Promise<void> | undefined;
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await initialize({ wasmURL });
      await initKernel();
    })();
  }
  return ready;
}

const compile = async (source: string) =>
  (await transform(source, { loader: "ts", format: "cjs", target: "es2022" })).code;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== "run") return;
  try {
    await ensureReady();
    const result = await run(e.data.source, { compile });
    const transfers = result.meshes.flatMap((m) => [
      m.positions.buffer,
      m.normals.buffer,
      m.indices.buffer,
    ]);
    const msg: WorkerResponse = { type: "result", result };
    (self as unknown as Worker).postMessage(msg, transfers);
  } catch (err) {
    const msg: WorkerResponse = {
      type: "error",
      message: String((err as Error).message ?? err),
    };
    (self as unknown as Worker).postMessage(msg);
  }
};
