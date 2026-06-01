# @cadcode/protocol

Shared TypeScript types used across every package. No runtime logic (beyond one
tiny type-guard), so it can be imported anywhere — worker, Node, or browser —
without pulling in dependencies.

It defines the **model graph** the builder produces, the **mesh** shape sent to
the viewport, the **serialized hierarchy** for the tree panel, and the
**worker ↔ main-thread message** protocol.

It also defines the **transport** used by the viewer: typed arrays don't survive
JSON, so `serializeRunResult`/`deserializeRunResult` convert meshes to/from plain
arrays for sending over Vite's HMR socket, along with the `RENDER_EVENT` /
`SELECT_EVENT` channel names.

## Files

- `src/index.ts` — all the shared types (`Node`/`RectNode`/`ExtrudeNode`/
  `FilletNode`, `EdgeSelector`, `Model`, `BodyMesh`, `HierarchyNode`, `RunResult`,
  `SerializedRunResult`, render/select messages) plus the `isBodyNode` guard and
  the serialize/deserialize helpers.
- `src/index.test.ts` — tests for `isBodyNode` and the serialization round-trip.
