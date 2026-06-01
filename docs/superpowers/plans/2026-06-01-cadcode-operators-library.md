# cadcode Operators + Example Library Plan

> Extends the established region → operator → body graph pattern (extrude/fillet)
> with more Fusion-style operators, plus a broad library of example parts.

**Goal:** Add `circle`/`polygon` primitives and `revolve`, `loft`, `shell`,
`chamfer`, and boolean (`union`/`subtract`/`intersect`) operators, then build a
library of standard example solids that show the system creating real parts with
elegant syntax.

**Architecture:** Same pattern as extrude/fillet — each primitive/operator is a
graph node in `protocol`, a builder method in `core`, a geometry function in
`kernel` (wrapping replicad), and an `evaluate`/`meshTarget` case in `runtime`.
`@cadcode/types` declares the API; `examples/` demonstrates it.

**Deferred:** `sweep` (replicad's `sweepSketch` needs a path-curve abstraction —
its own follow-up), and `revolve`/`loft` of constraint-solved sketches (v1 uses
`polygon`/`circle` profiles). Parametric `dimension()` + arcs are the next PR.

---

## Kernel geometry contract (implemented by a subagent in `packages/kernel/src/ops.ts`)

A new file `packages/kernel/src/ops.ts` (so it doesn't collide with edits to
`kernel.ts`), re-exported from `kernel/src/index.ts`. All functions return the
opaque `Solid` (or `BodyMesh`) and reuse the existing private mesh helper pattern.
replicad reference (confirmed signatures): `drawCircle(r)`, Sketch `.revolve(axis?, {origin})`,
Sketch `.loftWith(others, config?)`, Shape3D `.shell(thickness, (f)=>FaceFinder)`,
Shape3D `.chamfer(radiusConfig, filter?)`, Shape3D `.fuse/.cut/.intersect(other)`.

```ts
export interface ProfileSpec {
  // A profile placed on the XY plane at height z (for loft).
  z: number;
  // Exactly one of points / radius.
  points?: [number, number][];
  radius?: number;
}

export function extrudeCircle(radius: number, depth: number): Solid;
export function circleFaceMesh(id: string, radius: number): BodyMesh;

/** Revolve a profile around the Z axis. The profile's 2D points are (radius,
 *  height) on the XZ plane; points should have radius >= 0. angleDeg defaults 360. */
export function revolveProfile(points: [number, number][], angleDeg: number): Solid;

/** Loft through profiles stacked along Z (each a polygon or a circle at its z). */
export function loftProfiles(profiles: ProfileSpec[]): Solid;

/** Hollow a solid to a wall `thickness`, removing the upward-facing (top) faces
 *  so the result is an open vessel. */
export function shellBody(solid: Solid, thickness: number): Solid;

/** Bevel all edges of a solid by `distance`. */
export function chamferAll(solid: Solid, distance: number): Solid;

/** Boolean of two solids. */
export function booleanOp(a: Solid, b: Solid, kind: "union" | "subtract" | "intersect"): Solid;
```

Tests (`packages/kernel/src/ops.test.ts`, `beforeAll` loads `init` from `./oc`):
- `extrudeCircle(5, 10)` → volume ≈ π·25·10 ≈ 785 (`toBeCloseTo(785, -1)`).
- `revolveProfile([[2,0],[5,0],[5,10],[2,10]], 360)` → a ring; volume ≈ π·(5²−2²)·10 ≈ 659 (`toBeCloseTo(659, -1)`).
- `loftProfiles([{radius:10,z:0},{radius:5,z:20}])` → a truncated cone; volume positive and less than the 10-cylinder (π·100·20).
- `shellBody(extrudeCircle(10,20), 2)` → volume less than the solid cylinder (hollowed).
- `chamferAll(extrudeProfile([[0,0],[20,0],[20,20],[0,20]],10), 2)` → volume less than 4000, greater than 3000.
- `booleanOp(a, b, "subtract")` of two overlapping boxes → volume less than `a` alone.
- `circleFaceMesh("f", 5)` → non-empty positions/indices.

Adjust any replicad call against `node_modules/.pnpm/replicad@*/.../replicad.d.ts` if a signature differs (e.g. the shell face-filter form `(f) => f.inDirection([0,0,1])`).

---

## Graph + API (inline)

### protocol (`packages/protocol/src/index.ts`)
Add region nodes `CircleNode {op:"circle", radius}`, `PolygonNode {op:"polygon", points:[number,number][]}`, and body nodes:
`RevolveNode {op:"revolve", region, angle, sources}`,
`LoftNode {op:"loft", regions:string[], heights:number[], sources}`,
`ShellNode {op:"shell", body, thickness, sources}`,
`ChamferNode {op:"chamfer", body, edges:EdgeSelector, distance, sources}`,
`BooleanNode {op:"boolean", kind:"union"|"subtract"|"intersect", a, b, sources}`.
Extend `Node` and `BodyNode` unions. `isBodyNode` returns true for revolve/loft/shell/chamfer/boolean.

### core (`packages/core/src/builder.ts`)
Add methods (each `add(node, consumes)`):
- `circle(radius): Handle` (region), `polygon(points): Handle` (region).
- `revolve(region, opts?: {angle?:number}): Handle` (consumes region).
- `loft(regions: Handle[], heights: number[]): Handle` (consumes all regions).
- `shell(body, thickness): Handle` (consumes body).
- `chamfer(body, edges: EdgeSelector, distance): Handle` (consumes body).
- `union(a,b)`, `subtract(a,b)`, `intersect(a,b): Handle` (consume both).
Regions (circle/polygon) are not "alive" (like rect/sketch).

### runtime (`packages/runtime/src/run.ts`)
- `evaluate`: skip circle/polygon (regions). Build solids for:
  - revolve → `revolveProfile(profilePoints(region), node.angle)` where `profilePoints` returns a region's points (polygon → its points; rect → 4 corners). circle profiles aren't valid revolve inputs (error).
  - loft → `loftProfiles(node.regions.map((rid,i) => regionProfileSpec(rid, node.heights[i])))` where a circle region → `{radius,z}`, polygon/rect → `{points,z}`.
  - shell → `shellBody(solids.get(node.body), node.thickness)`.
  - chamfer → `chamferAll(solids.get(node.body), node.distance)`.
  - boolean → `booleanOp(solids.get(node.a), solids.get(node.b), node.kind)`.
- `meshTarget`: circle region → `circleFaceMesh`; polygon region → `profileFaceMesh(points)`.
- Inject the new builder methods into the vm context.

### types (`packages/types/index.d.ts`)
Declare `circle`, `polygon`, `revolve`, `loft`, `shell`, `chamfer`, `union`, `subtract`, `intersect`.

---

## Example library (`examples/`)
Each a small, elegant model ending in `render(...)`:
- `cylinder.ts` — `extrude(circle(10), 30)`.
- `washer.ts` — `subtract(extrude(circle(10), 4), extrude(circle(5), 4))`.
- `bottle.ts` — `revolve(polygon([...profile...]))` (a neck+body profile).
- `funnel.ts` — `loft([circle(20), circle(6)], [0, 25])`.
- `cup.ts` — `shell(extrude(circle(15), 30), 2)` (open-top hollow vessel).
- `beveled-block.ts` — `chamfer(extrude(rect(30,30), 12), edges(...).all, 3)`.
- `bracket-bool.ts` — a block with two cylindrical holes subtracted, showing booleans + render stages.
Update `examples/README.md` listing them.

---

## Tests
- kernel: `ops.test.ts` (above).
- core: builder graph for each new node (one test asserting the node shape + alive tracking).
- runtime: a test per representative operator (revolve/loft/shell/chamfer/boolean) → stages with non-empty meshes.
- e2e: a fixture `examples`-style part (e.g. `cup.ts` or `funnel.ts`) renders with the expected stages.
- Typecheck every package + examples.

## Verification / PR
Full `pnpm test` + `pnpm --filter @cadcode/app test:e2e` green; all packages type-check; then PR to main.
