import { describe, it, expect, beforeAll } from "vitest";
import { init } from "@cadcode/kernel";
import { run } from "./run";
import { nodeCompile } from "./compile";

const SOURCE = `
const face = rect(20, 20);
const cube = extrude(face, 20);
const rounded = fillet(cube, edges(cube).all, 3);
`;

describe("runtime.run", () => {
  beforeAll(async () => {
    await init();
  });

  it("runs a cube+fillet script into one alive mesh and a 3-node hierarchy", async () => {
    const result = await run(SOURCE, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].positions.length).toBeGreaterThan(0);
    expect(result.hierarchy).toHaveLength(3);
    const alive = result.hierarchy.filter((n) => n.alive);
    expect(alive).toHaveLength(1);
    expect(alive[0].op).toBe("fillet");
  });

  it("reports errors without throwing", async () => {
    const result = await run("this is not valid ts !!!", { compile: nodeCompile });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.meshes).toEqual([]);
  });
});
