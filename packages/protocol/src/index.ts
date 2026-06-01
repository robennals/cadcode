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

/** Worker protocol. */
export type WorkerRequest = { type: "run"; source: string };
export type WorkerResponse =
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string };
