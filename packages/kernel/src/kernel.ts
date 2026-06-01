// Geometry primitives over replicad/OpenCascade: build a box, fillet all edges,
// measure volume/bounds/edge-count, and tessellate a solid to a transferable
// mesh. Pure geometry — no model-graph or environment knowledge. Requires the
// OC kernel to have been loaded first (see oc.ts / oc.browser.ts).
import { draw, drawRectangle, measureVolume } from "replicad";
import type { BodyMesh } from "@cadcode/protocol";

/** Opaque replicad solid. We keep it untyped to avoid leaking replicad types. */
export type Solid = any;

export function extrudeRect(width: number, height: number, depth: number): Solid {
  const sketch = (drawRectangle(width, height) as any).sketchOnPlane("XY");
  return sketch.extrude(depth);
}

/** Build a closed planar drawing from ordered 2D corner points using replicad's
 *  pen-style `draw` API. Throws if given fewer than 3 points (not a polygon). */
function drawProfile(points: [number, number][]): any {
  if (points.length < 3) {
    throw new Error("extrudeProfile/profileFaceMesh: need at least 3 points");
  }
  let pen = draw(points[0]);
  for (let i = 1; i < points.length; i++) {
    pen = pen.lineTo(points[i]);
  }
  return pen.close();
}

/** Extrude a CLOSED polygon (ordered 2D corner points) on the XY plane by depth. */
export function extrudeProfile(points: [number, number][], depth: number): Solid {
  return (drawProfile(points) as any).sketchOnPlane("XY").extrude(depth);
}

export function volume(solid: Solid): number {
  return measureVolume(solid as never);
}

export function boundingBox(solid: Solid): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const [min, max] = (solid as any).boundingBox.bounds;
  return { min, max };
}

export function filletAll(solid: Solid, radius: number): Solid {
  // No edge filter => fillet every edge.
  return (solid as any).fillet(radius);
}

export function edgeCount(solid: Solid): number {
  return (solid as any).edges.length;
}

/** Free the WASM memory held by a replicad/OCCT shape. replicad also frees via
 *  GC finalizers, but explicit disposal bounds peak memory during re-renders. */
export function dispose(solid: Solid): void {
  try {
    (solid as { delete?: () => void } | undefined)?.delete?.();
  } catch {
    /* already freed */
  }
}

function meshOf(id: string, shape: Solid): BodyMesh {
  // replicad mesh() returns faceted { vertices, triangles, normals } as number[].
  const m = (shape as any).mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  return {
    id,
    positions: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.triangles),
  };
}

export function tessellate(id: string, solid: Solid): BodyMesh {
  return meshOf(id, solid);
}

/** Mesh a 2D rectangular region as a flat face on the XY plane (so a sketch can
 *  be shown as a render stage). The temporary face is disposed before returning. */
export function regionFaceMesh(id: string, width: number, height: number): BodyMesh {
  const face = (drawRectangle(width, height) as any).sketchOnPlane("XY").face();
  try {
    return meshOf(id, face);
  } finally {
    dispose(face);
  }
}

/** Mesh a closed polygon (ordered 2D corner points) as a flat face on the XY
 *  plane. The temporary face is disposed before returning. */
export function profileFaceMesh(id: string, points: [number, number][]): BodyMesh {
  const face = (drawProfile(points) as any).sketchOnPlane("XY").face();
  try {
    return meshOf(id, face);
  } finally {
    dispose(face);
  }
}
