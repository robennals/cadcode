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
