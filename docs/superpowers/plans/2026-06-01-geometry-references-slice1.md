# Geometry References — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reference faces of a body and select their edges (and the edges connecting two faces), resolved geometrically fresh each run, and use those selections in `fillet`/`chamfer`/`shell` — so you can round *just the top rim* or *just the vertical edges* of a body, not only "all edges".

**Architecture:** A face reference is a value `{ body, locator }` where the locator describes how to find the face (a Z-plane, or a named top/bottom). Selection functions (`edges`, `connectingEdges`) turn references into edge *queries*. In the evaluate phase the kernel resolves a query to actual OCCT sub-shapes (by geometric coincidence — bounding boxes / `inPlane`) and applies the operator to exactly those via replicad's `inList` finder. No persistent IDs or tags; everything re-resolves each run.

**Tech Stack:** TypeScript, Vitest, replicad/OpenCascade, existing cadcode packages.

**Scope (this slice):** `extrude` exports `.top`/`.bottom` face refs; `edges(faceRef)`, `connectingEdges(a, b)`, `edges(body)` (all); `fillet`/`chamfer`/`shell` consume edge/face queries; the kernel resolver. **Deferred to later slices (noted, not built):** reifying a planar face into a navigable `Sketch` (`box.top.front`), swept-from-sketch curved-face refs, `body({…})`, and propagating refs through `fillet`/`boolean` results.

---

## Data model (shared contract)

Replaces today's `EdgeSelector`/`FaceSelector` in `@cadcode/protocol`:

```ts
/** How to find a face of a body. planeZ = the flat face in the XY plane at z;
 *  named = resolved geometrically (top = cap at max Z, bottom = at min Z). */
export type FaceLocator =
  | { kind: "planeZ"; z: number }
  | { kind: "named"; name: "top" | "bottom" };

/** A reference to a face of a body. */
export interface FaceRef {
  body: string; // body node id
  locator: FaceLocator;
}

/** How to find a set of edges of a body. */
export type EdgeQuery =
  | { kind: "all"; body: string }
  | { kind: "ofFace"; body: string; face: FaceLocator } // edges lying on a face
  | { kind: "connecting"; body: string; a: FaceLocator; b: FaceLocator }; // edges spanning two faces
```

Kernel-level specs (no body ids — `@cadcode/kernel`), what the resolver consumes:

```ts
export type FaceSpec = { kind: "planeZ"; z: number } | { kind: "named"; name: "top" | "bottom" };
export type EdgeSpec =
  | { kind: "all" }
  | { kind: "ofFace"; face: FaceSpec }
  | { kind: "connecting"; a: FaceSpec; b: FaceSpec };
```

---

## Task 1: protocol — reference & query types

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/protocol/src/index.test.ts`:
```ts
import type { FaceRef, EdgeQuery } from "./index";

describe("reference types", () => {
  it("models a face ref and edge queries", () => {
    const top: FaceRef = { body: "extrude_0", locator: { kind: "planeZ", z: 10 } };
    const ofFace: EdgeQuery = { kind: "ofFace", body: "extrude_0", face: top.locator };
    const conn: EdgeQuery = {
      kind: "connecting",
      body: "extrude_0",
      a: { kind: "named", name: "top" },
      b: { kind: "named", name: "bottom" },
    };
    expect(top.locator.kind).toBe("planeZ");
    expect(ofFace.kind).toBe("ofFace");
    expect(conn.kind).toBe("connecting");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/protocol`
Expected: FAIL — `FaceRef`/`EdgeQuery` not exported.

- [ ] **Step 3: Replace the old selector types**

In `packages/protocol/src/index.ts`, remove `EdgeSelector`, `FaceSelector`, and `FaceKind`, and add the `FaceLocator`, `FaceRef`, `EdgeQuery` definitions (exact code in "Data model" above). Update the body nodes that referenced the old types:
```ts
export interface FilletNode {
  id: string;
  op: "fillet";
  body: string;
  edges: EdgeQuery[];   // was: EdgeSelector
  radius: number;
  sources: string[];
}
export interface ChamferNode {
  id: string;
  op: "chamfer";
  body: string;
  edges: EdgeQuery[];   // was: EdgeSelector
  distance: number;
  sources: string[];
}
export interface ShellNode {
  id: string;
  op: "shell";
  body: string;
  thickness: number;
  open: FaceLocator[];  // was: FaceKind[]
  sources: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/protocol`
Expected: PASS. (Other packages won't compile yet — that's expected; later tasks fix them.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(protocol): face references and edge queries"
```

---

## Task 2: kernel — resolver + query-driven fillet/chamfer/shell

> The geometry core. Resolve an `EdgeSpec`/`FaceSpec` to actual OCCT sub-shapes by bounding-box / plane coincidence, then apply the operator to exactly those via `inList`.

**Files:**
- Create: `packages/kernel/src/resolve.ts`, `packages/kernel/src/resolve.test.ts`
- Modify: `packages/kernel/src/index.ts`

- [ ] **Step 1: Confirm replicad accessors**

Run: `node -e "import('replicad').then(r=>console.log(Object.keys(r).filter(k=>/Finder/.test(k))))"`
Expected: includes `EdgeFinder`, `FaceFinder`. Also verify on a solid (in a scratch test) that `solid.edges` is `Edge[]`, `solid.faces` is `Face[]`, each sub-shape has `.boundingBox.bounds` (`[[minx,miny,minz],[maxx,maxy,maxz]]`), and `new EdgeFinder().inList(edgeArray)` / `new FaceFinder().inPlane("XY", z)` work. Adjust the code below if a name differs.

- [ ] **Step 2: Write the failing test**

`packages/kernel/src/resolve.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { init } from "./oc";
import { extrudeRect, volume } from "./kernel";
import { resolveEdges, resolveFaces, filletEdges, shellFaces } from "./resolve";

describe("resolve", () => {
  beforeAll(async () => { await init(); });

  it("resolves a cube's top edges, vertical edges, and all edges", () => {
    const cube = extrudeRect(20, 20, 20); // 0..20 in z
    expect(resolveEdges(cube, { kind: "all" }).length).toBe(12);
    expect(resolveEdges(cube, { kind: "ofFace", face: { kind: "planeZ", z: 20 } }).length).toBe(4);
    expect(resolveEdges(cube, { kind: "ofFace", face: { kind: "named", name: "bottom" } }).length).toBe(4);
    expect(
      resolveEdges(cube, {
        kind: "connecting",
        a: { kind: "named", name: "top" },
        b: { kind: "named", name: "bottom" },
      }).length,
    ).toBe(4); // the 4 verticals
  });

  it("resolves the top face", () => {
    const cube = extrudeRect(20, 20, 20);
    expect(resolveFaces(cube, { kind: "named", name: "top" }).length).toBe(1);
    expect(resolveFaces(cube, { kind: "planeZ", z: 0 }).length).toBe(1);
  });

  it("fillets only the top edges (less material removed than all edges)", () => {
    const all = volume(filletEdges(extrudeRect(20, 20, 20), [{ kind: "all" }], 3));
    const top = volume(
      filletEdges(extrudeRect(20, 20, 20), [{ kind: "ofFace", face: { kind: "planeZ", z: 20 } }], 3),
    );
    expect(top).toBeGreaterThan(all); // rounding only 4 edges keeps more volume
    expect(top).toBeLessThan(8000);
  });

  it("shells open the top face only (closed bottom ~ a cup)", () => {
    const v = volume(shellFaces(extrudeRect(20, 20, 20), [{ kind: "named", name: "top" }], 2));
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(8000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/kernel/src/resolve.test.ts`
Expected: FAIL — `./resolve` not found.

- [ ] **Step 4: Implement `resolve.ts`**

`packages/kernel/src/resolve.ts`:
```ts
import { EdgeFinder, FaceFinder } from "replicad";
import type { Solid } from "./kernel";

export type FaceSpec = { kind: "planeZ"; z: number } | { kind: "named"; name: "top" | "bottom" };
export type EdgeSpec =
  | { kind: "all" }
  | { kind: "ofFace"; face: FaceSpec }
  | { kind: "connecting"; a: FaceSpec; b: FaceSpec };

const TOL = 1e-6;
const zMin = (s: any) => s.boundingBox.bounds[0][2];
const zMax = (s: any) => s.boundingBox.bounds[1][2];

/** The Z of a face spec, resolving named top/bottom against the solid's extent. */
function planeZ(solid: Solid, f: FaceSpec): number {
  if (f.kind === "planeZ") return f.z;
  const [min, max] = (solid as any).boundingBox.bounds;
  return f.name === "top" ? max[2] : min[2];
}

export function resolveFaces(solid: Solid, f: FaceSpec): any[] {
  return new FaceFinder().inPlane("XY", planeZ(solid, f)).find(solid as any);
}

export function resolveEdges(solid: Solid, q: EdgeSpec): any[] {
  const edges: any[] = (solid as any).edges;
  if (q.kind === "all") return edges;
  if (q.kind === "ofFace") {
    const z = planeZ(solid, q.face);
    // edges lying flat in that plane (their whole z-extent is at z)
    return edges.filter((e) => Math.abs(zMin(e) - z) < 1e-4 && Math.abs(zMax(e) - z) < 1e-4);
  }
  // connecting: edges spanning from one plane to the other
  const za = planeZ(solid, q.a);
  const zb = planeZ(solid, q.b);
  const lo = Math.min(za, zb);
  const hi = Math.max(za, zb);
  return edges.filter((e) => Math.abs(zMin(e) - lo) < 1e-4 && Math.abs(zMax(e) - hi) < 1e-4 && hi - lo > TOL);
}

export function filletEdges(solid: Solid, specs: EdgeSpec[], radius: number): Solid {
  const list = dedupe(specs.flatMap((s) => resolveEdges(solid, s)));
  if (list.length === 0) throw new Error("fillet: selection matched no edges");
  return (solid as any).fillet(radius, (e: any) => e.inList(list));
}

export function chamferEdges(solid: Solid, specs: EdgeSpec[], distance: number): Solid {
  const list = dedupe(specs.flatMap((s) => resolveEdges(solid, s)));
  if (list.length === 0) throw new Error("chamfer: selection matched no edges");
  return (solid as any).chamfer(distance, (e: any) => e.inList(list));
}

export function shellFaces(solid: Solid, specs: FaceSpec[], thickness: number): Solid {
  const list = dedupe(specs.flatMap((s) => resolveFaces(solid, s)));
  if (list.length === 0) throw new Error("shell: selection matched no faces");
  return (solid as any).shell(thickness, (f: any) => f.inList(list));
}

function dedupe(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const k = (it.hashCode ?? it.wrapped?.HashCode?.(1e9) ?? out.length).toString();
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}
```
Notes for the implementer: `EdgeFinder`/`FaceFinder` `.inList(list)` selects exactly the resolved sub-shapes. If `inList` does not match by identity in the installed version, fall back to geometric finders: `ofFace` → `(e) => e.inPlane("XY", z)`; `connecting` → `(e) => e.inDirection([0,0,1])` (vertical edges, valid for prisms); `named`/`planeZ` faces → `(f) => f.inPlane("XY", z)`. The `dedupe` hash form may need adjusting to the installed replicad (`.hashCode` vs `.wrapped.HashCode`); a simple identity `Set` of the objects also works since they come from the same solid.

Add to `packages/kernel/src/index.ts`:
```ts
export { resolveEdges, resolveFaces, filletEdges, chamferEdges, shellFaces } from "./resolve";
export type { EdgeSpec, FaceSpec } from "./resolve";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/kernel/src/resolve.test.ts`
Expected: PASS. If edge counts are off, log `resolveEdges(...).length` and inspect `boundingBox.bounds` for a couple of edges to confirm the z-extent logic.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(kernel): resolve face/edge queries and apply fillet/chamfer/shell to them"
```

---

## Task 3: core — export face refs, selection functions, query-taking operators

**Files:**
- Modify: `packages/core/src/builder.ts`, `packages/core/src/builder.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/builder.test.ts`:
```ts
describe("face references and edge queries", () => {
  it("extrude exports top/bottom refs; edges()/connectingEdges() build queries", () => {
    const b = createBuilder();
    const box = b.extrude(b.rect(20, 20), 10);
    expect(box.top.locator).toEqual({ kind: "planeZ", z: 10 });
    expect(box.bottom.locator).toEqual({ kind: "planeZ", z: 0 });

    expect(b.edges(box)).toEqual({ kind: "all", body: box.__id });
    expect(b.edges(box.top)).toEqual({ kind: "ofFace", body: box.__id, face: box.top.locator });
    expect(b.connectingEdges(box.top, box.bottom)).toEqual({
      kind: "connecting",
      body: box.__id,
      a: box.top.locator,
      b: box.bottom.locator,
    });

    const rounded = b.fillet(box, [b.edges(box.top), b.connectingEdges(box.top, box.bottom)], 2);
    const node = b.getModel().nodes[rounded.__id];
    if (node.op === "fillet") expect(node.edges).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core`
Expected: FAIL — `box.top` undefined / `connectingEdges` missing / `fillet` signature mismatch.

- [ ] **Step 3: Implement in `builder.ts`**

Replace the old `EdgeSelector`/`FaceSelector` imports with the new types, and add `FaceRef`/`EdgeQuery`/`FaceLocator`:
```ts
import type { Model, Node, FaceRef, FaceLocator, EdgeQuery, RenderDecl, PointDef, LineDef, ConstraintDef } from "@cadcode/protocol";
```
Add handle types:
```ts
/** A body handle that also exposes named face references. */
export type Body = Handle & { top: FaceRef; bottom: FaceRef };
```
Update the `Builder` interface — `extrude` now returns `Body`; `fillet`/`chamfer` take `EdgeQuery | EdgeQuery[]`; `shell` takes `FaceRef | FaceRef[]`; add `connectingEdges`; `edges` is overloaded:
```ts
  extrude(region: Handle, height: number): Body;
  fillet(body: Handle, edges: EdgeQuery | EdgeQuery[], radius: number): Handle;
  chamfer(body: Handle, edges: EdgeQuery | EdgeQuery[], distance: number): Handle;
  shell(body: Handle, thickness: number, open?: FaceRef | FaceRef[]): Handle;
  edges(target: Handle | FaceRef): EdgeQuery;
  connectingEdges(a: FaceRef, b: FaceRef): EdgeQuery;
  faces(body: Handle): { top: FaceRef; bottom: FaceRef };
```
Implementations (replace the old `extrude`, `fillet`, `chamfer`, `shell`, `edges`, `faces`):
```ts
    extrude(region, height) {
      const h = add(
        { id: nextId("extrude"), op: "extrude", region: region.__id, height, sources: [region.__id] },
        [region.__id],
      );
      return Object.assign(h, {
        top: { body: h.__id, locator: { kind: "planeZ", z: height } } as FaceRef,
        bottom: { body: h.__id, locator: { kind: "planeZ", z: 0 } } as FaceRef,
      });
    },
    edges(target) {
      // A face ref -> that face's edges; a body handle -> all its edges.
      if ("locator" in target) {
        return { kind: "ofFace", body: target.body, face: target.locator };
      }
      return { kind: "all", body: target.__id };
    },
    connectingEdges(a, b) {
      return { kind: "connecting", body: a.body, a: a.locator, b: b.locator };
    },
    faces(body) {
      const ref = (name: "top" | "bottom"): FaceRef => ({ body: body.__id, locator: { kind: "named", name } });
      return { top: ref("top"), bottom: ref("bottom") };
    },
    fillet(body, edges, radius) {
      const q = Array.isArray(edges) ? edges : [edges];
      return add({ id: nextId("fillet"), op: "fillet", body: body.__id, edges: q, radius, sources: [body.__id] }, [body.__id]);
    },
    chamfer(body, edges, distance) {
      const q = Array.isArray(edges) ? edges : [edges];
      return add({ id: nextId("chamfer"), op: "chamfer", body: body.__id, edges: q, distance, sources: [body.__id] }, [body.__id]);
    },
    shell(body, thickness, open) {
      const refs = open === undefined ? [] : Array.isArray(open) ? open : [open];
      const locators: FaceLocator[] = refs.length ? refs.map((r) => r.locator) : [{ kind: "named", name: "top" }];
      return add({ id: nextId("shell"), op: "shell", body: body.__id, thickness, open: locators, sources: [body.__id] }, [body.__id]);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core`
Expected: PASS. (Update the pre-existing `more operators` test if it used `edges(x).all` — change to `edges(x)`; and `shell(...)` calls keep working.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): face refs, edges/connectingEdges, query-taking fillet/chamfer/shell"
```

---

## Task 4: runtime — drive the resolver from the graph

**Files:**
- Modify: `packages/runtime/src/run.ts`, `packages/runtime/src/run.test.ts`

- [ ] **Step 1: Write the failing test (append a constraint-free op test)**

Append a case to `packages/runtime/src/run.test.ts` (inside the existing describe with kernel+solver init):
```ts
  it("fillets only the top rim via face-ref selection", async () => {
    const src = `
      const box = extrude(rect(20, 20), 20);
      const rounded = fillet(box, edges(box.top), 2);
      render(rounded);
    `;
    const result = await run(src, { compile: nodeCompile });
    expect(result.errors).toEqual([]);
    expect(result.stages[0].op).toBe("fillet");
    expect(result.stages[0].mesh.positions.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime`
Expected: FAIL — runtime still calls `filletAll` / old shell signature; `connectingEdges` not injected.

- [ ] **Step 3: Implement in `run.ts`**

Update the kernel import to bring in the resolver-driven ops and types:
```ts
import {
  extrudeRect, extrudeProfile, extrudeCircle, revolveProfile, loftProfiles,
  shellFaces, chamferEdges, booleanOp, translateSolid, filletEdges, tessellate,
  regionFaceMesh, circleFaceMesh, profileFaceMesh, dispose,
  type Solid, type ProfileSpec, type EdgeSpec, type FaceSpec,
} from "@cadcode/kernel";
```
Add converters from protocol queries (with body ids) to kernel specs (no body ids):
```ts
import type { EdgeQuery, FaceLocator } from "@cadcode/protocol";

const toFaceSpec = (l: FaceLocator): FaceSpec => l; // identical shape
const toEdgeSpec = (q: EdgeQuery): EdgeSpec =>
  q.kind === "all"
    ? { kind: "all" }
    : q.kind === "ofFace"
      ? { kind: "ofFace", face: toFaceSpec(q.face) }
      : { kind: "connecting", a: toFaceSpec(q.a), b: toFaceSpec(q.b) };
```
In `evaluate`, replace the `fillet`/`chamfer`/`shell` branches:
```ts
    } else if (node.op === "shell") {
      solids.set(id, shellFaces(need(node.body, "shell"), node.open.map(toFaceSpec), node.thickness));
    } else if (node.op === "fillet") {
      solids.set(id, filletEdges(need(node.body, "fillet"), node.edges.map(toEdgeSpec), node.radius));
    } else if (node.op === "chamfer") {
      solids.set(id, chamferEdges(need(node.body, "chamfer"), node.edges.map(toEdgeSpec), node.distance));
    } else if (node.op === "boolean") {
```
Inject `connectingEdges` into the vm context (next to `edges`):
```ts
    edges: builder.edges,
    connectingEdges: builder.connectingEdges,
    faces: builder.faces,
```
(Remove the now-unused `filletAll`/`chamferAll`/`shellBody` imports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime`
Expected: PASS.

- [ ] **Step 5: Run the whole headless suite**

Run: `pnpm test`
Expected: protocol/core/kernel/solver/runtime/cli pass. Fix any leftover `edges(x).all` in `packages/cli/src/index.test.ts` fixtures (change to `edges(x)`).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(runtime): resolve face/edge queries into fillet/chamfer/shell"
```

---

## Task 5: types + examples migration

**Files:**
- Modify: `packages/types/index.d.ts`
- Modify: examples that used `edges(x).all`: `examples/cube.ts`, `examples/square.ts`, `examples/beveled-block.ts`, and the matching `packages/app/tests/fixtures/*`
- Create: `examples/rounded-top.ts`

- [ ] **Step 1: Update `@cadcode/types`**

Replace the `FaceSelector`/`FaceQuery`/`edges`/`fillet`/`chamfer`/`shell` declarations with:
```ts
/** How to find a face of a body. */
declare type FaceLocator = { kind: "planeZ"; z: number } | { kind: "named"; name: "top" | "bottom" };
declare interface FaceRef { body: string; locator: FaceLocator }
/** An edge selection (from edges()/connectingEdges()). */
declare interface EdgeQuery { kind: string; body: string }

/** A body handle that also exposes named face references. */
declare type Body = Handle & { top: FaceRef; bottom: FaceRef };

declare function extrude(region: Handle, height: number): Body;
/** Edges of a body (all) or of a face. */
declare function edges(target: Handle | FaceRef): EdgeQuery;
/** Edges connecting two faces (e.g. the verticals between top and bottom). */
declare function connectingEdges(a: FaceRef, b: FaceRef): EdgeQuery;
/** Named face references of a body. */
declare function faces(body: Handle): { top: FaceRef; bottom: FaceRef };
declare function fillet(body: Handle, edges: EdgeQuery | EdgeQuery[], radius: number): Handle;
declare function chamfer(body: Handle, edges: EdgeQuery | EdgeQuery[], distance: number): Handle;
declare function shell(body: Handle, thickness: number, open?: FaceRef | FaceRef[]): Handle;
```
(Keep `circle`, `polygon`, `revolve`, `loft`, `union`, `subtract`, `intersect`, `move`, sketch API, `render` as-is.)

- [ ] **Step 2: Migrate examples off `edges(x).all`**

`examples/cube.ts`:
```ts
const face = rect(30, 30);
const cube = extrude(face, 30);
const rounded = fillet(cube, edges(cube), 4);
render(rounded, { cube, face });
```
`examples/beveled-block.ts`:
```ts
const block = extrude(rect(40, 40), 15);
const beveled = chamfer(block, edges(block), 4);
render(beveled, { block });
```
`examples/square.ts`: change `fillet(... edges(...).all ...)` → `edges(...)`. Apply the same edits to the matching files under `packages/app/tests/fixtures/`.

- [ ] **Step 3: Add a reference-selection demo**

`examples/rounded-top.ts`:
```ts
// Round only the TOP rim of a block, leaving the bottom edges sharp — selection
// by face reference, not "all edges".
const block = extrude(rect(40, 40), 20);
const rounded = fillet(block, edges(block.top), 4);
render(rounded, { block });
```

- [ ] **Step 4: Verify examples render + type-check**

Run: `pnpm vitest run packages/cli/src/verify-examples.test.ts`
Expected: PASS (all examples, incl. `rounded-top.ts`, render with no errors).
Run: `cd examples && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(types,examples): face-ref selection API + rounded-top demo"
```

---

## Task 6: e2e + wrap-up

**Files:**
- Create: `packages/app/tests/fixtures/rounded-top.ts`
- Modify: `packages/app/tests/smoke.spec.ts`
- Modify: `docs/superpowers/specs/2026-06-01-geometry-references-design.md` (mark slice 1 delivered), `packages/README.md`/`README.md` if operator-selection wording needs a touch

- [ ] **Step 1: e2e fixture + test**

Copy `examples/rounded-top.ts` to `packages/app/tests/fixtures/rounded-top.ts`. Append to `smoke.spec.ts`:
```ts
test("rounds only the top rim via a face reference", async ({ page }) => {
  await page.goto("/?file=rounded-top.ts");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  await expect(page.getByTestId("stage-result")).toContainText("fillet");
  await expect(page.getByTestId("errors")).toBeHidden();
});
```

- [ ] **Step 2: Run e2e**

Run: `pnpm --filter @cadcode/app test:e2e`
Expected: PASS.

- [ ] **Step 3: Full verification**

Run: `pnpm test` and typecheck every package (`for p in protocol types core kernel solver runtime cli app; do pnpm --filter @cadcode/$p exec tsc --noEmit -p tsconfig.json; done`).
Expected: all green.

- [ ] **Step 4: Docs**

In the design spec, note slice 1 delivered (face refs + `edges`/`connectingEdges` + query-driven fillet/chamfer/shell) and what remains (face-as-Sketch reification, swept faces, `body({…})`, provenance chains). Mention the new selection in the examples README operator list.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(app): e2e top-rim fillet; docs: references slice 1 status"
```

---

## Self-review notes (addressed in this plan)

- **Spec coverage (slice 1 subset):** references as resolve-fresh values (Tasks 1–2, §2.1/2.7); set semantics + honest empty-selection error (Task 2 `resolveEdges`/throw, §2.2); planar face refs (`planeZ`/`named`) and edges of a face (§2.3, partial — reification-as-Sketch deferred); operators export named refs (`extrude.top/bottom`, Task 3, §2.4 partial); selection as plain functions (`edges`/`connectingEdges`, Task 3, §2.6); resolution by geometric coincidence (Task 2, §2.7). **Deferred & explicitly noted:** face-as-Sketch drilling, swept-from-sketch curved faces, `body({…})` (§2.5), provenance chains through fillet/boolean (§2.4 second half) — these are follow-on slices, called out in scope and Task 6 docs.
- **Type consistency:** `FaceLocator`/`FaceRef`/`EdgeQuery` (protocol, Task 1) map to `FaceSpec`/`EdgeSpec` (kernel, Task 2) via `toFaceSpec`/`toEdgeSpec` (runtime, Task 4); `Body = Handle & {top,bottom}` (Task 3) matches the `@cadcode/types` `Body` (Task 5); `fillet`/`chamfer` take `EdgeQuery|EdgeQuery[]` and store `EdgeQuery[]` consistently across core/protocol/runtime.
- **Known soft spots (verify during build, like prior replicad tuning):** `inList` identity matching and the `dedupe` hash form (Task 2 Step 1/Step 4 notes, with geometric-finder fallback); replicad `Edge.boundingBox` accessor (Task 2 Step 1).
- **Migration:** `edges(x).all` → `edges(x)` across examples/fixtures/tests (Tasks 4–5); `shell`/`faces` keep working via `named` locators.
