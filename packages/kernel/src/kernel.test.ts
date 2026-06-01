import { describe, it, expect, beforeAll } from "vitest";
import { init } from "./oc";
import { extrudeRect, volume, boundingBox } from "./kernel";

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
