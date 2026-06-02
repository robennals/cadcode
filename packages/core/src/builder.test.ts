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

  it("records render() with a primary and named stages", () => {
    const b = createBuilder();
    const face = b.rect(20, 20);
    const cube = b.extrude(face, 20);
    const rounded = b.fillet(cube, b.edges(cube).all, 3);
    b.render(rounded, { cube, face });
    const model = b.getModel();
    expect(model.render?.primary).toBe(rounded.__id);
    expect(model.render?.stages).toEqual([
      { name: "cube", id: cube.__id },
      { name: "face", id: face.__id },
    ]);
  });

  it("falls back to the last alive body when render() is not called", () => {
    const b = createBuilder();
    const cube = b.extrude(b.rect(10, 10), 5);
    const model = b.getModel();
    expect(model.render?.primary).toBe(cube.__id);
    expect(model.render?.stages).toEqual([]);
  });
});

describe("more operators", () => {
  it("records circle/polygon regions and revolve/loft/shell/chamfer/boolean bodies", () => {
    const b = createBuilder();
    const disc = b.circle(10);
    const cyl = b.extrude(disc, 20);
    const hollow = b.shell(cyl, 2);
    const beveled = b.chamfer(hollow, b.edges(hollow).all, 1);
    const poly = b.polygon([
      [2, 0],
      [5, 0],
      [5, 10],
    ]);
    const vase = b.revolve(poly);
    const cone = b.loft([b.circle(10), b.circle(5)], [0, 20]);
    const combo = b.union(beveled, vase);
    const cut = b.subtract(combo, cone);
    const model = b.getModel();

    expect(model.nodes[disc.__id].op).toBe("circle");
    expect(model.nodes[poly.__id].op).toBe("polygon");
    expect(model.nodes[vase.__id].op).toBe("revolve");
    if (model.nodes[cone.__id].op === "loft") {
      expect((model.nodes[cone.__id] as { heights: number[] }).heights).toEqual([0, 20]);
    }
    expect(model.nodes[cut.__id].op).toBe("boolean");
    // Regions aren't alive; consumed bodies aren't either — only the final cut.
    expect(model.alive).toContain(cut.__id);
    expect(model.alive).not.toContain(disc.__id);
    expect(model.alive).not.toContain(cyl.__id);
  });
});

describe("sketch + constraints", () => {
  it("records a square sketch with points, lines, constraints, and a 4-point loop", () => {
    const b = createBuilder();
    const [lb, lr, lt, ll] = b.lines(4);
    b.coincident(
      [lb.end, lr.start],
      [lr.end, lt.start],
      [lt.end, ll.start],
      [ll.end, lb.start],
    );
    b.parallel([lb, lt], [lr, ll]);
    b.perpendicular(lb, lr);
    b.equal([lb, lr, lt, ll]);
    b.horizontal(lb);
    b.distance(lb.start, lb.end, 20);
    const sq = b.sketch({ lb, lr, lt, ll });

    const model = b.getModel();
    const node = model.nodes[sq.region.__id];
    expect(node.op).toBe("sketch");
    if (node.op === "sketch") {
      expect(node.lines).toHaveLength(4);
      expect(node.points).toHaveLength(8); // 2 per line before coincident merge
      expect(node.loop).toHaveLength(4); // merged corners
      expect(node.points.find((p) => p.fixed)).toBeTruthy(); // first point pinned
      const kinds = node.constraints.map((c) => c.kind);
      expect(kinds).toContain("coincident");
      expect(kinds).toContain("perpendicular");
      expect(kinds).toContain("distance");
    }
    // A sketch is a region, not an alive body.
    expect(model.alive).not.toContain(sq.region.__id);
  });
});
