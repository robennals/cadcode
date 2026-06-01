# cadcode

A TypeScript, constraint-based programming environment for CAD — like OpenSCAD,
but you write real TypeScript (and use any TS library), and you define 2D
sketches with Fusion-style constraints, then build 3D bodies from them with
operators (`extrude`, `fillet`, `shell`, …).

This repo is at **milestone M0**: the full end-to-end spine works — edit
TypeScript in the browser and see a live 3D model — but the constraint solver
isn't here yet, so sketches use explicit geometry. See the
[design spec](docs/superpowers/specs/2026-05-31-cadcode-design.md) and the
[M0 plan](docs/superpowers/plans/2026-05-31-cadcode-m0.md) for the full picture
and roadmap (M1 adds the 2D solver; M2 selection/picking; M3 parametric
sub-sketches; M4 export + more operators).

## What works in M0

- Write real TypeScript; it compiles and runs in a sandboxed worker.
- `rect`, `extrude`, `fillet` produce true OpenCascade B-rep geometry.
- A live three.js viewport and a browsable hierarchy of the model.
- Run it on top of a file in your own git repo, or render headlessly.

## Quick start

```bash
pnpm install

# Standalone playground (in-memory default model):
pnpm dev

# Run on top of a file in your repo (loads + saves that file):
pnpm cadcode dev path/to/model.ts
```

Then edit the code on the left; the model on the right updates live.

## Example (M0)

```ts
// Explicit geometry — no constraint solver yet.
const face = rect(20, 20);
const cube = extrude(face, 20);
const rounded = fillet(cube, edges(cube).all, 3);
```

## Tests

```bash
pnpm test                        # headless unit tests (protocol/core/kernel/runtime/cli)
pnpm --filter @cadcode/app test:e2e   # browser smoke test (Playwright)
```

## Layout

A pnpm monorepo. The packages and how they fit together are described in
[`packages/README.md`](packages/README.md); each package has its own README.

| Package | Role |
|---|---|
| `@cadcode/protocol` | Shared types (model graph, mesh, messages) |
| `@cadcode/core` | User-facing modelling API; records the model graph |
| `@cadcode/kernel` | Geometry via replicad/OpenCascade |
| `@cadcode/runtime` | Compiles + runs user TS, walks the graph into meshes |
| `@cadcode/app` | Browser UI (Monaco + three.js + worker) |
| `@cadcode/cli` | `cadcode dev` / `cadcode export` |
