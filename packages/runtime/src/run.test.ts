// End-to-end runtime test: a source string compiles, runs, and produces render
// stages; invalid input is reported as errors rather than thrown.
import { describe, it, expect, beforeAll } from "vitest";
import { init } from "@cadcode/kernel/oc";
import { init as initSolver } from "@cadcode/solver";
import { run } from "./run";
import { nodeCompile } from "./compile";

const SOURCE = `
const face = rect(20, 20);
const cube = extrude(face, 20);
const rounded = fillet(cube, edges(cube).all, 3);
render(rounded, { cube, face });
`;

const SQUARE = `
const [lb, lr, lt, ll] = lines(4);
coincident([lb.end, lr.start], [lr.end, lt.start], [lt.end, ll.start], [ll.end, lb.start]);
parallel([lb, lt], [lr, ll]);
perpendicular(lb, lr);
equal([lb, lr, lt, ll]);
horizontal(lb);
distance(lb.start, lb.end, 20);
const sq = sketch({ lb, lr, lt, ll });
const body = extrude(sq.region, 10);
render(body, { sketch: sq });
`;

describe("runtime.run", () => {
  beforeAll(async () => {
    await init();
    await initSolver();
  });

  it("evaluates the new operators (circle/revolve/loft/shell/chamfer/boolean)", async () => {
    const ops = `
      const cup = shell(extrude(circle(15), 30), 2);
      const cone = loft([circle(10), circle(5)], [0, 20]);
      const vase = revolve(polygon([[2,0],[6,0],[6,10],[2,10]]));
      const beveled = chamfer(extrude(rect(20,20), 10), edges(extrude(rect(20,20), 10)).all, 2);
      const washer = subtract(extrude(circle(10), 4), extrude(circle(5), 4));
      render(cup, { cone, vase, beveled, washer });
    `;
    const result = await run(ops, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.stages.map((s) => s.name)).toEqual([
      "result",
      "cone",
      "vase",
      "beveled",
      "washer",
    ]);
    for (const s of result.stages) expect(s.mesh.positions.length).toBeGreaterThan(0);
  });

  it("solves a constrained square sketch and extrudes it", async () => {
    const result = await run(SQUARE, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.stages.map((s) => [s.name, s.op])).toEqual([
      ["result", "extrude"],
      ["sketch", "sketch"],
    ]);
    for (const s of result.stages) expect(s.mesh.positions.length).toBeGreaterThan(0);
  });

  it("runs a model with render() into primary + named stages", async () => {
    const result = await run(SOURCE, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.primary).toBe("result");
    expect(result.stages.map((s) => [s.name, s.op])).toEqual([
      ["result", "fillet"],
      ["cube", "extrude"],
      ["face", "rect"],
    ]);
    for (const s of result.stages) {
      expect(s.mesh.positions.length).toBeGreaterThan(0);
    }
  });

  it("errors when the model never calls render()", async () => {
    const result = await run("const x = rect(1, 1);", { compile: nodeCompile });
    // rect alone is a region, not a body, so there's no fallback body to render.
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.stages).toEqual([]);
  });

  it("reports errors without throwing", async () => {
    const result = await run("this is not valid ts !!!", { compile: nodeCompile });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.stages).toEqual([]);
  });

  it("aborts a runaway loop via the timeout instead of hanging", async () => {
    const result = await run("while (true) {}", {
      compile: nodeCompile,
      timeoutMs: 200,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].toLowerCase()).toContain("timed out");
    expect(result.stages).toEqual([]);
  });
});
