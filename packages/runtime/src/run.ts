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
  type StageMesh,
} from "@cadcode/protocol";
import {
  extrudeRect,
  extrudeProfile,
  filletAll,
  tessellate,
  regionFaceMesh,
  profileFaceMesh,
  dispose,
  type Solid,
} from "@cadcode/kernel";
import { solveSketch } from "@cadcode/solver";
import type { CompileFn } from "./compile";

const DEFAULT_TIMEOUT_MS = 5000;

/** Solve a sketch node into a closed profile of solved [x,y] corners. */
function profileOf(model: Model, id: string): [number, number][] {
  const node = model.nodes[id];
  if (node.op !== "sketch") throw new Error(`'${id}' is not a sketch`);
  const sol = solveSketch(node);
  if (sol.status !== "ok") throw new Error(sol.message ?? "sketch failed to solve");
  return node.loop.map((pid) => {
    const p = sol.points[pid];
    if (!p) throw new Error(`sketch solution missing point '${pid}'`);
    return [p.x, p.y] as [number, number];
  });
}

/** Walk the graph, producing a replicad Solid for each body id into `solids`. */
function evaluate(model: Model, solids: Map<string, Solid>): void {
  for (const id of model.order) {
    const node = model.nodes[id];
    if (node.op === "rect" || node.op === "sketch") continue; // regions
    if (node.op === "extrude") {
      const region = model.nodes[node.region];
      if (region?.op === "rect") {
        solids.set(id, extrudeRect(region.width, region.height, node.height));
      } else if (region?.op === "sketch") {
        solids.set(id, extrudeProfile(profileOf(model, node.region), node.height));
      } else {
        throw new Error(`extrude: unknown region '${node.region}'`);
      }
    } else if (node.op === "fillet") {
      const base = solids.get(node.body);
      if (!base) throw new Error(`fillet: no geometry for body '${node.body}'`);
      if (node.edges.kind !== "all") throw new Error("M0 only supports edges(...).all");
      solids.set(id, filletAll(base, node.radius));
    }
  }
}

/** Mesh one render target (a body solid, or a region as a flat face). */
function meshTarget(model: Model, solids: Map<string, Solid>, id: string): StageMesh {
  const node = model.nodes[id];
  if (!node) throw new Error(`render target '${id}' does not exist`);
  if (node.op === "rect") {
    return { name: "", op: "rect", mesh: regionFaceMesh(id, node.width, node.height) };
  }
  if (node.op === "sketch") {
    return { name: "", op: "sketch", mesh: profileFaceMesh(id, profileOf(model, id)) };
  }
  const solid = solids.get(id);
  if (!solid) throw new Error(`render target '${id}' has no geometry`);
  return { name: "", op: node.op, mesh: tessellate(id, solid) };
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
    render: builder.render,
    point: builder.point,
    lines: builder.lines,
    coincident: builder.coincident,
    parallel: builder.parallel,
    perpendicular: builder.perpendicular,
    equal: builder.equal,
    horizontal: builder.horizontal,
    vertical: builder.vertical,
    distance: builder.distance,
    sketch: builder.sketch,
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
  if (!model.render) {
    return emptyResult(["nothing to render — call render(...) in your model"]);
  }

  // The primary is shown by default and named "result"; the rest keep their
  // user-given names. (If a name collides with "result", the user's wins below.)
  const targets = [
    { name: "result", id: model.render.primary },
    ...model.render.stages,
  ];

  const solids = new Map<string, Solid>();
  try {
    evaluate(model, solids);
    const stages: StageMesh[] = targets.map((t) => ({
      ...meshTarget(model, solids, t.id),
      name: t.name,
    }));
    return { stages, primary: "result", errors: [] };
  } catch (e) {
    return emptyResult([errorMessage(e)]);
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
