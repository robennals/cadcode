import { beforeAll, describe, expect, it } from "vitest";
import type { SketchNode } from "@cadcode/protocol";
import { init, solveSketch } from "./planegcs";

beforeAll(async () => {
  await init();
});

describe("solveSketch", () => {
  it("solves a 20x20 square from approximate seeds", () => {
    // Seed points near a 20x20 square, but deliberately not exact.
    const sketch: SketchNode = {
      id: "sk",
      op: "sketch",
      points: [
        { id: "p0", x: 0, y: 0, fixed: true }, // pinned at origin
        { id: "p1", x: 19, y: 1, fixed: false },
        { id: "p2", x: 21, y: 18, fixed: false },
        { id: "p3", x: 2, y: 22, fixed: false },
      ],
      lines: [
        { id: "bottom", p1: "p0", p2: "p1" },
        { id: "right", p1: "p1", p2: "p2" },
        { id: "top", p1: "p2", p2: "p3" },
        { id: "left", p1: "p3", p2: "p0" },
      ],
      constraints: [
        { kind: "horizontal", line: "bottom" },
        { kind: "perpendicular", l1: "bottom", l2: "right" },
        { kind: "parallel", l1: "bottom", l2: "top" },
        { kind: "parallel", l1: "left", l2: "right" },
        { kind: "equalLength", l1: "bottom", l2: "right" },
        { kind: "distance", p1: "p0", p2: "p1", value: 20 },
      ],
      loop: ["p0", "p1", "p2", "p3"],
      sources: [],
    };

    const solution = solveSketch(sketch);

    expect(solution.status).toBe("ok");

    const corners: Record<string, { x: number; y: number }> = {
      p0: { x: 0, y: 0 },
      p1: { x: 20, y: 0 },
      p2: { x: 20, y: 20 },
      p3: { x: 0, y: 20 },
    };

    for (const [id, expected] of Object.entries(corners)) {
      const got = solution.points[id];
      expect(got, `point ${id} present`).toBeDefined();
      expect(got.x, `point ${id}.x`).toBeCloseTo(expected.x, 3);
      expect(got.y, `point ${id}.y`).toBeCloseTo(expected.y, 3);
    }
  });
});
