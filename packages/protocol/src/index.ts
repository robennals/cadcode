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

export interface Model {
  /** All nodes by id; creation order is in `order`. */
  nodes: Record<string, Node>;
  order: string[];
  /** Body ids that are alive (created, not consumed) — these render. */
  alive: string[];
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

/** A serialized hierarchy node for the tree panel. */
export interface HierarchyNode {
  id: string;
  op: Node["op"];
  label: string;
  alive: boolean;
  children: string[]; // ids of source nodes
}

export interface RunResult {
  hierarchy: HierarchyNode[];
  meshes: BodyMesh[];
  errors: string[];
}

/** Best-effort human-readable message from an unknown thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String((e as { message?: unknown })?.message ?? e);
}

/** An empty render result, optionally carrying error messages. */
export function emptyResult(errors: string[] = []): RunResult {
  return { hierarchy: [], meshes: [], errors };
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

export interface SerializedRunResult {
  hierarchy: HierarchyNode[];
  meshes: SerializedMesh[];
  errors: string[];
}

export function serializeRunResult(r: RunResult): SerializedRunResult {
  return {
    hierarchy: r.hierarchy,
    errors: r.errors,
    meshes: r.meshes.map((m) => ({
      id: m.id,
      positions: Array.from(m.positions),
      normals: Array.from(m.normals),
      indices: Array.from(m.indices),
    })),
  };
}

export function deserializeRunResult(s: SerializedRunResult): RunResult {
  return {
    hierarchy: s.hierarchy,
    errors: s.errors,
    meshes: s.meshes.map((m) => ({
      id: m.id,
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      indices: new Uint32Array(m.indices),
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
