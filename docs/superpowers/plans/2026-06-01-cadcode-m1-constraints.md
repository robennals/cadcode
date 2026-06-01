# cadcode M1 (Sketch Constraints) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define 2D sketches with geometric + dimensional constraints (the `square()` example), solve them with FreeCAD's GCS solver, and extrude the solved profile into a body — all wired into the existing run → kernel → stage-render pipeline.

**Architecture:** A new `@cadcode/solver` package wraps `@salusoft89/planegcs` (FreeCAD's constraint solver, WASM) behind a small `solveSketch()` interface. The `core` builder records a sketch as a graph node (points, lines, constraints, boundary loop) — pure data, no solving. In the **evaluate phase** (Node, the trusted build step — never the user-code sandbox), the runtime hands the sketch to the solver, gets solved point coordinates, and asks the kernel to extrude/mesh the resulting closed polygon. The solver loads its WASM once at dev-server startup, exactly like OpenCascade.

**Tech Stack:** TypeScript, Vitest, `@salusoft89/planegcs` (constraint solver WASM), replicad/OpenCascade (geometry), existing cadcode packages.

**Scope (first slice):** the `square()` example end-to-end — `lines`, `point`, `coincident`, `parallel`, `perpendicular`, `equal`, `horizontal`, `vertical`, `distance` (numeric), `sketch()`, extrude + render the sketch as a face stage. **Deferred to later M1 increments** (out of scope here, called out where relevant): free `dimension()` variables, arcs/circles/B-splines, sub-sketch composition with threaded dimensions, and FreeCAD-grade per-constraint diagnostics.

---

## File structure

```
packages/
  protocol/src/index.ts        # + sketch graph types (PointDef/LineDef/ConstraintDef/SketchNode) + SketchSolution
  solver/                      # NEW package @cadcode/solver
    package.json
    tsconfig.json
    src/index.ts               # re-exports
    src/planegcs.ts            # init() + solveSketch(): wraps planegcs
    src/planegcs.test.ts
  kernel/src/kernel.ts         # + extrudeProfile() + profileFaceMesh()
  kernel/src/index.ts          # export them
  kernel/src/kernel.test.ts    # + profile tests
  core/src/builder.ts          # + point/lines/constraints/sketch; loop derivation
  core/src/builder.test.ts     # + sketch graph tests
  runtime/src/run.ts           # evaluate: solve sketch -> profile -> extrude/mesh
  runtime/src/run.test.ts      # + square-via-constraints test
  cli/package.json             # + @cadcode/solver dep; init solver at startup
  cli/src/dev.ts               # init solver alongside kernel
  types/index.d.ts             # + sketch/constraint API declarations
examples/square.ts             # NEW constraint example
packages/app/tests/fixtures/square.ts   # NEW e2e fixture
```

**Data model (the contract all tasks share).** Added to `@cadcode/protocol`:

```ts
// A sketch point: a seed position and whether it's pinned for the solver.
export interface PointDef { id: string; x: number; y: number; fixed: boolean }
// A sketch line between two points (by id).
export interface LineDef { id: string; p1: string; p2: string }
// Geometric + dimensional constraints (M1 first slice).
export type ConstraintDef =
  | { kind: "coincident"; p1: string; p2: string }      // point ids
  | { kind: "parallel"; l1: string; l2: string }        // line ids
  | { kind: "perpendicular"; l1: string; l2: string }
  | { kind: "equalLength"; l1: string; l2: string }
  | { kind: "horizontal"; line: string }
  | { kind: "vertical"; line: string }
  | { kind: "distance"; p1: string; p2: string; value: number };
// A sketch as a graph node — a region that can be extruded/rendered.
export interface SketchNode {
  id: string;
  op: "sketch";
  points: PointDef[];
  lines: LineDef[];
  constraints: ConstraintDef[];
  loop: string[];     // ordered point ids forming the closed boundary
  sources: string[];
}
// Result of solving a sketch.
export interface SketchSolution {
  status: "ok" | "failed";
  points: Record<string, { x: number; y: number }>;  // solved coords by point id
  message?: string;
}
```

---

## Task 1: protocol — sketch graph + solution types

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/protocol/src/index.test.ts`:
```ts
import { isBodyNode as _isBody } from "./index";
import type { SketchNode, ConstraintDef, SketchSolution } from "./index";

describe("sketch types", () => {
  it("models a sketch node and a solution", () => {
    const c: ConstraintDef = { kind: "distance", p1: "p0", p2: "p1", value: 20 };
    const sketch: SketchNode = {
      id: "sketch_0",
      op: "sketch",
      points: [{ id: "p0", x: 0, y: 0, fixed: true }],
      lines: [{ id: "l0", p1: "p0", p2: "p1" }],
      constraints: [c],
      loop: ["p0", "p1"],
      sources: [],
    };
    const sol: SketchSolution = { status: "ok", points: { p0: { x: 0, y: 0 } } };
    expect(sketch.op).toBe("sketch");
    expect(sol.status).toBe("ok");
    // A sketch is a region, not a body.
    expect(_isBody(sketch as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/protocol`
Expected: FAIL — `SketchNode`/`ConstraintDef`/`SketchSolution` not exported.

- [ ] **Step 3: Add the types**

In `packages/protocol/src/index.ts`, add the `PointDef`, `LineDef`, `ConstraintDef`, `SketchNode`, `SketchSolution` definitions (exact code in the "Data model" block above), and extend the `Node` union and `RectNode`/region handling:
```ts
export type Node = RectNode | BodyNode | SketchNode;
```
Leave `isBodyNode` unchanged (sketch is not a body, so it correctly returns false).

Also allow an extrude to consume a sketch region: no type change needed — `ExtrudeNode.region` is already a `string` (node id) and may now point at a `SketchNode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/protocol`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(protocol): sketch graph + solution types for M1"
```

---

## Task 2: @cadcode/solver — wrap planegcs (SPIKE + test)

> De-risks the planegcs lifecycle (init, push primitives, solve, read coords, dispose) the same way M0's kernel task de-risked replicad. A spike confirmed the API: primitives are JSON objects with ids; `init_planegcs_module()` loads the WASM in Node with no `locateFile`.

**Files:**
- Create: `packages/solver/package.json`, `packages/solver/tsconfig.json`, `packages/solver/src/index.ts`, `packages/solver/src/planegcs.ts`, `packages/solver/src/planegcs.test.ts`

- [ ] **Step 1: Create the package**

`packages/solver/package.json`:
```json
{
  "name": "@cadcode/solver",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@cadcode/protocol": "workspace:*",
    "@salusoft89/planegcs": "^1.1.7"
  }
}
```
`packages/solver/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
Run: `pnpm install`.

- [ ] **Step 2: Confirm the planegcs primitive/constraint names**

Run: `node -e "import('@salusoft89/planegcs').then(m=>console.log(Object.keys(m)))"`
Expected: includes `init_planegcs_module` and `GcsWrapper`. The geometry/constraint `type` strings used below were confirmed from the package's `.d.ts`: `point{x,y,fixed}`, `line{p1_id,p2_id}`, `parallel{l1_id,l2_id}`, `perpendicular_ll{l1_id,l2_id}`, `equal_length{l1_id,l2_id}`, `p2p_coincident{p1_id,p2_id}`, `p2p_distance{p1_id,p2_id,distance}`, `horizontal_l{l_id}`, `vertical_l{l_id}`. If a name differs in the installed version, adjust the mapping in Step 5.

- [ ] **Step 3: Write the failing test**

`packages/solver/src/planegcs.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { init, solveSketch } from "./planegcs";
import type { SketchNode } from "@cadcode/protocol";

// A unit-ish square seeded roughly, constrained to a 20x20 axis-aligned square.
function squareSketch(): SketchNode {
  // 4 corners p0..p3, 4 lines; bottom-left pinned at origin.
  return {
    id: "s",
    op: "sketch",
    points: [
      { id: "p0", x: 0, y: 0, fixed: true },
      { id: "p1", x: 18, y: 1, fixed: false },
      { id: "p2", x: 19, y: 22, fixed: false },
      { id: "p3", x: -1, y: 21, fixed: false },
    ],
    lines: [
      { id: "lb", p1: "p0", p2: "p1" }, // bottom
      { id: "lr", p1: "p1", p2: "p2" }, // right
      { id: "lt", p1: "p2", p2: "p3" }, // top
      { id: "ll", p1: "p3", p2: "p0" }, // left
    ],
    constraints: [
      { kind: "horizontal", line: "lb" },
      { kind: "perpendicular", l1: "lb", l2: "lr" },
      { kind: "parallel", l1: "lb", l2: "lt" },
      { kind: "parallel", l1: "ll", l2: "lr" },
      { kind: "equalLength", l1: "lb", l2: "lr" },
      { kind: "distance", p1: "p0", p2: "p1", value: 20 },
    ],
    loop: ["p0", "p1", "p2", "p3"],
    sources: [],
  };
}

describe("solveSketch", () => {
  beforeAll(async () => { await init(); });

  it("solves a constrained square to a 20x20 axis-aligned square", () => {
    const sol = solveSketch(squareSketch());
    expect(sol.status).toBe("ok");
    const { p0, p1, p2, p3 } = sol.points;
    const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-3);
    close(p0.x, 0); close(p0.y, 0);
    close(p1.x, 20); close(p1.y, 0);
    close(p2.x, 20); close(p2.y, 20);
    close(p3.x, 0); close(p3.y, 20);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/solver`
Expected: FAIL — `./planegcs` not found.

- [ ] **Step 5: Implement `planegcs.ts`**

`packages/solver/src/planegcs.ts`:
```ts
// @ts-expect-error - planegcs ships types but the module entry is JS
import { init_planegcs_module, GcsWrapper } from "@salusoft89/planegcs";
import type { SketchNode, ConstraintDef, SketchSolution } from "@cadcode/protocol";

let mod: any;
let ready: Promise<void> | undefined;

export function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      mod = await init_planegcs_module();
    })();
  }
  return ready;
}

// Translate one cadcode constraint into a planegcs primitive (line ids prefixed
// with "L" so they never collide with point ids).
function toPrimitive(c: ConstraintDef, i: string): Record<string, unknown> {
  const L = (id: string) => `L${id}`;
  switch (c.kind) {
    case "coincident":
      return { id: i, type: "p2p_coincident", p1_id: c.p1, p2_id: c.p2 };
    case "parallel":
      return { id: i, type: "parallel", l1_id: L(c.l1), l2_id: L(c.l2) };
    case "perpendicular":
      return { id: i, type: "perpendicular_ll", l1_id: L(c.l1), l2_id: L(c.l2) };
    case "equalLength":
      return { id: i, type: "equal_length", l1_id: L(c.l1), l2_id: L(c.l2) };
    case "horizontal":
      return { id: i, type: "horizontal_l", l_id: L(c.line) };
    case "vertical":
      return { id: i, type: "vertical_l", l_id: L(c.line) };
    case "distance":
      return { id: i, type: "p2p_distance", p1_id: c.p1, p2_id: c.p2, distance: c.value };
  }
}

export function solveSketch(sketch: SketchNode): SketchSolution {
  const gcs = new GcsWrapper(new mod.GcsSystem());
  try {
    const primitives: Record<string, unknown>[] = [];
    for (const p of sketch.points)
      primitives.push({ id: p.id, type: "point", x: p.x, y: p.y, fixed: p.fixed });
    for (const l of sketch.lines)
      primitives.push({ id: `L${l.id}`, type: "line", p1_id: l.p1, p2_id: l.p2 });
    sketch.constraints.forEach((c, k) => primitives.push(toPrimitive(c, `c${k}`)));

    gcs.push_primitives_and_params(primitives as never);
    const status = gcs.solve();
    gcs.apply_solution();

    const points: Record<string, { x: number; y: number }> = {};
    for (const prim of gcs.sketch_index.get_primitives() as any[]) {
      if (prim.type === "point") points[prim.id] = { x: prim.x, y: prim.y };
    }
    // planegcs solve() returns 0 on success.
    return status === 0
      ? { status: "ok", points }
      : { status: "failed", points, message: `solver status ${status}` };
  } finally {
    // Free the WASM-side system for this solve.
    (gcs as any).destroy_gcs_module?.();
  }
}
```
`packages/solver/src/index.ts`:
```ts
export { init, solveSketch } from "./planegcs";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/solver`
Expected: PASS. If the square doesn't converge, first try better seeds (the test seeds corners near the target). If `destroy_gcs_module` is the wrong disposal call, check `gcs_wrapper.d.ts` for the per-system cleanup method and use it (a leak here would only show over many solves).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(solver): wrap planegcs; solve a constrained square"
```

---

## Task 3: kernel — extrude and mesh a profile polygon

**Files:**
- Modify: `packages/kernel/src/kernel.ts`, `packages/kernel/src/index.ts`, `packages/kernel/src/kernel.test.ts`

- [ ] **Step 1: Confirm replicad's polyline draw API**

Run: `node -e "import('replicad').then(r=>console.log(Object.keys(r).filter(k=>/draw/i.test(k))))"`
Expected: includes `draw` (a pen-style API). We build a closed polygon with `draw([x,y]).lineTo([x,y])…close()`. If `draw` takes no start arg in the installed version, use `draw().movePointerTo([x,y]).lineTo(...)`; verify against `node_modules/.pnpm/replicad@*/.../replicad.d.ts` (`class Drawing` / `DrawingPen`).

- [ ] **Step 2: Write the failing test (append)**

Append to `packages/kernel/src/kernel.test.ts`:
```ts
import { extrudeProfile, profileFaceMesh } from "./kernel";

describe("kernel profile", () => {
  beforeAll(async () => { await init(); });

  it("extrudes a 20x20 square profile by 10 into a volume ~4000", () => {
    const square: [number, number][] = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const solid = extrudeProfile(square, 10);
    expect(volume(solid)).toBeCloseTo(4000, 0);
  });

  it("meshes a profile as a flat face", () => {
    const square: [number, number][] = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const mesh = profileFaceMesh("f", square);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/kernel`
Expected: FAIL — `extrudeProfile`/`profileFaceMesh` not exported.

- [ ] **Step 4: Implement (append to `kernel.ts`)**

```ts
import { draw } from "replicad";

function drawProfile(points: [number, number][]) {
  if (points.length < 3) throw new Error("a profile needs at least 3 points");
  let pen = (draw as any)(points[0]);
  for (let i = 1; i < points.length; i++) pen = pen.lineTo(points[i]);
  return pen.close(); // a closed Drawing
}

export function extrudeProfile(points: [number, number][], depth: number): Solid {
  return drawProfile(points).sketchOnPlane("XY").extrude(depth);
}

export function profileFaceMesh(id: string, points: [number, number][]): BodyMesh {
  const face = (drawProfile(points).sketchOnPlane("XY") as any).face();
  try {
    return meshOf(id, face);
  } finally {
    dispose(face);
  }
}
```
(Reuses the existing private `meshOf` and `dispose`.) Add to `packages/kernel/src/index.ts`:
```ts
export { extrudeProfile, profileFaceMesh } from "./kernel";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/kernel`
Expected: PASS. If `draw(points[0])` errors, switch `drawProfile` to `draw().movePointerTo(points[0])` per Step 1's check.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(kernel): extrude and mesh a profile polygon"
```

---

## Task 4: core — sketch entities, constraints, and `sketch()`

**Files:**
- Modify: `packages/core/src/builder.ts`, `packages/core/src/builder.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Append to `packages/core/src/builder.test.ts`:
```ts
describe("sketch + constraints", () => {
  it("records a square sketch with points, lines, constraints, and a 4-point loop", () => {
    const b = createBuilder();
    const [lb, lr, lt, ll] = b.lines(4);
    b.coincident([lb.end, lr.start], [lr.end, lt.start], [lt.end, ll.start], [ll.end, lb.start]);
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
      expect(node.points).toHaveLength(8);          // 2 per line before merge
      expect(node.loop).toHaveLength(4);            // merged corners
      const kinds = node.constraints.map((c) => c.kind).sort();
      expect(kinds).toContain("coincident");
      expect(kinds).toContain("perpendicular");
      expect(kinds).toContain("distance");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core`
Expected: FAIL — `b.lines` is not a function.

- [ ] **Step 3: Implement the sketch API in `builder.ts`**

Add these handle types near the top:
```ts
export interface Point { readonly __id: string }
export interface Line { readonly __id: string; readonly start: Point; readonly end: Point }
```
Extend the `Builder` interface:
```ts
  point(x?: number, y?: number): Point;
  lines(n: number): Line[];
  coincident(...pairs: [Point, Point][]): void;
  parallel(...groups: Line[][]): void;
  perpendicular(a: Line, b: Line): void;
  equal(lines: Line[]): void;
  horizontal(line: Line): void;
  vertical(line: Line): void;
  distance(a: Point, b: Point, value: number): void;
  sketch(entities: Record<string, Line>): { region: Handle } & Record<string, Line>;
```
Inside `createBuilder`, add pending sketch-scope state and the methods. Seed points spread around a unit circle by creation index so the solver starts non-degenerate:
```ts
  // --- sketch building (M1) ---
  const points: import("@cadcode/protocol").PointDef[] = [];
  const slines: import("@cadcode/protocol").LineDef[] = [];
  const sconstraints: import("@cadcode/protocol").ConstraintDef[] = [];
  let pcount = 0;
  const nextPoint = (x: number, y: number): Point => {
    const id = `p${pcount++}`;
    points.push({ id, x, y, fixed: false });
    return { __id: id };
  };
  const seed = (k: number): [number, number] => {
    const a = (k * Math.PI * 2) / 8; // spread so no two seeds coincide
    return [Math.cos(a) * 10, Math.sin(a) * 10];
  };
```
Methods (add to the returned object):
```ts
    point(x = 0, y = 0) {
      return nextPoint(x, y);
    },
    lines(n) {
      const out: Line[] = [];
      for (let i = 0; i < n; i++) {
        const [sx, sy] = seed(points.length);
        const start = nextPoint(sx, sy);
        const [ex, ey] = seed(points.length);
        const end = nextPoint(ex, ey);
        const id = `l${slines.length}`;
        slines.push({ id, p1: start.__id, p2: end.__id });
        out.push({ __id: id, start, end });
      }
      return out;
    },
    coincident(...pairs) {
      for (const [a, b] of pairs)
        sconstraints.push({ kind: "coincident", p1: a.__id, p2: b.__id });
    },
    parallel(...groups) {
      for (const g of groups)
        for (let i = 1; i < g.length; i++)
          sconstraints.push({ kind: "parallel", l1: g[0].__id, l2: g[i].__id });
    },
    perpendicular(a, b) {
      sconstraints.push({ kind: "perpendicular", l1: a.__id, l2: b.__id });
    },
    equal(lines) {
      for (let i = 1; i < lines.length; i++)
        sconstraints.push({ kind: "equalLength", l1: lines[0].__id, l2: lines[i].__id });
    },
    horizontal(line) {
      sconstraints.push({ kind: "horizontal", line: line.__id });
    },
    vertical(line) {
      sconstraints.push({ kind: "vertical", line: line.__id });
    },
    distance(a, b, value) {
      sconstraints.push({ kind: "distance", p1: a.__id, p2: b.__id, value });
    },
    sketch(entities) {
      const id = nextId("sketch");
      // Pin the first point to remove the sketch's free translation.
      if (points[0]) points[0].fixed = true;
      const loop = deriveLoop(points, slines, sconstraints);
      const node: Node = {
        id, op: "sketch",
        points: points.splice(0), lines: slines.splice(0),
        constraints: sconstraints.splice(0), loop, sources: [],
      };
      nodes[node.id] = node;
      order.push(node.id);
      alive.add(node.id);
      return { ...entities, region: { __id: node.id } };
    },
```
Add the loop-derivation helper at module scope (above `createBuilder`):
```ts
import type { PointDef, LineDef, ConstraintDef } from "@cadcode/protocol";

// Merge coincident points (union-find), then walk the line graph into a single
// ordered boundary cycle of representative point ids.
function deriveLoop(points: PointDef[], lines: LineDef[], cons: ConstraintDef[]): string[] {
  const parent = new Map(points.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const c of cons) if (c.kind === "coincident") union(c.p1, c.p2);

  const adj = new Map<string, string[]>();
  for (const l of lines) {
    const a = find(l.p1), b = find(l.p2);
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const groups = [...adj.keys()];
  if (groups.length === 0) return [];
  // Walk the cycle.
  const loop: string[] = [];
  const seen = new Set<string>();
  let cur = groups[0];
  let prev = "";
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    loop.push(cur);
    const nexts = (adj.get(cur) ?? []).filter((n) => n !== prev);
    prev = cur;
    cur = nexts[0];
  }
  return loop;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): sketch entities, constraints, and loop derivation"
```

---

## Task 5: runtime — solve sketches and extrude their profiles

**Files:**
- Modify: `packages/runtime/package.json` (add `@cadcode/solver` dep), `packages/runtime/src/run.ts`, `packages/runtime/src/run.test.ts`

- [ ] **Step 1: Add the solver dependency**

In `packages/runtime/package.json` dependencies add `"@cadcode/solver": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing test (rewrite SOURCE)**

In `packages/runtime/src/run.test.ts`, add a constraint-based test (keep existing ones). Note the solver must be initialised too:
```ts
import { init as initSolver } from "@cadcode/solver";

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

describe("runtime constraints", () => {
  beforeAll(async () => { await init(); await initSolver(); });

  it("solves a constrained square sketch and extrudes it", async () => {
    const result = await run(SQUARE, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.stages.map((s) => [s.name, s.op])).toEqual([
      ["result", "extrude"],
      ["sketch", "sketch"],
    ]);
    for (const s of result.stages) expect(s.mesh.positions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime`
Expected: FAIL — `lines`/`sketch` are not injected; extrude of a sketch not handled.

- [ ] **Step 4: Implement in `run.ts`**

Inject the new API into the vm context (these are builder methods, pure data recording — no solver in the sandbox):
```ts
    rect: builder.rect,
    extrude: builder.extrude,
    fillet: builder.fillet,
    edges: builder.edges,
    dimension,
    render: builder.render,
    point: builder.point,
    lines: builder.lines,
    coincident: builder.coincident,
    parallel: builder.parallel,
    perpendicular: builder.perpendicular,
    equal: builder.equal,
    horizontal: builder.horizontal,
    vertical: builder.vertical,
    distance: builder.distance,
    sketch: builder.sketch,
```
Add solver import and a sketch→profile cache, and handle sketch in `evaluate` and `meshTarget`:
```ts
import { solveSketch } from "@cadcode/solver";

// Solve a sketch node into a closed profile of solved [x,y] corners.
function profileOf(model: Model, id: string): [number, number][] {
  const node = model.nodes[id];
  if (node.op !== "sketch") throw new Error(`'${id}' is not a sketch`);
  const sol = solveSketch(node);
  if (sol.status !== "ok") throw new Error(sol.message ?? "sketch failed to solve");
  return node.loop.map((pid) => {
    const p = sol.points[pid];
    if (!p) throw new Error(`sketch solution missing point '${pid}'`);
    return [p.x, p.y] as [number, number];
  });
}
```
In `evaluate`, extend the `extrude` branch so a sketch region is solved+profiled:
```ts
    if (node.op === "extrude") {
      const region = model.nodes[node.region];
      if (region?.op === "rect") {
        solids.set(id, extrudeRect(region.width, region.height, node.height));
      } else if (region?.op === "sketch") {
        solids.set(id, extrudeProfile(profileOf(model, node.region), node.height));
      } else {
        throw new Error(`extrude: unknown region '${node.region}'`);
      }
    } else if (node.op === "fillet") {
      // ...unchanged...
    }
```
In `meshTarget`, handle a sketch render target (show it as a face):
```ts
  if (node.op === "sketch") {
    return { name: "", op: "sketch", mesh: profileFaceMesh(id, profileOf(model, id)) };
  }
  if (node.op === "rect") {
    return { name: "", op: "rect", mesh: regionFaceMesh(id, node.width, node.height) };
  }
```
Update imports from `@cadcode/kernel` to include `extrudeProfile, profileFaceMesh`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime`
Expected: PASS (constraint test + the existing tests).

- [ ] **Step 6: Run the whole headless suite**

Run: `pnpm test`
Expected: all packages pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(runtime): solve sketches and extrude their profiles"
```

---

## Task 6: cli — initialise the solver at startup; types; example

**Files:**
- Modify: `packages/cli/package.json`, `packages/cli/src/dev.ts`, `packages/types/index.d.ts`
- Create: `examples/square.ts`

- [ ] **Step 1: Add the solver dep and init it at startup**

In `packages/cli/package.json` dependencies add `"@cadcode/solver": "workspace:*"`. Run `pnpm install`.
In `packages/cli/src/dev.ts`, import and init the solver next to the kernel:
```ts
import { init as initSolver } from "@cadcode/solver";
```
and in `startDev`, change `await init();` to:
```ts
  await Promise.all([init(), initSolver()]); // load OpenCascade + the constraint solver
```

- [ ] **Step 2: Declare the new API in `@cadcode/types`**

Append to `packages/types/index.d.ts`:
```ts
/** A sketch point. */
declare interface Point { readonly __id: string }
/** A sketch line with two endpoints. */
declare interface Line { readonly __id: string; readonly start: Point; readonly end: Point }

/** Create a free sketch point (optionally seeded near x,y). */
declare function point(x?: number, y?: number): Point;
/** Create n sketch lines (each with its own start/end points). */
declare function lines(n: number): Line[];
/** Make each given pair of points coincident. */
declare function coincident(...pairs: [Point, Point][]): void;
/** Make the lines in each group mutually parallel. */
declare function parallel(...groups: Line[][]): void;
/** Make two lines perpendicular. */
declare function perpendicular(a: Line, b: Line): void;
/** Make all the given lines equal length. */
declare function equal(lines: Line[]): void;
/** Constrain a line horizontal / vertical. */
declare function horizontal(line: Line): void;
declare function vertical(line: Line): void;
/** Constrain the distance between two points. */
declare function distance(a: Point, b: Point, value: number): void;
/** Bundle constrained entities into a sketch; `.region` is extrudable. */
declare function sketch<T extends Record<string, Line>>(entities: T): T & { region: Handle };
```

- [ ] **Step 3: Create the example**

`examples/square.ts`:
```ts
// A constraint-defined square: four lines made into a 20x20 square by
// geometric constraints, then extruded.
function square(side: number) {
  const [bottom, right, top, left] = lines(4);
  coincident(
    [bottom.end, right.start],
    [right.end, top.start],
    [top.end, left.start],
    [left.end, bottom.start],
  );
  parallel([bottom, top], [left, right]);
  perpendicular(bottom, right);
  equal([bottom, right, top, left]);
  horizontal(bottom);
  distance(bottom.start, bottom.end, side);
  return sketch({ bottom, right, top, left });
}

const sk = square(20);
const body = extrude(sk.region, 20);
render(body, { sketch: sk });
```

- [ ] **Step 4: Verify the example type-checks**

Run: `cd examples && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors (the new declarations resolve `lines`, `coincident`, etc.).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cli,types): init solver at startup; declare sketch API; square example"
```

---

## Task 7: e2e — render the constraint square

**Files:**
- Create: `packages/app/tests/fixtures/square.ts`
- Modify: `packages/app/tests/smoke.spec.ts`

- [ ] **Step 1: Create the fixture**

`packages/app/tests/fixtures/square.ts` (same as `examples/square.ts` above).

- [ ] **Step 2: Write the e2e test (append to smoke.spec.ts)**

```ts
test("renders a constraint-solved sketch (square) and its sketch stage", async ({ page }) => {
  await page.goto("/?file=square.ts");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  // Stages: the extruded result + the sketch shown as a face.
  await expect(page.getByTestId("stage-result")).toContainText("extrude");
  await expect(page.getByTestId("stage-sketch")).toContainText("sketch");
  await expect(page.getByTestId("errors")).toBeHidden();
});
```

- [ ] **Step 3: Run the e2e**

Run: `pnpm --filter @cadcode/app test:e2e`
Expected: PASS — the square renders, both stages present, no errors. (The Playwright server is `cadcode dev`, which now inits the solver at startup.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(app): e2e render of the constraint-solved square"
```

---

## Task 8: Wrap-up — docs and full verification

**Files:**
- Modify: `README.md`, `packages/README.md`, `packages/solver/README.md` (create), `docs/superpowers/specs/2026-05-31-cadcode-design.md` (M1 status)

- [ ] **Step 1: Full green run**

Run: `pnpm test` then `pnpm --filter @cadcode/app test:e2e`
Expected: all unit + e2e pass.

- [ ] **Step 2: Typecheck every package**

Run, for each of `protocol types core kernel solver runtime cli app`:
`pnpm --filter @cadcode/<name> exec tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 3: Docs**

- Create `packages/solver/README.md` describing the planegcs wrapper and `solveSketch`.
- Add a `@cadcode/solver` row to `packages/README.md` and the root README package table.
- In the design spec, mark M1's first slice delivered (constraint sketches via planegcs, solved in the evaluate phase) and note what remains in M1 (free `dimension()`, arcs/circles/B-splines, sub-sketch composition, richer diagnostics).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: M1 sketch-constraints readme and spec status"
```

---

## Self-review notes (addressed in this plan)

- **Spec coverage (M1 milestone):** planegcs integration (Task 2), geometric constraints coincident/parallel/perpendicular/equal/horizontal/vertical (Tasks 4–5), dimensional `distance` (Tasks 4–5), solve fires when the sketch is consumed by extrude/render (Task 5 `profileOf` runs in evaluate), under/over-constraint surfaced as an error (Task 5 throws on non-`ok` status → viewer error panel). **Deferred within M1** (explicitly noted, not silently dropped): free `dimension()` variables, arcs/circles/B-splines, sub-sketch composition with threaded dimensions, and FreeCAD-grade per-constraint diagnostics.
- **Type consistency:** `PointDef`/`LineDef`/`ConstraintDef`/`SketchNode`/`SketchSolution` are defined once in Task 1 and used by solver (Task 2), core (Task 4), and runtime (Task 5). Builder handle types `Point`/`Line` (Task 4) match the `@cadcode/types` declarations (Task 6) and the constraint method signatures used in the runtime test source (Task 5).
- **Known soft spots flagged inline (to verify during build, like M0's replicad tuning):** exact planegcs disposal call (Task 2 Step 6), seed positions / convergence (Task 2 Step 6), and replicad's `draw` polyline entry point (Task 3 Step 1).
- **Solve location:** the solver is only ever called in the evaluate phase (`profileOf`, Task 5) — never injected into the user-code vm sandbox; the builder records sketches as pure data.
