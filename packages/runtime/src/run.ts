// Orchestrates one model evaluation: compile the user's TS, execute it with the
// core API injected as globals, then walk the resulting graph through the kernel
// to produce meshes for every alive body plus a serialized hierarchy. All
// errors (compile, runtime, geometry) are caught and returned, never thrown.
import { createBuilder } from "@cadcode/core";
import type { Model, RunResult, HierarchyNode, BodyMesh } from "@cadcode/protocol";
import { extrudeRect, filletAll, tessellate, type Solid } from "@cadcode/kernel";
import type { CompileFn } from "./compile";

const API_NAMES = ["rect", "extrude", "fillet", "edges", "dimension"] as const;

function buildHierarchy(model: Model): HierarchyNode[] {
  const aliveSet = new Set(model.alive);
  return model.order.map((id) => {
    const node = model.nodes[id];
    const children = "sources" in node ? node.sources : [];
    return { id, op: node.op, label: node.op, alive: aliveSet.has(id), children };
  });
}

/** Walk the graph, producing a replicad Solid for each body id. */
function evaluate(model: Model): Map<string, Solid> {
  const solids = new Map<string, Solid>();
  for (const id of model.order) {
    const node = model.nodes[id];
    if (node.op === "rect") continue; // regions are realised by their consumer
    if (node.op === "extrude") {
      const region = model.nodes[node.region];
      if (region.op !== "rect") throw new Error("M0 only supports extruding a rect");
      solids.set(id, extrudeRect(region.width, region.height, node.height));
    } else if (node.op === "fillet") {
      const base = solids.get(node.body);
      if (!base) throw new Error("fillet target has no geometry");
      if (node.edges.kind !== "all") throw new Error("M0 only supports edges(...).all");
      solids.set(id, filletAll(base, node.radius));
    }
  }
  return solids;
}

export async function run(
  source: string,
  opts: { compile: CompileFn },
): Promise<RunResult> {
  let code: string;
  try {
    code = await opts.compile(source);
  } catch (e) {
    return { hierarchy: [], meshes: [], errors: [String((e as Error).message ?? e)] };
  }

  const builder = createBuilder();
  const dimension = () => {
    throw new Error("dimension() requires the constraint solver (added in M1)");
  };
  const api: Record<string, unknown> = {
    rect: builder.rect,
    extrude: builder.extrude,
    fillet: builder.fillet,
    edges: builder.edges,
    dimension,
  };

  try {
    const fn = new Function("exports", "module", ...API_NAMES, code);
    const mod = { exports: {} as Record<string, unknown> };
    fn(mod.exports, mod, ...API_NAMES.map((n) => api[n]));
  } catch (e) {
    return { hierarchy: [], meshes: [], errors: [String((e as Error).message ?? e)] };
  }

  const model = builder.getModel();
  try {
    const solids = evaluate(model);
    const meshes: BodyMesh[] = model.alive.map((id) =>
      tessellate(id, solids.get(id)),
    );
    return { hierarchy: buildHierarchy(model), meshes, errors: [] };
  } catch (e) {
    return {
      hierarchy: buildHierarchy(model),
      meshes: [],
      errors: [String((e as Error).message ?? e)],
    };
  }
}
