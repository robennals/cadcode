// Tests for the protocol's runtime helpers: isBodyNode and the render-result
// serialization round-trip.
import { describe, it, expect } from "vitest";
import {
  isBodyNode,
  serializeRunResult,
  deserializeRunResult,
  type Node,
  type RunResult,
  type SketchNode,
  type ConstraintDef,
  type SketchSolution,
  type FaceRef,
  type EdgeQuery,
} from "./index";

describe("isBodyNode", () => {
  it("is true for extrude and fillet, false for rect", () => {
    const rect: Node = { id: "a", op: "rect", width: 10, height: 10 };
    const extrude: Node = { id: "b", op: "extrude", region: "a", height: 5, sources: ["a"] };
    const fillet: Node = {
      id: "c",
      op: "fillet",
      body: "b",
      edges: [{ kind: "all", body: "b" }],
      radius: 1,
      sources: ["b"],
    };
    expect(isBodyNode(rect)).toBe(false);
    expect(isBodyNode(extrude)).toBe(true);
    expect(isBodyNode(fillet)).toBe(true);
  });
});

describe("sketch types", () => {
  it("models a sketch node and a solution", () => {
    const c: ConstraintDef = { kind: "distance", p1: "p0", p2: "p1", value: 20 };
    const sketch: SketchNode = {
      id: "sketch_0",
      op: "sketch",
      points: [{ id: "p0", x: 0, y: 0, fixed: true }],
      lines: [{ id: "l0", p1: "p0", p2: "p1" }],
      constraints: [c],
      loop: ["p0", "p1"],
      sources: [],
    };
    const sol: SketchSolution = { status: "ok", points: { p0: { x: 0, y: 0 } } };
    expect(sketch.op).toBe("sketch");
    expect(sol.status).toBe("ok");
    // A sketch is a region, not a body.
    expect(isBodyNode(sketch as unknown as Node)).toBe(false);
  });
});

describe("reference types", () => {
  it("models a face ref and edge queries", () => {
    const top: FaceRef = { body: "extrude_0", locator: { kind: "planeZ", z: 10 } };
    const ofFace: EdgeQuery = { kind: "ofFace", body: "extrude_0", face: top.locator };
    const conn: EdgeQuery = { kind: "connecting", body: "extrude_0", a: { kind: "named", name: "top" }, b: { kind: "named", name: "bottom" } };
    expect(top.locator.kind).toBe("planeZ"); expect(ofFace.kind).toBe("ofFace"); expect(conn.kind).toBe("connecting");
  });
});

describe("serialize/deserialize RunResult", () => {
  it("round-trips stage meshes through JSON-safe arrays back to typed arrays", () => {
    const original: RunResult = {
      primary: "result",
      errors: [],
      stages: [
        {
          name: "result",
          op: "extrude",
          mesh: {
            id: "a",
            positions: new Float32Array([1, 2, 3, 4, 5, 6]),
            normals: new Float32Array([0, 0, 1, 0, 0, 1]),
            indices: new Uint32Array([0, 1, 2]),
          },
        },
      ],
    };
    const wire = JSON.parse(JSON.stringify(serializeRunResult(original)));
    const back = deserializeRunResult(wire);
    expect(back.primary).toBe("result");
    expect(back.stages[0].name).toBe("result");
    expect(back.stages[0].op).toBe("extrude");
    expect(back.stages[0].mesh.positions).toBeInstanceOf(Float32Array);
    expect(Array.from(back.stages[0].mesh.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(back.stages[0].mesh.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(back.stages[0].mesh.indices)).toEqual([0, 1, 2]);
  });
});
