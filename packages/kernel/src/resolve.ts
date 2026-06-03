// Geometry "resolver": turn declarative face/edge *queries* into the concrete
// OCCT sub-shapes (faces/edges) of a solid by geometric coincidence (bounding
// boxes / planes), then drive replicad's fillet/chamfer/shell restricted to
// exactly those sub-shapes. Pure geometry, like kernel.ts/ops.ts. Requires the
// OC kernel to have been loaded first (see oc.ts).
import { EdgeFinder, FaceFinder } from "replicad";
import { type Solid } from "./kernel";

/** A planar XY face, named relative to the solid or pinned to an explicit z. */
export type FaceSpec =
  | { kind: "planeZ"; z: number }
  | { kind: "named"; name: "top" | "bottom" };

/** A set of edges, selected geometrically. */
export type EdgeSpec =
  | { kind: "all" }
  | { kind: "ofFace"; face: FaceSpec }
  | { kind: "connecting"; a: FaceSpec; b: FaceSpec };

// Tolerance for treating two z values as coincident (mm).
const EPS = 1e-6;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

/** Resolve a FaceSpec to its absolute z height on the given solid. */
function faceZ(solid: Solid, f: FaceSpec): number {
  if (f.kind === "planeZ") return f.z;
  const [min, max] = (solid as any).boundingBox.bounds as [number[], number[]];
  return f.name === "top" ? max[2] : min[2];
}

/** The flat XY face(s) of `solid` lying at the spec's z. */
export function resolveFaces(solid: Solid, f: FaceSpec): any[] {
  const z = faceZ(solid, f);
  return new FaceFinder().inPlane("XY", z).find(solid as never) as any[];
}

/** The z-extent [minZ, maxZ] of a sub-shape's bounding box. */
function zExtent(shape: any): [number, number] {
  const [min, max] = shape.boundingBox.bounds as [number[], number[]];
  return [min[2], max[2]];
}

/** The edges of `solid` matching the query. */
export function resolveEdges(solid: Solid, q: EdgeSpec): any[] {
  const edges = (solid as any).edges as any[];
  if (q.kind === "all") return edges;
  if (q.kind === "ofFace") {
    const z = faceZ(solid, q.face);
    // An edge "of" the face has its whole z-extent pinned at the face's z.
    return edges.filter((e) => {
      const [lo, hi] = zExtent(e);
      return near(lo, z) && near(hi, z);
    });
  }
  // connecting: edges spanning from one plane to the other.
  const za = faceZ(solid, q.a);
  const zb = faceZ(solid, q.b);
  if (near(za, zb)) return [];
  const loZ = Math.min(za, zb);
  const hiZ = Math.max(za, zb);
  return edges.filter((e) => {
    const [lo, hi] = zExtent(e);
    return near(lo, loZ) && near(hi, hiZ);
  });
}

/** Resolve+dedupe sub-shapes across many specs, preserving order. */
function collect<S>(resolve: (s: S) => any[], specs: S[]): any[] {
  const seen = new Set<any>();
  const out: any[] = [];
  for (const spec of specs) {
    for (const shape of resolve(spec)) {
      if (!seen.has(shape)) {
        seen.add(shape);
        out.push(shape);
      }
    }
  }
  return out;
}

/** Fillet exactly the edges matched by `specs` (deduped) with the given radius. */
export function filletEdges(solid: Solid, specs: EdgeSpec[], radius: number): Solid {
  const list = collect((q) => resolveEdges(solid, q), specs);
  if (list.length === 0) throw new Error("fillet: selection matched no edges");
  return (solid as any).fillet(radius, (e: any) => e.inList(list));
}

/** Chamfer exactly the edges matched by `specs` (deduped) with the given distance. */
export function chamferEdges(solid: Solid, specs: EdgeSpec[], distance: number): Solid {
  const list = collect((q) => resolveEdges(solid, q), specs);
  if (list.length === 0) throw new Error("chamfer: selection matched no edges");
  return (solid as any).chamfer(distance, (e: any) => e.inList(list));
}

/** Shell `solid` to `thickness`, opening exactly the faces matched by `specs`. */
export function shellFaces(solid: Solid, specs: FaceSpec[], thickness: number): Solid {
  const list = collect((f) => resolveFaces(solid, f), specs);
  if (list.length === 0) throw new Error("shell: selection matched no faces");
  return (solid as any).shell(thickness, (f: any) => f.inList(list));
}

// `inList` is confirmed present on replicad's Finder3d base (replicad.d.ts).
// Reference EdgeFinder/FaceFinder so the imports document the finder family
// these helpers restrict, even though we use the fluent `.inList` filter form.
void EdgeFinder;
void FaceFinder;
