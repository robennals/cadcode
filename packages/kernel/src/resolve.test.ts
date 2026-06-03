import { describe, it, expect, beforeAll } from "vitest";
import { init } from "./oc";
import { extrudeRect, volume } from "./kernel";
import { resolveEdges, resolveFaces, filletEdges, shellFaces } from "./resolve";

describe("resolve", () => {
  beforeAll(async () => { await init(); });

  it("resolves a cube's top edges, vertical edges, and all edges", () => {
    const cube = extrudeRect(20, 20, 20);
    expect(resolveEdges(cube, { kind: "all" }).length).toBe(12);
    expect(resolveEdges(cube, { kind: "ofFace", face: { kind: "planeZ", z: 20 } }).length).toBe(4);
    expect(resolveEdges(cube, { kind: "ofFace", face: { kind: "named", name: "bottom" } }).length).toBe(4);
    expect(resolveEdges(cube, { kind: "connecting", a: { kind: "named", name: "top" }, b: { kind: "named", name: "bottom" } }).length).toBe(4);
  });

  it("resolves the top face", () => {
    const cube = extrudeRect(20, 20, 20);
    expect(resolveFaces(cube, { kind: "named", name: "top" }).length).toBe(1);
    expect(resolveFaces(cube, { kind: "planeZ", z: 0 }).length).toBe(1);
  });

  it("fillets only the top edges (more volume kept than filleting all)", () => {
    const all = volume(filletEdges(extrudeRect(20,20,20), [{ kind: "all" }], 3));
    const top = volume(filletEdges(extrudeRect(20,20,20), [{ kind: "ofFace", face: { kind: "planeZ", z: 20 } }], 3));
    expect(top).toBeGreaterThan(all);
    expect(top).toBeLessThan(8000);
  });

  it("shells open the top face only", () => {
    const v = volume(shellFaces(extrudeRect(20,20,20), [{ kind: "named", name: "top" }], 2));
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(8000);
  });
});
