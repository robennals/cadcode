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
  extrudeCircle,
  revolveProfile,
  loftProfiles,
  shellBody,
  chamferAll,
  booleanOp,
  filletAll,
  tessellate,
  regionFaceMesh,
  circleFaceMesh,
  profileFaceMesh,
  dispose,
  type Solid,
  type ProfileSpec,
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

/** A region's closed-polygon points (circles are curved and have no points). */
function regionPoints(model: Model, id: string): [number, number][] {
  const node = model.nodes[id];
  if (node.op === "polygon") return node.points;
  if (node.op === "sketch") return profileOf(model, id);
  if (node.op === "rect") {
    const w = node.width / 2;
    const h = node.height / 2;
    return [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ];
  }
  throw new Error(`region '${id}' (${node.op}) has no polygon profile`);
}

/** A region as a loft profile spec placed at height z. */
function regionSpec(model: Model, id: string, z: number): ProfileSpec {
  const node = model.nodes[id];
  if (node.op === "circle") return { radius: node.radius, z };
  return { points: regionPoints(model, id), z };
}

/** Walk the graph, producing a replicad Solid for each body id into `solids`. */
function evaluate(model: Model, solids: Map<string, Solid>): void {
  const need = (bid: string, op: string): Solid => {
    const s = solids.get(bid);
    if (!s) throw new Error(`${op}: no geometry for body '${bid}'`);
    return s;
  };
  for (const id of model.order) {
    const node = model.nodes[id];
    if (node.op === "rect" || node.op === "circle" || node.op === "polygon" || node.op === "sketch")
      continue; // regions
    if (node.op === "extrude") {
      const region = model.nodes[node.region];
      if (region?.op === "rect") {
        solids.set(id, extrudeRect(region.width, region.height, node.height));
      } else if (region?.op === "circle") {
        solids.set(id, extrudeCircle(region.radius, node.height));
      } else if (region?.op === "polygon" || region?.op === "sketch") {
        solids.set(id, extrudeProfile(regionPoints(model, node.region), node.height));
      } else {
        throw new Error(`extrude: unknown region '${node.region}'`);
      }
    } else if (node.op === "revolve") {
      solids.set(id, revolveProfile(regionPoints(model, node.region), node.angle));
    } else if (node.op === "loft") {
      const specs = node.regions.map((rid, i) => regionSpec(model, rid, node.heights[i]));
      solids.set(id, loftProfiles(specs));
    } else if (node.op === "shell") {
      solids.set(id, shellBody(need(node.body, "shell"), node.thickness));
    } else if (node.op === "fillet") {
      if (node.edges.kind !== "all") throw new Error("only edges(...).all is supported");
      solids.set(id, filletAll(need(node.body, "fillet"), node.radius));
    } else if (node.op === "chamfer") {
      if (node.edges.kind !== "all") throw new Error("only edges(...).all is supported");
      solids.set(id, chamferAll(need(node.body, "chamfer"), node.distance));
    } else if (node.op === "boolean") {
      solids.set(id, booleanOp(need(node.a, "boolean"), need(node.b, "boolean"), node.kind));
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
  if (node.op === "circle") {
    return { name: "", op: "circle", mesh: circleFaceMesh(id, node.radius) };
  }
  if (node.op === "polygon" || node.op === "sketch") {
    return { name: "", op: node.op, mesh: profileFaceMesh(id, regionPoints(model, id)) };
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
    circle: builder.circle,
    polygon: builder.polygon,
    extrude: builder.extrude,
    revolve: builder.revolve,
    loft: builder.loft,
    shell: builder.shell,
    fillet: builder.fillet,
    chamfer: builder.chamfer,
    union: builder.union,
    subtract: builder.subtract,
    intersect: builder.intersect,
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
