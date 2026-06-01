# @cadcode/protocol

Shared TypeScript types used across every package. No runtime logic (beyond one
tiny type-guard), so it can be imported anywhere — worker, Node, or browser —
without pulling in dependencies.

It defines the **model graph** the builder produces, the **mesh** shape sent to
the viewport, the **serialized hierarchy** for the tree panel, and the
**worker ↔ main-thread message** protocol.

## Files

- `src/index.ts` — all the shared types (`Node`/`RectNode`/`ExtrudeNode`/
  `FilletNode`, `EdgeSelector`, `Model`, `BodyMesh`, `HierarchyNode`,
  `RunResult`, `WorkerRequest`/`WorkerResponse`) plus the `isBodyNode` guard.
- `src/index.test.ts` — tests for `isBodyNode`.
