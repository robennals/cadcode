// PlaneGCS-backed solver for cadcode sketches.
//
// Wraps `@salusoft89/planegcs` (a WASM port of FreeCAD's GCS 2D constraint
// solver). `init()` loads the WASM module once (cached); `solveSketch()` maps a
// `SketchNode` into planegcs JSON primitives, solves, and reads the solved
// point coordinates back out.

import type { ConstraintDef, SketchNode, SketchSolution } from "@cadcode/protocol";
// planegcs's package entry is JS with bundled WASM; the named exports are typed.
import {
  GcsWrapper,
  init_planegcs_module,
  SolveStatus,
  type SketchPrimitive,
  type SketchParam,
} from "@salusoft89/planegcs";

// The WASM module factory's return type isn't exported in a convenient shape,
// so we capture it from the (typed) init function.
type PlanegcsModule = Awaited<ReturnType<typeof init_planegcs_module>>;

let modulePromise: Promise<PlanegcsModule> | null = null;
let wasmModule: PlanegcsModule | null = null;

/** Load the planegcs WASM module. Idempotent: the load is cached. */
export async function init(): Promise<void> {
  if (!modulePromise) {
    modulePromise = init_planegcs_module();
  }
  wasmModule = await modulePromise;
}

// Line ids share a namespace with point ids in planegcs, so prefix them to
// guarantee they can't collide. Constraints that reference lines use the same
// prefix.
function lineId(id: string): string {
  return `L${id}`;
}

function constraintPrimitive(
  c: ConstraintDef,
  id: string,
): SketchPrimitive {
  switch (c.kind) {
    case "coincident":
      return { id, type: "p2p_coincident", p1_id: c.p1, p2_id: c.p2 };
    case "parallel":
      return { id, type: "parallel", l1_id: lineId(c.l1), l2_id: lineId(c.l2) };
    case "perpendicular":
      return { id, type: "perpendicular_ll", l1_id: lineId(c.l1), l2_id: lineId(c.l2) };
    case "equalLength":
      return { id, type: "equal_length", l1_id: lineId(c.l1), l2_id: lineId(c.l2) };
    case "horizontal":
      return { id, type: "horizontal_l", l_id: lineId(c.line) };
    case "vertical":
      return { id, type: "vertical_l", l_id: lineId(c.line) };
    case "distance":
      return { id, type: "p2p_distance", p1_id: c.p1, p2_id: c.p2, distance: c.value };
  }
}

/** Solve a sketch's constraints, returning the solved point positions. */
export function solveSketch(sketch: SketchNode): SketchSolution {
  if (!wasmModule) {
    throw new Error("solver not initialized: call init() before solveSketch()");
  }

  const gcs = new GcsWrapper(new wasmModule.GcsSystem());

  try {
    const primitives: (SketchPrimitive | SketchParam)[] = [];

    for (const p of sketch.points) {
      primitives.push({ id: p.id, type: "point", x: p.x, y: p.y, fixed: p.fixed });
    }
    for (const l of sketch.lines) {
      primitives.push({ id: lineId(l.id), type: "line", p1_id: l.p1, p2_id: l.p2 });
    }
    sketch.constraints.forEach((c, i) => {
      primitives.push(constraintPrimitive(c, `c${i}`));
    });

    gcs.push_primitives_and_params(primitives);

    const status = gcs.solve();
    gcs.apply_solution();

    if (status !== SolveStatus.Success) {
      return {
        status: "failed",
        points: {},
        message: `solver returned status ${status}`,
      };
    }

    const points: Record<string, { x: number; y: number }> = {};
    for (const prim of gcs.sketch_index.get_primitives()) {
      if (prim.type === "point") {
        points[prim.id] = { x: prim.x, y: prim.y };
      }
    }

    return { status: "ok", points };
  } finally {
    gcs.destroy_gcs_module();
  }
}
