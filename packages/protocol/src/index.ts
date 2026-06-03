// Shared type definitions for cadcode: the model graph (nodes the builder
// produces), tessellated mesh data, the serialized hierarchy, and the
// worker<->main-thread message protocol. No runtime logic beyond `isBodyNode`.

/** Where a planar face lives on a body: pinned to an explicit z, or named
 *  (top = the flat cap at max Z, bottom = at min Z) and resolved geometrically. */
export type FaceLocator =
  | { kind: "planeZ"; z: number }
  | { kind: "named"; name: "top" | "bottom" };

/** A reference to a specific face of a body. */
export interface FaceRef {
  body: string;
  locator: FaceLocator;
}

/** A declarative query selecting a set of edges on a body. */
export type EdgeQuery =
  | { kind: "all"; body: string }
  | { kind: "ofFace"; body: string; face: FaceLocator }
  | { kind: "connecting"; body: string; a: FaceLocator; b: FaceLocator };

/** A closed 2D profile. M0 supports only an axis-aligned rectangle (centered). */
export interface RectNode {
  id: string;
  op: "rect";
  width: number;
  height: number;
}

export interface ExtrudeNode {
  id: string;
  op: "extrude";
  region: string; // id of a RectNode
  height: number;
  sources: string[]; // ids of consumed sketches/regions (provenance)
}

export interface FilletNode {
  id: string;
  op: "fillet";
  body: string; // id of the body being filleted
  edges: EdgeQuery[];
  radius: number;
  sources: string[];
}

// --- More primitives + operators ---

/** A circle region (centered at the origin on XY). */
export interface CircleNode {
  id: string;
  op: "circle";
  radius: number;
}

/** A region defined by explicit closed-polygon 2D points. */
export interface PolygonNode {
  id: string;
  op: "polygon";
  points: [number, number][];
}

/** Revolve a profile region around the Z axis (profile points are radius/height). */
export interface RevolveNode {
  id: string;
  op: "revolve";
  region: string;
  angle: number; // degrees
  sources: string[];
}

/** Loft through a stack of regions, each at its z height. */
export interface LoftNode {
  id: string;
  op: "loft";
  regions: string[];
  heights: number[];
  sources: string[];
}

/** Hollow a body to a wall thickness, opening the selected face(s). */
export interface ShellNode {
  id: string;
  op: "shell";
  body: string;
  thickness: number;
  open: FaceLocator[]; // which faces to open (e.g. [{kind:"named",name:"top"}])
  sources: string[];
}

/** Bevel the selected edges of a body. */
export interface ChamferNode {
  id: string;
  op: "chamfer";
  body: string;
  edges: EdgeQuery[];
  distance: number;
  sources: string[];
}

/** A boolean of two bodies. */
export interface BooleanNode {
  id: string;
  op: "boolean";
  kind: "union" | "subtract" | "intersect";
  a: string;
  b: string;
  sources: string[];
}

/** Translate a body by an offset. */
export interface MoveNode {
  id: string;
  op: "move";
  body: string;
  offset: [number, number, number];
  sources: string[];
}

export type RegionNode = RectNode | CircleNode | PolygonNode | SketchNode;
export type BodyNode =
  | ExtrudeNode
  | FilletNode
  | RevolveNode
  | LoftNode
  | ShellNode
  | ChamferNode
  | BooleanNode
  | MoveNode;
export type Node = RegionNode | BodyNode;

// --- Sketch constraints (M1) ---

/** A sketch point: a seed position and whether it's pinned for the solver. */
export interface PointDef {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

/** A sketch line between two points (by id). */
export interface LineDef {
  id: string;
  p1: string;
  p2: string;
}

/** Geometric + dimensional constraints (M1 first slice). */
export type ConstraintDef =
  | { kind: "coincident"; p1: string; p2: string } // point ids
  | { kind: "parallel"; l1: string; l2: string } // line ids
  | { kind: "perpendicular"; l1: string; l2: string }
  | { kind: "equalLength"; l1: string; l2: string }
  | { kind: "horizontal"; line: string }
  | { kind: "vertical"; line: string }
  | { kind: "distance"; p1: string; p2: string; value: number };

/** A sketch as a graph node — a region that can be extruded/rendered. */
export interface SketchNode {
  id: string;
  op: "sketch";
  points: PointDef[];
  lines: LineDef[];
  constraints: ConstraintDef[];
  loop: string[]; // ordered point ids forming the closed boundary
  sources: string[];
}

/** Result of solving a sketch. */
export interface SketchSolution {
  status: "ok" | "failed";
  points: Record<string, { x: number; y: number }>; // solved coords by point id
  message?: string;
}

/** A render target: a named node the user asked to be viewable via `render()`. */
export interface RenderTarget {
  name: string;
  id: string; // node id
}

/** What `render(primary, { ...stages })` declared for a model. */
export interface RenderDecl {
  primary: string; // node id of the main object
  stages: RenderTarget[]; // additional named targets (not including primary)
}

export interface Model {
  /** All nodes by id; creation order is in `order`. */
  nodes: Record<string, Node>;
  order: string[];
  /** Body ids that are alive (created, not consumed) — used as a render fallback. */
  alive: string[];
  /** What to render (from `render()`, or a fallback to the last alive body). */
  render?: RenderDecl;
}

const BODY_OPS = new Set([
  "extrude",
  "fillet",
  "revolve",
  "loft",
  "shell",
  "chamfer",
  "boolean",
  "move",
]);

export function isBodyNode(node: Node): node is BodyNode {
  return BODY_OPS.has(node.op);
}

/** A tessellated body sent to the viewport. Arrays are transferable. */
export interface BodyMesh {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** A meshed render stage — one selectable item in the viewer's stage panel. */
export interface StageMesh {
  name: string; // "result" for the primary, else the user's name
  op: Node["op"]; // what it is (rect / extrude / fillet)
  mesh: BodyMesh;
}

export interface RunResult {
  /** The renderable stages; the first is the primary. */
  stages: StageMesh[];
  /** Name of the primary stage (the default view), or null if nothing to render. */
  primary: string | null;
  errors: string[];
}

/** Best-effort human-readable message from an unknown thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String((e as { message?: unknown })?.message ?? e);
}

/** An empty render result, optionally carrying error messages. */
export function emptyResult(errors: string[] = []): RunResult {
  return { stages: [], primary: null, errors };
}

// --- Transport (server -> viewer) ---
// Typed arrays don't survive JSON, so render results are serialized with plain
// number[] arrays for sending over the HMR socket, then rebuilt into typed
// arrays in the browser.

export interface SerializedMesh {
  id: string;
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface SerializedStage {
  name: string;
  op: string;
  mesh: SerializedMesh;
}

export interface SerializedRunResult {
  stages: SerializedStage[];
  primary: string | null;
  errors: string[];
}

function serializeMesh(m: BodyMesh): SerializedMesh {
  return {
    id: m.id,
    positions: Array.from(m.positions),
    normals: Array.from(m.normals),
    indices: Array.from(m.indices),
  };
}

function deserializeMesh(m: SerializedMesh): BodyMesh {
  return {
    id: m.id,
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.indices),
  };
}

export function serializeRunResult(r: RunResult): SerializedRunResult {
  return {
    primary: r.primary,
    errors: r.errors,
    stages: r.stages.map((s) => ({ name: s.name, op: s.op, mesh: serializeMesh(s.mesh) })),
  };
}

export function deserializeRunResult(s: SerializedRunResult): RunResult {
  return {
    primary: s.primary,
    errors: s.errors,
    stages: s.stages.map((st) => ({
      name: st.name,
      op: st.op as StageMesh["op"],
      mesh: deserializeMesh(st.mesh),
    })),
  };
}

/** Live-render channel events over Vite's HMR socket. */
export const RENDER_EVENT = "cadcode:render";
export const SELECT_EVENT = "cadcode:select";
export interface RenderMessage {
  file: string;
  result: SerializedRunResult;
}
export interface SelectMessage {
  file: string;
}
