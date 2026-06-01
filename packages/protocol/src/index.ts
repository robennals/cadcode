// Shared type definitions for cadcode: the model graph (nodes the builder
// produces), tessellated mesh data, the serialized hierarchy, and the
// worker<->main-thread message protocol. No runtime logic beyond `isBodyNode`.

/** A selector describing a set of edges on a body. M0 supports only "all". */
export interface EdgeSelector {
  body: string;
  kind: "all";
}

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
  edges: EdgeSelector;
  radius: number;
  sources: string[];
}

export type BodyNode = ExtrudeNode | FilletNode;
export type Node = RectNode | BodyNode;

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

export function isBodyNode(node: Node): node is BodyNode {
  return node.op === "extrude" || node.op === "fillet";
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
