import { beforeAll, describe, expect, it } from "vitest";
import { init } from "./oc";
import { volume, extrudeProfile } from "./kernel";
import {
  extrudeCircle,
  circleFaceMesh,
  revolveProfile,
  loftProfiles,
  shellBody,
  chamferAll,
  booleanOp,
} from "./ops";

beforeAll(async () => {
  await init();
});

describe("ops", () => {
  it("extrudeCircle volume", () => {
    expect(volume(extrudeCircle(5, 10))).toBeCloseTo(785, -1);
  });

  it("revolveProfile volume", () => {
    const v = volume(
      revolveProfile(
        [
          [2, 0],
          [5, 0],
          [5, 10],
          [2, 10],
        ],
        360,
      ),
    );
    expect(v).toBeCloseTo(659, -1);
  });

  it("loftProfiles volume in range", () => {
    const v = volume(
      loftProfiles([
        { radius: 10, z: 0 },
        { radius: 5, z: 20 },
      ]),
    );
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(Math.PI * 100 * 20); // 6283
  });

  it("shellBody hollows the solid", () => {
    const cyl = Math.PI * 100 * 20; // π*100*20
    const v = volume(shellBody(extrudeCircle(10, 20), 2));
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(cyl);
  });

  it("chamferAll reduces a box volume", () => {
    const v = volume(
      chamferAll(
        extrudeProfile(
          [
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 20],
          ],
          10,
        ),
        2,
      ),
    );
    expect(v).toBeGreaterThan(3000);
    expect(v).toBeLessThan(4000);
  });

  it("booleanOp subtract reduces volume", () => {
    const a = extrudeProfile(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      10,
    );
    const b = extrudeProfile(
      [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
      ],
      10,
    );
    const va = volume(a);
    expect(volume(booleanOp(a, b, "subtract"))).toBeLessThan(va);
  });

  it("circleFaceMesh produces geometry", () => {
    const m = circleFaceMesh("f", 5);
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.indices.length).toBeGreaterThan(0);
  });
});
