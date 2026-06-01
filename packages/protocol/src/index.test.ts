// Tests for the protocol's runtime helpers: isBodyNode and the render-result
// serialization round-trip.
import { describe, it, expect } from "vitest";
import {
  isBodyNode,
  serializeRunResult,
  deserializeRunResult,
  type Node,
  type RunResult,
} from "./index";

describe("isBodyNode", () => {
  it("is true for extrude and fillet, false for rect", () => {
    const rect: Node = { id: "a", op: "rect", width: 10, height: 10 };
    const extrude: Node = { id: "b", op: "extrude", region: "a", height: 5, sources: ["a"] };
    const fillet: Node = {
      id: "c",
      op: "fillet",
      body: "b",
      edges: { body: "b", kind: "all" },
      radius: 1,
      sources: ["b"],
    };
    expect(isBodyNode(rect)).toBe(false);
    expect(isBodyNode(extrude)).toBe(true);
    expect(isBodyNode(fillet)).toBe(true);
  });
});

describe("serialize/deserialize RunResult", () => {
  it("round-trips meshes through JSON-safe arrays back to typed arrays", () => {
    const original: RunResult = {
      hierarchy: [{ id: "a", op: "extrude", label: "extrude", alive: true, children: [] }],
      errors: [],
      meshes: [
        {
          id: "a",
          positions: new Float32Array([1, 2, 3, 4, 5, 6]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1]),
          indices: new Uint32Array([0, 1, 2]),
        },
      ],
    };
    const wire = JSON.parse(JSON.stringify(serializeRunResult(original)));
    const back = deserializeRunResult(wire);
    expect(back.hierarchy).toEqual(original.hierarchy);
    expect(back.meshes[0].positions).toBeInstanceOf(Float32Array);
    expect(Array.from(back.meshes[0].positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(back.meshes[0].indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(back.meshes[0].indices)).toEqual([0, 1, 2]);
  });
});
