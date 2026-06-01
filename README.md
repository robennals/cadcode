# cadcode

A TypeScript, constraint-based programming environment for CAD — like OpenSCAD,
but you write real TypeScript (and use any TS library), and you define 2D
sketches with Fusion-style constraints, then build 3D bodies from them with
operators (`extrude`, `fillet`, `shell`, …).

You write model files in **your own editor** and version-control them in git.
cadcode is a **viewer/dev-server** (think Storybook, but for CAD model files): it
lists your model files, renders the one you're viewing, and **auto-refreshes when
you save**. Model files can `import` other files and npm libraries.

This repo is at **milestone M0**: the end-to-end render pipeline works, but the
constraint solver isn't here yet, so sketches use explicit geometry. See the
[design spec](docs/superpowers/specs/2026-05-31-cadcode-design.md) and the
[M0 plan](docs/superpowers/plans/2026-05-31-cadcode-m0.md) for the full picture
and roadmap (M1 adds the 2D solver; M2 selection/picking; M3 parametric
sub-sketches; M4 export + more operators).

## Quick start

```bash
pnpm install

pnpm dev               # render the example models in ./examples
pnpm dev path/to/dir   # render model files from any folder
```

This opens the viewer. Pick a file in the sidebar (or open it directly, e.g.
`http://localhost:5173/?file=bracket.ts`). Now edit that file — or any file it
imports — in your own editor, and the render refreshes automatically.

## Example (M0)

```ts
// examples/bracket.ts — models are real TS and can import other files.
import { roundedBlock } from "./lib/shapes";

const bracket = roundedBlock(40, 12, 3);
```

`./examples` has more, including a self-contained `cube.ts`. Drop a
`cadcode-globals.d.ts` (see `examples/`) in your own project for editor IntelliSense.

## How it works

The `cadcode dev` server bundles the selected file + its imports with esbuild,
runs it headlessly through the kernel (OpenCascade via replicad), and live-pushes
the resulting meshes to the browser over Vite's HMR socket. The browser is a thin
viewer: a file sidebar, a three.js viewport with rotate/pan/zoom/fit controls, and
a hierarchy panel. Rendering is lazy — only the file you're viewing is built.

## Tests

```bash
pnpm test                              # headless unit tests (all packages)
pnpm --filter @cadcode/app test:e2e    # browser e2e incl. live-reload (Playwright)
```

## Layout

A pnpm monorepo. The packages and how they fit together are described in
[`packages/README.md`](packages/README.md); each package has its own README.

| Package | Role |
|---|---|
| `@cadcode/protocol` | Shared types + render-result serialization |
| `@cadcode/core` | User-facing modelling API; records the model graph |
| `@cadcode/kernel` | Geometry via replicad/OpenCascade |
| `@cadcode/runtime` | Executes bundled user code; walks the graph into meshes |
| `@cadcode/app` | Browser viewer (file sidebar + three.js viewport) |
| `@cadcode/cli` | `cadcode dev` (bundle + render + live reload) / `export` |
