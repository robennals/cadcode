// Geometry primitives over replicad/OpenCascade: build a box, fillet all edges,
// measure volume/bounds/edge-count, and tessellate a solid to a transferable
// mesh. Pure geometry — no model-graph or environment knowledge. Requires the
// OC kernel to have been loaded first (see oc.ts / oc.browser.ts).
import { drawRectangle, measureVolume } from "replicad";
import type { BodyMesh } from "@cadcode/protocol";

/** Opaque replicad solid. We keep it untyped to avoid leaking replicad types. */
export type Solid = any;

export function extrudeRect(width: number, height: number, depth: number): Solid {
  const sketch = (drawRectangle(width, height) as any).sketchOnPlane("XY");
  return sketch.extrude(depth);
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

export function tessellate(id: string, solid: Solid): BodyMesh {
  // replicad mesh() returns faceted { vertices, triangles, normals } as number[].
  const m = (solid as any).mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  const positions = new Float32Array(m.vertices);
  const normals = new Float32Array(m.normals);
  const indices = new Uint32Array(m.triangles);
  return { id, positions, normals, indices };
}
