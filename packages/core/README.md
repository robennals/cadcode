# @cadcode/core

The user-facing modelling API. `createBuilder()` returns the functions a user
script calls — `rect`, `extrude`, `fillet`, `edges` — and each call records an
immutable node in a model graph. It tracks which bodies are still "alive" (not
consumed by a later operation) so the runtime knows what to render.

This package is **pure data**: it computes no geometry and has no dependency on
the kernel or any environment, which keeps it trivially testable. Geometry is
produced later by `@cadcode/kernel`, driven by `@cadcode/runtime`.

## Files

- `src/builder.ts` — `createBuilder()` and the `Handle`/`EdgeQuery`/`Builder`
  types; builds the graph and the alive-set.
- `src/builder.test.ts` — verifies the graph shape and alive-body tracking.
- `src/index.ts` — public re-exports.
