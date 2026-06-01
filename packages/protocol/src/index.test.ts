import { describe, it, expect } from "vitest";
import { isBodyNode, type Node } from "./index";

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
