// Orchestrates one model evaluation: execute the user's (bundled) code with the
// core API injected as globals, then walk the resulting graph through the kernel
// to produce meshes for every alive body plus a serialized hierarchy. All errors
// (execution, geometry) are caught and returned, never thrown. User code runs in
// a `vm` context with a wall-clock timeout, so a runaway loop in a model file
// can't hang the host process. OCCT shapes are disposed after tessellation.
import vm from "node:vm";
import { createBuilder } from "@cadcode/core";
import {
  emptyResult,
  errorMessage,
  type Model,
  type RunResult,
  type HierarchyNode,
  type BodyMesh,
} from "@cadcode/protocol";
import {
  extrudeRect,
  filletAll,
  tessellate,
  dispose,
  type Solid,
} from "@cadcode/kernel";
import type { CompileFn } from "./compile";

const DEFAULT_TIMEOUT_MS = 5000;

function buildHierarchy(model: Model): HierarchyNode[] {
  const aliveSet = new Set(model.alive);
  return model.order.map((id) => {
    const node = model.nodes[id];
    const children = "sources" in node ? node.sources : [];
    return { id, op: node.op, label: node.op, alive: aliveSet.has(id), children };
  });
}

/** Walk the graph, producing a replicad Solid for each body id into `solids`. */
function evaluate(model: Model, solids: Map<string, Solid>): void {
  for (const id of model.order) {
    const node = model.nodes[id];
    if (node.op === "rect") continue; // regions are realised by their consumer
    if (node.op === "extrude") {
      const region = model.nodes[node.region];
      if (region?.op !== "rect") throw new Error(`extrude: unknown region '${node.region}'`);
      solids.set(id, extrudeRect(region.width, region.height, node.height));
    } else if (node.op === "fillet") {
      const base = solids.get(node.body);
      if (!base) throw new Error(`fillet: no geometry for body '${node.body}'`);
      if (node.edges.kind !== "all") throw new Error("M0 only supports edges(...).all");
      solids.set(id, filletAll(base, node.radius));
    }
  }
}

/**
 * Execute already-bundled CommonJS model code with the core API injected as
 * globals, then walk the graph into meshes. The CLI bundles an entry file + its
 * imports and calls this; `run` below is the single-file convenience wrapper.
 */
export function runCode(
  code: string,
  opts: { timeoutMs?: number } = {},
): RunResult {
  const builder = createBuilder();
  const dimension = () => {
    throw new Error("dimension() requires the constraint solver (added in M1)");
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  // The injected API is a single source of truth — both the names and the
  // implementations come from this one object (no parallel name list to desync).
  const context = vm.createContext({
    exports: mod.exports,
    module: mod,
    console,
    rect: builder.rect,
    extrude: builder.extrude,
    fillet: builder.fillet,
    edges: builder.edges,
    dimension,
  });

  try {
    vm.runInContext(code, context, {
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      filename: "cadcode-model.js",
    });
  } catch (e) {
    return emptyResult([errorMessage(e)]);
  }

  const model = builder.getModel();
  const solids = new Map<string, Solid>();
  try {
    evaluate(model, solids);
    const meshes: BodyMesh[] = model.alive.map((id) =>
      tessellate(id, solids.get(id)),
    );
    return { hierarchy: buildHierarchy(model), meshes, errors: [] };
  } catch (e) {
    return { hierarchy: buildHierarchy(model), meshes: [], errors: [errorMessage(e)] };
  } finally {
    for (const s of solids.values()) dispose(s);
  }
}

/** Single-file convenience: compile a source string, then run it. */
export async function run(
  source: string,
  opts: { compile: CompileFn; timeoutMs?: number },
): Promise<RunResult> {
  let code: string;
  try {
    code = await opts.compile(source);
  } catch (e) {
    return emptyResult([errorMessage(e)]);
  }
  return runCode(code, { timeoutMs: opts.timeoutMs });
}
