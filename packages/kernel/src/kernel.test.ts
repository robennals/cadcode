// Headless geometry tests: loads OpenCascade, then asserts box volume/bounds,
// fillet behaviour, edge count, and non-empty tessellation.
import { describe, it, expect, beforeAll } from "vitest";
import { init } from "./oc";
import {
  extrudeRect,
  volume,
  boundingBox,
  filletAll,
  edgeCount,
  tessellate,
} from "./kernel";

describe("kernel box", () => {
  beforeAll(async () => {
    await init();
  });

  it("extrudes a 20x20 rect by 20 into a cube of volume ~8000", () => {
    const solid = extrudeRect(20, 20, 20);
    expect(volume(solid)).toBeCloseTo(8000, 0);
    const bb = boundingBox(solid);
    const size = [
      bb.max[0] - bb.min[0],
      bb.max[1] - bb.min[1],
      bb.max[2] - bb.min[2],
    ];
    expect(size[0]).toBeCloseTo(20, 1);
    expect(size[1]).toBeCloseTo(20, 1);
    expect(size[2]).toBeCloseTo(20, 1);
  });
});

describe("kernel fillet + mesh", () => {
  beforeAll(async () => {
    await init();
  });

  it("filleting all 12 edges of a cube reduces volume and keeps it positive", () => {
    const cube = extrudeRect(20, 20, 20);
    expect(edgeCount(cube)).toBe(12);
    const rounded = filletAll(cube, 3);
    const v = volume(rounded);
    expect(v).toBeLessThan(8000);
    expect(v).toBeGreaterThan(6000);
  });

  it("tessellates a cube into a non-empty indexed mesh", () => {
    const cube = extrudeRect(10, 10, 10);
    const mesh = tessellate("m", cube);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
  });
});
