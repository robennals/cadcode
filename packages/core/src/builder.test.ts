// Tests that the builder records the right graph and alive-body tracking.
import { describe, it, expect } from "vitest";
import { createBuilder } from "./builder";

describe("createBuilder", () => {
  it("builds a rect -> extrude -> fillet graph and tracks alive bodies", () => {
    const b = createBuilder();
    const face = b.rect(20, 20);
    const cube = b.extrude(face, 20);
    b.fillet(cube, b.edges(cube).all, 3);
    const model = b.getModel();

    expect(model.order).toHaveLength(3);
    // rect consumed by extrude, extrude consumed by fillet -> only fillet is alive
    expect(model.alive).toHaveLength(1);
    const aliveNode = model.nodes[model.alive[0]];
    expect(aliveNode.op).toBe("fillet");

    const extrude = Object.values(model.nodes).find((n) => n.op === "extrude")!;
    expect(extrude).toMatchObject({ op: "extrude", height: 20 });
    if (extrude.op === "extrude") {
      const region = model.nodes[extrude.region];
      expect(region).toMatchObject({ op: "rect", width: 20, height: 20 });
    }
  });

  it("leaves an un-consumed body alive", () => {
    const b = createBuilder();
    const face = b.rect(10, 10);
    b.extrude(face, 5);
    const model = b.getModel();
    expect(model.alive).toHaveLength(1);
    expect(model.nodes[model.alive[0]].op).toBe("extrude");
  });
});
