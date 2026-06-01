# packages/

The cadcode monorepo packages. cadcode is a **viewer/dev-server** (Storybook for
CAD models): the **cli** bundles the selected model file + its imports, runs it
through the **runtime** (which calls the **core** API to record a model graph,
then walks it through the **kernel** to produce geometry), and live-pushes the
result to the **app** viewer in the browser.

| Package | Role |
|---|---|
| [`protocol`](./protocol) | Shared types + render-result serialization. No heavy logic. |
| [`types`](./types) | Ambient declarations for the global model API, for editor IntelliSense in user projects. |
| [`core`](./core) | The user-facing modelling API; records an immutable model graph (pure data). |
| [`kernel`](./kernel) | Geometry primitives over replicad/OpenCascade (extrude, fillet, tessellate). |
| [`solver`](./solver) | 2D sketch constraint solver — wraps FreeCAD's GCS (planegcs, WASM). |
| [`runtime`](./runtime) | Executes bundled user code, walks the graph through the kernel into meshes. |
| [`app`](./app) | Browser **viewer**: file sidebar + three.js viewport + hierarchy (no editor). |
| [`cli`](./cli) | `cadcode dev` — bundle + headless render + file-watch live reload; `export` (M4). |

Dependency direction: `cli` → `runtime` + `kernel` (+ `app` served to the
browser) → `core` + `kernel` → `protocol`. The `app` depends only on `protocol`.
