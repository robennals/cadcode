# @cadcode/solver

The 2D sketch constraint solver. Wraps
[`@salusoft89/planegcs`](https://www.npmjs.com/package/@salusoft89/planegcs) — a
WASM port of FreeCAD's GCS solver — behind a small interface, so cadcode gets
FreeCAD's battle-tested constraint solving (the same lineage that supports arcs,
ellipses, and B-splines) instead of reinventing it.

The solver runs only in the **build/dev-server stage** (Node), never in the
browser or the user-code sandbox: the `core` builder records a sketch as pure
data, and the runtime's evaluate phase calls `solveSketch` to turn its
constraints into solved coordinates. The WASM loads once at startup, like
OpenCascade.

## API

- `init(): Promise<void>` — load the planegcs WASM module (idempotent/cached).
- `solveSketch(sketch: SketchNode): SketchSolution` — translate the sketch's
  points/lines/constraints into planegcs primitives, solve, and read back the
  solved point coordinates. Returns `{ status: "ok" | "failed", points, message? }`.
  A solver result of `Success` or `Converged` counts as solved (redundant but
  consistent constraints — which FreeCAD only warns about — are accepted).

## Files

- `src/planegcs.ts` — `init` + `solveSketch`; maps `ConstraintDef`s to planegcs
  primitive types (line ids are prefixed `L` to avoid colliding with point ids).
- `src/planegcs.test.ts` — solves a constrained square to a 20×20 square.
- `src/index.ts` — re-exports.

## Scope

M1 first slice supports: `coincident`, `parallel`, `perpendicular`, `equalLength`,
`horizontal`, `vertical`, and numeric `distance`, over points and lines. Free
dimensions, arcs/circles/B-splines, and richer diagnostics are later increments.
