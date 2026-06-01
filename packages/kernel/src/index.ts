// Public entry point for @cadcode/kernel: geometry primitives only.
// Note: the OpenCascade loader is intentionally NOT re-exported here, so that
// importing @cadcode/kernel (geometry only) never pulls in environment-specific
// code. Load it explicitly via "@cadcode/kernel/oc" (Node) or
// "@cadcode/kernel/oc-browser" (browser).
export {
  extrudeRect,
  volume,
  boundingBox,
  filletAll,
  edgeCount,
  tessellate,
  regionFaceMesh,
  dispose,
} from "./kernel";
export type { Solid } from "./kernel";
