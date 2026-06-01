# @cadcode/kernel

The geometry layer. Wraps [replicad](https://replicad.xyz) / OpenCascade (a
boundary-representation CAD kernel compiled to WASM) behind a small, replaceable
set of primitives: build a box, fillet all edges, measure volume/bounds/edge
count, and tessellate a solid into a transferable mesh.

The OpenCascade WASM must be loaded once before any geometry call. Because that
loading differs by environment, it lives in two separate modules selected via
subpath exports — `@cadcode/kernel/oc` (Node) and `@cadcode/kernel/oc-browser`
(browser). The main entry (`@cadcode/kernel`) is geometry-only and deliberately
does **not** re-export the loader, so importing it never drags environment-
specific code into a bundle.

## Files

- `src/kernel.ts` — geometry primitives: `extrudeRect`, `filletAll`, `volume`,
  `boundingBox`, `edgeCount`, `tessellate`, and the opaque `Solid` type.
- `src/oc.ts` — loads OpenCascade into replicad under Node (resolves the `.wasm`
  via `createRequire`). Used by tests and the headless CLI export path.
- `src/oc.browser.ts` — loads OpenCascade in the browser (locates the `.wasm`
  via Vite's `?url` import).
- `src/index.ts` — public entry point (geometry only).
- `src/kernel.test.ts` — headless geometry assertions (volume, bounds, fillet,
  edge count, tessellation).
