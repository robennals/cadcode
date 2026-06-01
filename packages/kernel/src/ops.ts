// Additional geometry operators over replicad/OpenCascade: extruded/revolved/
// lofted profiles, shelling, chamfering and booleans. Pure geometry, like
// kernel.ts. Requires the OC kernel to have been loaded first (see oc.ts).
import { draw, drawCircle } from "replicad";
import type { BodyMesh } from "@cadcode/protocol";
import { type Solid } from "./kernel";

/** Build a closed planar drawing from ordered 2D points using replicad's
 *  pen-style `draw` API (local copy of kernel.ts's private drawProfile). */
function drawClosed(points: [number, number][]): any {
  if (points.length < 3) {
    throw new Error("drawClosed: need at least 3 points");
  }
  let pen = draw(points[0]);
  for (let i = 1; i < points.length; i++) {
    pen = pen.lineTo(points[i]);
  }
  return pen.close();
}

/** Tessellate a replicad shape into a transferable BodyMesh (mirrors kernel.ts's
 *  private meshOf). */
function meshOf(id: string, shape: any): BodyMesh {
  const m = shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  return {
    id,
    positions: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.triangles),
  };
}

/** Extrude a circle of `radius` on the XY plane by `depth`. */
export function extrudeCircle(radius: number, depth: number): Solid {
  return (drawCircle(radius) as any).sketchOnPlane("XY").extrude(depth);
}

/** Mesh a circle of `radius` as a flat face on the XY plane. */
export function circleFaceMesh(id: string, radius: number): BodyMesh {
  const face = (drawCircle(radius) as any).sketchOnPlane("XY").face();
  try {
    return meshOf(id, face);
  } finally {
    try {
      face.delete?.();
    } catch {
      /* already freed */
    }
  }
}

/** Revolve a profile around the Z axis. Points are (radius, height) on the XZ
 *  plane (radius >= 0). The profile is sketched on "XZ" so the 2D x maps to
 *  radius and 2D y maps to height, then revolved about [0, 0, 1] (the Z axis).
 *  Note: partial angles are not yet supported — always a full 360° revolution;
 *  `angleDeg` is currently honoured only for the 360 case. */
export function revolveProfile(points: [number, number][], angleDeg: number): Solid {
  void angleDeg; // partial revolves not yet implemented; full 360 only.
  return (drawClosed(points) as any).sketchOnPlane("XZ").revolve([0, 0, 1]);
}

/** A loft cross-section stacked along Z: either a polygon `points` or a circle
 *  of `radius`, placed at height `z`. */
export interface ProfileSpec {
  z: number;
  points?: [number, number][];
  radius?: number;
}

function sketchProfile(spec: ProfileSpec): any {
  const drawing =
    spec.radius !== undefined ? (drawCircle(spec.radius) as any) : drawClosed(spec.points!);
  return drawing.sketchOnPlane("XY", spec.z);
}

/** Loft through profiles stacked along Z. */
export function loftProfiles(profiles: ProfileSpec[]): Solid {
  if (profiles.length < 2) {
    throw new Error("loftProfiles: need at least 2 profiles");
  }
  const [first, ...rest] = profiles.map(sketchProfile);
  return first.loftWith(rest);
}

/** Hollow a solid to wall `thickness`, removing the upward (top) faces so the
 *  result is an open vessel. The top face is selected via a FaceFinder whose
 *  normal is parallel to +Z (`atAngleWith([0, 0, 1], 0)`). */
export function shellBody(solid: Solid, thickness: number): Solid {
  return (solid as any).shell(thickness, (f: any) => f.atAngleWith([0, 0, 1], 0));
}

/** Chamfer every edge of a solid by `distance` (no edge filter). */
export function chamferAll(solid: Solid, distance: number): Solid {
  return (solid as any).chamfer(distance);
}

/** Boolean of two solids: union (fuse), subtract (cut) or intersect. */
export function booleanOp(a: Solid, b: Solid, kind: "union" | "subtract" | "intersect"): Solid {
  switch (kind) {
    case "union":
      return (a as any).fuse(b);
    case "subtract":
      return (a as any).cut(b);
    case "intersect":
      return (a as any).intersect(b);
  }
}
