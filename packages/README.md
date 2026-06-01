# packages/

The cadcode monorepo packages. Data flows left-to-right: the user's TypeScript is
compiled and executed by the **runtime**, which calls the **core** API to record
a model graph, then walks that graph through the **kernel** to produce geometry.
The **app** and **cli** are two thin frontends over that same stack.

| Package | Role |
|---|---|
| [`protocol`](./protocol) | Shared types (model graph, mesh, hierarchy, worker messages). No runtime logic. |
| [`core`](./core) | The user-facing modelling API; records an immutable model graph (pure data). |
| [`kernel`](./kernel) | Geometry primitives over replicad/OpenCascade (extrude, fillet, tessellate). |
| [`runtime`](./runtime) | Compiles + executes user TS, walks the graph through the kernel into meshes. |
| [`app`](./app) | Browser UI: Monaco editor + three.js viewport + worker. |
| [`cli`](./cli) | `cadcode dev` (live editor on a repo file) and `cadcode export` (M4). |

Dependency direction: `app`/`cli` → `runtime` → `core` + `kernel` → `protocol`.
