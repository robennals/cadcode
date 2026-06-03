# cadcode — Geometry References (labelling & selecting faces/edges/points)

**Status:** Design / spec
**Date:** 2026-06-01

## 1. Problem

To do real CAD you must be able to *refer to* sub-shapes of a body — "fillet
these edges", "shell open this face", "sketch on that face". Today cadcode
selects geometry with crude, geometric heuristics: `edges(body).all` (every
edge) and `faces(body).top/bottom` resolved by bounding-box extremes. These work
for the example gallery but **do not generalize** — a stepped, booleaned, or
rounded body has horizontal faces that aren't caps, a revolved body may have no
flat cap, and there is no way to say "the edge between *these two* walls" or "the
face that came from *this* sketch line".

The classic hard version of this is the **topological-naming problem**: the
geometry kernel rebuilds the B-rep from scratch each run, so the internal IDs of
faces/edges are not stable; a reference written against one rebuild must still
mean the right thing after a parameter change.

This spec defines the abstraction cadcode uses to **label and select**
faces/edges/points, designed to generalize across every operator and to compose
cleanly through long construction chains while staying easy to reason about.

## 2. Core design

### 2.1 A sub-shape is a *reference*, resolved fresh — not a stored ID or tag

A face/edge/point is represented by a **reference**: a value that (a) carries how
it relates to the things that created it (its provenance/anchor), and (b) knows
how to **resolve** itself to the actual kernel sub-shapes at evaluate time. There
are **no persistent kernel IDs and no tags glued onto sub-shapes**; every
reference is re-resolved against freshly-built geometry on every run. This is the
§2.6 "provenance query" philosophy made concrete: identity lives in the
*description of how to find it*, not in a stored handle.

### 2.2 References resolve to *sets*, and fail honestly

Resolving a reference yields a **set** of kernel sub-shapes — usually one, but
possibly zero (the anchor geometry no longer exists) or many (a face split into
several). This is what makes the model robust to topology changes: a split face
returns both pieces; a deleted face returns the empty set; nothing is silently
mis-identified. When a selection a downstream operator needs comes back empty or
unexpectedly sized, that is surfaced as a diagnostic rather than producing wrong
geometry.

### 2.3 Faces: a planar face *is a sketch*; a curved face is *derived-from* a source

The reference for a face has more than one concrete kind, behind one interface:

- **Planar face → a `Sketch`.** A flat face (an extrude cap, a prism wall) is
  reified as a *sketch*: real 3D-placed geometry with named entities, so you can
  drill into it (`box.top.front`, `box.top.front.start`) and even sketch on it.
  This is the user's key idea — exported faces are *the same kind of thing* as
  the inputs that made them.
- **Curved face → a derived reference.** A cylinder wall, a revolve/loft surface
  is not a flat sketch; it is referenced by its **relationship to its source**
  ("the face swept from this circle's edge"). You can still call `edges(face)` on
  it (its boundary curves) and pass it to `shell`/`fillet`; you just can't treat
  it as a 2D sketch.
- **Open interface.** "Reference" is an interface with a single contract —
  *resolve to kernel sub-shapes*. Sketch-based references are the implementation
  we build first; other kinds (a direct NURBS / T-spline face handle, for
  operators that work in those models) can implement the same contract later
  without changing anything else. The model is **not** "everything is a sketch."

### 2.4 Operators export named references and keep provenance chains

Every operator does two things with names:

- **Exports named references** to the geometry it produces — *not* a fixed
  `top`/`bottom` vocabulary, but whatever is meaningful to that operator (an
  `extrude` exposes `top`, `bottom`, and a swept side face per source edge; a
  `revolve` might expose the start/end caps; a future `thread` op the thread
  face).
- **Keeps references to its inputs.** A `fillet(box, …)` result holds a reference
  to the `box` it filleted, so the box's exports (`box.top`) remain reachable
  *through* the result. Names therefore propagate by **navigating the provenance
  chain** — modifying operators carry names forward the same way creation
  operators introduce them, with no special history-tracking machinery. New
  geometry an operator creates (the rounded fillet face, a boolean's cut face)
  gets its *own* named exports.

### 2.5 `body({…})` and `sketch({…})`: one curation primitive per level

Navigating a deep provenance chain by hand is tedious and leaks internals. The
fix is symmetric at both levels:

- `sketch({ top, bottom, left, right })` already bundles 2D entities and exposes
  named parts.
- **`body(solid, { neck, base, handle })`** does the same for a 3D body: a
  function author curates the semantically meaningful parts to expose, so a
  caller writes `myBottle.neck` without understanding how the bottle was built.

`body({…})` is the encapsulation/abstraction boundary: it lets library authors
publish a stable named interface above whatever (possibly fragile) internal
construction produced the shape.

### 2.6 Selection is a library of plain functions over references

There is **no selection DSL**. Selection is ordinary, composable TypeScript
functions that take references and return reference sets:

- `edges(face)` — the edges of a face/sketch (works on any sketch).
- `points(sketch)` — its points.
- `connectingEdges(a, b)` — the edges shared between two faces/sketches.
- …and any function a user writes that takes fully-defined geometry and returns a
  set of sub-shapes.

Operators (`fillet`, `chamfer`, `shell`, …) accept reference sets. Because these
are just functions, users extend the selection vocabulary themselves — true to
"it's just TypeScript".

### 2.7 Resolution mechanism (the implementation crux)

When the kernel builds a body it produces OCCT faces/edges with unstable IDs. To
resolve a reference, the kernel matches it to the actual sub-shapes by
**geometric coincidence with the reference's anchor**:

- A planar-face-as-sketch resolves to the OCCT face lying in the sketch's plane
  whose boundary coincides with the sketch's (placed) outline.
- A swept-from-edge face resolves to the OCCT face containing the swept image of
  that source edge.
- An edge "from a point" resolves to the edge that is the swept image of the
  point; `connectingEdges(a,b)` to the edges shared by the two faces' resolved
  sets.

This is robust for creation operators and shallow chains. Deep boolean/fillet
chains can split/merge/delete faces; there the set semantics (§2.2) and honest
diagnostics keep it correct-or-loud, and `body({…})` lets authors pin a stable
interface above the churn. Per-operator OCCT *history* APIs (Generated/Modified/
IsDeleted) can later strengthen resolution where geometric matching is ambiguous;
they are an optimization, not a prerequisite.

## 3. How it fits the codebase

- **`@cadcode/protocol`** — the reference data model. A `Ref` (or per-kind:
  `SketchFaceRef`, `SweptFaceRef`, `EdgeRef`, `PointRef`) describing an anchor and
  the body/operator it belongs to. This generalizes today's `EdgeSelector` /
  `FaceSelector`, which become specific resolved-set producers.
- **`@cadcode/core`** — operators record their named exports and input refs on
  their graph nodes; `sketch({…})`/`body({…})` capture curated names; the
  selection functions (`edges`, `connectingEdges`, …) are pure and build
  reference values (no geometry).
- **`@cadcode/kernel`** — the resolver: given a reference + the built solid,
  return the matching OCCT sub-shape set (faces/edges), plus reification of a
  planar OCCT face into a `Sketch` (placed outline + inherited entity names).
- **`@cadcode/runtime`** — in the evaluate phase, resolve references to sub-shape
  sets and hand them to the kernel operators (fillet/chamfer/shell take resolved
  sets instead of the current `kind` enums).
- **`@cadcode/types`** — declare the selection functions and the navigable shapes
  (`face.<entity>`, `body.<name>`).

## 4. Worked examples

Rounded cube, selecting all edges via composed functions:
```ts
const c = extrude(square(20), 10);
const rounded = fillet(c, [edges(c.top), edges(c.bottom), connectingEdges(c.top, c.bottom)], 2);
```

Shell a cup open at the top, selecting the cap face directly:
```ts
const solid = extrude(circle(18), 35);
const cup = shell(solid, 2.5, solid.top);   // solid.top is a face reference
```

A curved wall, selected by its source relationship:
```ts
const cyl = extrude(circle(10), 30);
fillet(cyl, edges(cyl.top), 2);              // round the top rim (a circular edge)
// cyl's side wall is the swept-from-circle face; edges(sideWall) gives its rims.
```

A library author publishing a clean interface:
```ts
function bottle(height: number) {
  const solid = revolve(/* … profile … */);
  const hollow = shell(solid, 2, solid.top);
  return body(hollow, { neck: solid.top, base: solid.bottom });
}
const b = bottle(90);
chamfer(b, edges(b.neck), 0.5);              // caller uses neck without internals
```

## 5. Scope

**Slice 1 delivered:** face references (`planeZ`/`named`), `edges`/`connectingEdges`,
and query-driven `fillet`/`chamfer`/`shell` — so you can round only the top rim
(`fillet(b, edges(b.top), r)`), select the verticals between two caps
(`connectingEdges(b.top, b.bottom)`), and open a chosen face in `shell`.
**Remaining:** face-as-`Sketch` reification (`box.top.front`), swept-from-sketch
curved faces, the `body({…})` curation primitive, and provenance chains that carry
names forward through `fillet`/boolean results.

**First build (this effort):**
- The reference data model + resolver for **sketch-based references**:
  planar-face-as-`Sketch` and swept-from-sketch faces/edges/points.
- Reification of planar OCCT faces into named `Sketch`es (inheriting source
  entity names where they correspond).
- Core selection functions: `edges`, `points`, `connectingEdges`.
- Named exports on the existing operators (`extrude`, `revolve`, `loft`,
  `fillet`, `chamfer`, `shell`, booleans, `move`) — at minimum `top`/`bottom`
  caps and the swept side faces, plus input-refs for the chain.
- `body({…})` curation primitive (alongside existing `sketch({…})`).
- Migrate `fillet`/`chamfer`/`shell` to consume resolved reference sets; keep the
  current `faces(body).top` etc. working as convenience selectors over the new
  model.

**Deferred (not precluded):**
- Direct NURBS / T-spline references and operators.
- OCCT history-backed resolution for ambiguous boolean/fillet cases.
- Richer per-operator named exports beyond caps/sides.
- Interactive viewport picking that produces references (M2 picking).

## 6. Risks

1. **Resolution robustness on deep chains** — geometric matching can be ambiguous
   after booleans/fillets that split or merge faces. Mitigations: set semantics +
   honest diagnostics (never silently wrong), `body({…})` to pin interfaces, and
   OCCT history as a later strengthening.
2. **Face reification correctness** — mapping an OCCT planar face back to a named
   `Sketch` (correct outline, correct inherited names) is fiddly; tolerance and
   orientation must be handled. Tested with known shapes (a named square →
   extrude → assert `box.top` has the four named edges in the right places).
3. **Performance** — resolving many references per render adds geometric queries;
   fine at current scale, cache by body if needed.

## 7. Testing

- **Resolution unit tests (kernel):** build known bodies; assert references
  resolve to the expected face/edge counts and positions (e.g. `edges(box.top)`
  → 4 edges in the z=h plane; `connectingEdges(box.top, box.bottom)` → 4 vertical
  edges; `cyl.top` → 1 circular edge).
- **Reification tests:** a named square extruded; assert `box.top.front` resolves
  to the front edge at z=h.
- **Set-semantics tests:** a reference whose face was removed resolves to empty;
  a split face resolves to multiple.
- **Operator integration (runtime):** fillet/shell driven by composed selection
  functions produce the expected geometry (volume/edge-count assertions).
- **`body({…})` test:** a curated body exposes the named parts and hides the rest.
- **e2e:** an example using the new selection (e.g. round only the top rim of a
  cylinder) renders correctly.

## 8. Open questions (resolve during implementation)

- Exact surface of the `Ref` types vs. reusing/extending `EdgeSelector`/`FaceSelector`.
- How `face.<entity>` navigation is typed in `@cadcode/types` (dynamic names from
  `sketch({…})` keys).
- Whether `edges(face)` returns ordered edges (useful for `between`-style helpers).
- The precise geometric-coincidence tolerances for reification/resolution.
