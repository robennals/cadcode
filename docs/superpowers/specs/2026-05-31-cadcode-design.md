# cadcode — A TypeScript, Constraint-Based CAD Environment

**Status:** Design / spec
**Date:** 2026-05-31

> **Revision (2026-05-31, during M0): viewer-only architecture.** The UI is no
> longer a browser code editor. You edit model files in **your own editor** and
> version-control them in git; the cadcode dev server renders them and the
> browser is a **live viewer**. This is the Storybook model: a dev server with an
> index of "model files" (like Storybook's story files), rendering the selected
> one on demand and hot-reloading on change. Concretely:
> - **Edit in your own editor.** No Monaco, no in-browser execution.
> - **Model files can `import` other files** (and npm libraries) — the server
>   bundles the entry file + its import graph with esbuild before running it.
> - **The server renders headlessly** (the Node `runtime` + kernel we built) and
>   **live-pushes meshes to the browser** over Vite's HMR socket. Rendering is
>   **lazy** — only the file you're viewing is ever built.
> - **The URL selects the file** (`?file=<path>`), and a sidebar lists every
>   model file in the project (click to view). The current file is shown in the
>   toolbar and the browser tab title.
> - **Auto-refresh:** saving a model file (or any file it imports) re-renders
>   automatically, no page reload.
>
> Sections 2.5, 2.7, 3 and 4 below are updated to match; the constraint/geometry
> design (2.1–2.4, 2.6) is unchanged.

## 1. Vision

cadcode is a programming environment for CAD, in the spirit of OpenSCAD but with two
defining differences:

1. **It is real TypeScript.** Models are ordinary TS programs, so you get general-purpose
   programming and the entire TS/JS library ecosystem to help build geometry.
2. **It is constraint-based for sketches.** You define 2D sketches the way you would in
   Fusion — with geometric and dimensional constraints — and then build 3D bodies from
   those sketches using operators (`extrude`, `fillet`, `shell`, booleans, …).

The user edits TS in a code editor on the left and sees a live-updating 3D model on the
right, with a browsable hierarchy of sketches, bodies, constraints, and operations.

## 2. Core design decisions

These decisions, made during brainstorming, define the shape of the system. They are the
load-bearing parts of this spec.

### 2.1 Geometry kernel: wrap OpenCascade via `replicad`

Real CAD operations (`fillet`, `shell`, `chamfer`, booleans on exact B-rep geometry) require
a boundary-representation kernel, which is decades of work to build. We use **OpenCascade**
compiled to WASM via **`replicad`** (which wraps `opencascade.js` and already provides
sketches, extrude, fillet, shell, chamfer, booleans, and meshing). Our kernel layer is a thin
adapter over replicad behind a small interface, so it is testable and, in principle,
swappable. OpenCascade/replicad run in **both the browser and Node**, which is what makes the
single-stack browser+CLI design below possible.

### 2.2 Constraints live only inside sketches

Constraint solving is scoped entirely to sketches. A sketch builds a small 2D constraint
system from its arguments, solves it, and returns concrete geometry. The solver never sees
anything larger than a sketch (plus its nested sub-sketches — see §2.4). Bodies are **not**
defined via constraints.

### 2.3 Bodies are declarative composition; TypeScript replaces cross-model constraints

Operators (`extrude`, `fillet`, …) take solved geometry and produce new geometry — a feature
tree, like Fusion's timeline, expressed as ordinary TS function calls. There is no global
constraint graph across bodies.

The key insight that makes this tractable: **because the host language is TypeScript,
cross-model "parametric" relationships are just variables and function arguments.** An example
like "the body's height equals the sketch's left edge" is simply
`extrude(face, leftLength)` where `leftLength` is a plain number or any value computed by
arbitrary TS. We get parametric, relational modeling for free from the language, and reserve
the actual constraint solver for the one genuinely-hard, under-determined problem: 2D sketch
geometry.

### 2.4 `dimension` is a first-class symbolic value; sketches compose

A `dimension` is either **pinned** (a concrete number) or **free** (a solver variable).
`dimension()` mints a free one. A sketch function takes dimensions as arguments:

- Pass a number → the dimension is pinned.
- Pass a *free* dimension → it becomes a variable resolved by the **enclosing** sketch's
  solver.

Sketches therefore **compose hierarchically**: a parent sketch can mint free dimensions and
thread them into sub-sketches, and at solve time the parent's constraints plus all
sub-sketch constraints merge into **one** constraint system and solve together. The solver's
scope is "a top-level sketch and its whole sub-sketch tree" — still bounded, still 2D, still
a single solve. Bodies remain outside the solver.

**Determination rule:** constraints + supplied args should fully determine a sketch
(0 remaining degrees of freedom). Under- or over-constrained sketches are surfaced as
diagnostics in the UI rather than silently guessed.

**Solve-trigger rule:** a sketch is solved at the moment its concrete geometry is first
consumed by something that is **not** a sketch (an operator such as `extrude`, or the
viewport). Nested sketches defer to their enclosing sketch's solve.

A fully **declarative escape hatch** exists for sketches that don't want the solver:
`rect`, `polyline`, `circle` with explicit coordinates produce geometry directly, no solver.

### 2.5 Real TypeScript, bundled and run on the server (revised)

User code is genuine TypeScript. The **dev server** bundles the selected model file *and its
imports* (and any npm libraries) with esbuild, then executes the bundle with our API injected
as globals. The API functions record the objects the user creates; the resulting object graph
**is** the model hierarchy. Execution is **whole-program** (no incremental re-evaluation — far
more complex and premature). Heavy OpenCascade operations will be cached by input-hash (a
later milestone) so re-runs stay cheap.

Execution runs **headlessly in Node** (inside `cadcode dev`), reusing the exact `runtime` +
`kernel` path that the tests cover. The browser receives only the resulting meshes + hierarchy
and renders them — it never compiles or executes models. (A browser-side execution path
exists in `kernel`/`runtime` for a possible future hosted playground, but is not used by the
local viewer.) Re-execution is triggered by **file changes on disk**: the server watches the
entry file and every file in its import graph and re-renders on save.

### 2.6 Selection is a fresh query in terms of sketches, not persistent IDs

OpenCascade rebuilds the B-rep from scratch each run; its internal sub-shape handles are not
stable across rebuilds. Rather than maintain persistent IDs (the classic "topological naming
problem"), cadcode selects geometry by **provenance query**:

- Every operator passes through its `sources` (the sketches/sub-sketches it consumed) as
  fields on the resulting body, **plus the placement transform(s) it applied**, so a sketch
  entity (e.g. `square.left`) can be projected into the result's 3D space as a stable
  **anchor**.
- To select geometry, you write — or compose from our standard library — a **predicate over
  the body's sub-shapes**, expressed in terms of those sketch anchors plus geometric tests:
  `edges coincident with square.left`, `faces on the top plane`, `edges parallel to
  square.left`. Because it is real TS, arbitrary predicates are possible.
- Each run we recompute geometry, enumerate sub-shapes, and re-evaluate the predicate
  **geometrically**. No persistent kernel IDs; no correspondence map threaded through
  operations.

This needs only a **geometric-query toolkit** in the kernel (enumerate sub-shapes; test
coincidence / collinearity / tangency / plane-membership with tolerance) — not OCCT history
plumbing — and it **fails honestly**: when topology changes, a predicate returns an empty or
wrong-sized set, surfaced as a diagnostic, instead of silently selecting the wrong edge.

**Residual case:** geometry with no sketch origin (the new tangent edges born from a fillet,
a boolean's cut edges) cannot be anchored to a sketch. Those are selected via the
**operation's own handle** (e.g. `fillet(...)` returns a handle whose new faces/edges can be
queried) or via pure geometric predicates. This case also fails loudly rather than wrongly.

### 2.7 Distribution: a CLI with `dev` and `export`; no Electron (revised)

cadcode ships as a single npm package exposing a CLI. It is a **viewer/dev-server**, not an
editor — the Storybook model:

- **`cadcode dev [dir|file]`** — run inside your repo (like `vite`/`storybook`). With no
  argument it serves the current directory (our repo's `pnpm dev` prefers an `./examples`
  folder); given a directory it serves that project; given a file it opens that file. It:
  - serves the viewer app and an index of the project's `.ts` model files (a sidebar; the URL
    `?file=<path>` selects one);
  - bundles the selected file + its imports, runs it headlessly through `runtime` + `kernel`,
    and **live-pushes** the meshes + hierarchy to the browser over Vite's HMR socket;
  - **watches** the file and its imports and re-renders on save (auto-refresh).
  Rendering is **lazy** — only the file currently being viewed is built. **Files are normal
  files in your git repo**; cadcode never owns storage, and you edit them in your own editor.
- **`cadcode export model.ts -o model.stl`** (also `.step`, `.3mf`) — runs the *same*
  `runtime` + `kernel` headlessly in Node to produce exportable files for 3D printing, other
  CAD tools, or CI. (Stub until M4.)

Not Electron: it bundles Chromium, complicates distribution, and buys nothing here — users are
TS developers comfortable with `npx`, and a desktop/hosted app would fight against "files live
in your own git repo." An Electron or hosted wrapper can be added later over the identical
stack.

## 3. Architecture

A pnpm-workspace monorepo of six packages, layered so each has one responsibility and a
clean interface.

| Package | Responsibility | Runs in |
|---|---|---|
| `@cadcode/kernel` | Geometry ops + meshing + the geometric-query toolkit, wrapping replicad/OCCT behind a small interface | Worker / Node |
| `@cadcode/core` | The user-facing API (`sketch`, `lines`, `coincident`, `dimension`, `extrude`, `fillet`, selectors…) plus the object-graph tracer that records what the user builds. The 2D solver lives here. | Worker / Node |
| `@cadcode/runtime` | Executes (pre-bundled) user code with `core`'s API injected, collects the model graph, asks `kernel` to tessellate, emits meshes + hierarchy. `runCode` runs already-bundled code; `run` is a single-file convenience. | Node (and Worker) |
| `@cadcode/app` | Vite + React **viewer**: file sidebar, three.js viewport with nav controls, hierarchy tree; receives renders over the HMR socket. No editor, no execution. | Browser |
| `@cadcode/cli` | `cadcode dev` — serves the app, lists/reads files, bundles (esbuild) + runs the selected file headlessly, watches its imports, and pushes renders. `cadcode export` (M4). | Node |
| `@cadcode/protocol` | Shared types + the (de)serialization for sending render results over the socket. | Shared |

**Data flow (one cycle, revised):** browser selects a file (URL/sidebar) → sends `select`
over the HMR socket → server bundles the entry + imports (esbuild) → executes through
`runtime` + `kernel` in Node → serializes meshes + hierarchy → `server.ws.send` → browser
deserializes to typed arrays → three.js renders, sidebar/tree update. A file-watcher on the
import graph repeats this on every save.

The CLI is the primary frontend over the `runtime → core → kernel` stack (in Node). A
browser-execution path (esbuild-wasm + the `oc-browser` kernel loader) remains in the
packages for a possible future hosted playground, but the local viewer does not use it.

**Tooling choices:**
- **Edit in your own editor.** We ship ambient API declarations as the
  **`@cadcode/types`** package; add it to your tsconfig (`"types": ["@cadcode/types"]`)
  and any TS-aware editor gives IntelliSense on the global API — no `.d.ts` in your
  code folder.
- **3D: plain three.js** in a thin wrapper, with OrbitControls + on-screen widgets for
  rotate/pan/zoom/fit and a keyboard fallback.
- **Transport: Vite's HMR socket** for the live render channel (no extra websocket server).

## 4. The API / language model

Five core concepts, each a traced node in the hierarchy:

1. **`dimension`** — symbolic length/angle; pinned (a number) or free (`dimension()`). See §2.4.
2. **Sketch entities** — `lines(n)`, `point(x,y)`, `arc`, `circle`. `lines(4)` returns
   handles each exposing `.start` / `.end` points. Declarative helpers: `polyline`, `rect`,
   `circle`.
3. **Constraints** — geometric (`coincident`, `parallel`, `perpendicular`, `equal`,
   `horizontal`, `vertical`) and dimensional (`distance`, `angle`, `radius`).
4. **`sketch({...})`** — bundles entities into a named, browsable 2D sketch on a plane, and
   exposes named handles + fillable regions (`fill(...)` → a face you can extrude).
5. **Operators** — `extrude`, `revolve`, `fillet`, `chamfer`, `shell`, booleans (`union`,
   `subtract`, `intersect`). Each takes solved geometry + selectors, passes through its
   `sources` and placement transforms (§2.6), and returns a new body.

**What renders:** every body that is *alive* — created and not consumed as input to another
operator (so the final `fillet` shows, not the raw cube it ate). `show(x)` / `hide(x)`
override. Selecting a sketch/body in the tree highlights it in the viewport and vice-versa.

**The hierarchy is the traced object graph** — every sketch, entity, constraint, body, and
operation is a node with parent/child links. There is no separate model format; the objects
the user creates *are* the model. `extend(obj, {meta})` attaches metadata.

### Worked example — with the solver (M1+)

```ts
function square(side = dimension()) {
  const [left, right, top, bottom] = lines(4)
  coincident([left.end, top.start], [top.end, right.start],
             [right.end, bottom.start], [bottom.end, left.start])
  parallel([left, right], [top, bottom])
  perpendicular(left, top)
  equal([top, bottom, left, right])
  distance(left.start, left.end, side)        // 'side' pins the last DOF
  return sketch({ left, right, top, bottom, region: fill(left, top, right, bottom) })
}

const sq = square(20)
export const cube = extrude(sq.region, 20)
export const rounded = fillet(cube, edges(cube).coincidentWith(sq.left), 3)
```

### Worked example — declarative escape hatch (M0)

```ts
const face = rect(20, 20)                       // explicit geometry, no constraints
export const cube = extrude(face, 20)
export const rounded = fillet(cube, edges(cube).all, 3)
```

## 5. Execution, reactivity, rendering (revised)

- **Reactivity:** the server watches the selected file and its import graph and re-renders on
  save (lazy — only the viewed file). Cache heavy ops by input-hash (M4).
- **Rendering:** kernel tessellates each alive body to a mesh; the server serializes meshes +
  hierarchy and pushes them over the HMR socket; the browser rebuilds typed arrays and
  three.js renders them. The sidebar lists files; the tree panel renders the hierarchy.
- **Error handling:**
  - Bundle/compile errors (missing import, syntax) → shown in the viewer's error panel.
  - Runtime exceptions during model execution → error panel, last good model stays on screen.
  - Solver failures (over/under-constrained, non-convergence) → diagnostics (M1+).
  - Selection that resolves to an empty/unexpected set → diagnostic on the operation.

## 6. Milestone ladder

Each milestone is independently playable and builds on the previous one.

### M0 — End-to-end spine (no solver) — *delivered, viewer-only*
*Goal: edit a model file in your own editor, see it render live; files can import files.*
- Monorepo scaffold (six packages).
- `kernel`: wrap replicad for face-from-region, `extrude`, `fillet`, tessellate-to-mesh; the
  beginnings of the geometric-query toolkit (`edges(body).all`).
- `core`: declarative API (`rect`, operators, object-graph tracer).
- `runtime`: `runCode` executes bundled user code, collects the graph, tessellates.
- `app`: three.js viewport with nav controls + hierarchy tree + file sidebar; receives
  renders over the HMR socket (no editor, no in-browser execution).
- `cli`: `cadcode dev [dir|file]` — file index/URL selection, esbuild bundle (imports!),
  headless render, file-watch live reload; `export` stub.
- *Demo:* `pnpm dev` renders `examples/`; edit `examples/bracket.ts` (which imports
  `lib/shapes.ts`) in your editor and watch the render refresh.

### M1 — 2D constraint solver
*Goal: the `square()`-via-constraints example.*
- Integrate **planegcs** (FreeCAD's solver, WASM) into `core`.
- Geometric + dimensional constraints; `dimension()` free vars; args pin DOF; solve fires
  when a sketch is consumed; under/over-constraint diagnostics.

### M2 — Hierarchy browser + selection/picking
*Goal: click an edge, fillet it.*
- Full tree panel with two-way viewport highlight.
- Pick faces/edges in the viewport; the provenance-query selectors of §2.6
  (`edges(body).coincidentWith(sketchEdge)`, `.onPlane(...)`, `.parallelTo(...)`).
- DOF/constraint status badges on sketches.

### M3 — Parametric sub-sketches + editable dimensions
*Goal: reusable parametric components.*
- Nested sketches threading free dimensions into the parent solve.
- Editable dimension widgets that round-trip back into the source literal; a parameters panel.

### M4 — Export + operator breadth + performance
*Goal: print/share real parts.*
- `cadcode export` → STL/STEP/3MF.
- `revolve`, `chamfer`, `shell`, linear/circular patterns, booleans surfaced.
- Op-caching by input-hash for snappy re-runs.

## 7. Testing strategy

Test-driven throughout.
- `kernel`: headless Node geometry assertions — volume, bounding box, face/edge counts after
  each op; geometric-query predicates against known shapes.
- `core`: snapshot the traced graph for sample scripts; solver tests assert solved
  coordinates for known sketches.
- `runtime`: execute sample scripts → assert produced graph + mesh.
- `app` / `cli`: a few Playwright smoke tests (load file → mesh appears; edit → updates).

## 8. Risks

1. **replicad/OCCT coverage** — fillet/shell on awkward edge sets can fail inside OCCT; we
   surface failures gracefully rather than crash, keeping the last good model.
2. **Selection of non-sketch-derived geometry** — fillet/boolean offspring have no sketch
   anchor; they rely on operation handles or pure geometric predicates (§2.6). Common
   generative cases (off named sketches) are robust; this narrowed case is the residual work,
   and it fails loudly, not wrongly.
3. **Topology count/connectivity changes** — when a parameter change merges/splits/deletes
   sub-shapes, a selection query genuinely has no correct answer. We degrade to a clear
   "selection lost / changed" diagnostic rather than silently operating on the wrong edge.
   No CAD system solves this case cleanly; honest failure is the goal.
4. **planegcs integration** — WASM size and JS binding ergonomics are unknown until M1; M0
   deliberately does not depend on it.
5. **Mesh transfer performance** — fine at M0 scale; transferable typed-arrays plus
   op-caching (M4) handle growth.

## 9. Open questions (to resolve during implementation)

- Exact planegcs binding surface and how cleanly free/pinned dimensions map onto it (M1).
- The precise standard-selector vocabulary and predicate API ergonomics (M2).
- Round-trip codegen for editable dimensions — how to locate and rewrite the source literal
  safely (M3).
- Op-cache key derivation (what exactly hashes to a stable feature identity) (M4).
