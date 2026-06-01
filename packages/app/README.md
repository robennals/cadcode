# @cadcode/app

The browser UI: a Vite + React app with a Monaco code editor on the left and a
live three.js viewport plus hierarchy tree on the right. It owns a Web Worker
that runs the heavy WASM (esbuild + OpenCascade) off the UI thread, debounces
editor changes into "run" messages, and renders the meshes the worker returns.

When launched standalone (`pnpm dev`) it edits an in-memory default model. When
launched through `@cadcode/cli` (`cadcode dev <file>`), it loads and saves that
file over `/api/file`.

## Files

- `index.html` — HTML entry; mounts `src/main.tsx`.
- `vite.config.ts` — Vite config (React plugin, ES-format workers, fs allow).
- `src/main.tsx` — React entry; mounts `<App>`.
- `src/App.tsx` — top-level layout, worker ownership, debounced runs, error and
  tree panels, and optional file sync via `/api/file`.
- `src/worker.ts` — Web Worker: initializes esbuild-wasm + the OC kernel and runs
  the user source, posting back meshes (transferred) and hierarchy.
- `src/Viewport.tsx` — three.js scene that renders the body meshes, with
  OrbitControls navigation (mouse/touchpad/touch), viewport-scoped keyboard
  controls, and on-screen rotate/zoom/fit widgets. See "Navigating the viewport".
- `src/dts.ts` — ambient API type declarations fed to Monaco for IntelliSense.
- `src/defaultModel.ts` — the starter source shown when no file is loaded.
- `src/processShim.ts` — minimal `process` shim (imported first in the worker)
  so the emscripten/esbuild-wasm glue can probe `process` in the browser.
- `playwright.config.ts` — Playwright config (boots `pnpm dev`).
- `tests/smoke.spec.ts` — end-to-end smoke test (default model renders one mesh;
  viewport controls are present).

## Navigating the viewport

| Action | Mouse | Touchpad | Touch | Keyboard (click the viewport first) |
|---|---|---|---|---|
| Rotate | left-drag | drag | one finger | arrow keys, or the ▲◀▶▼ pad |
| Zoom | scroll / middle-drag | scroll / pinch | pinch | `+` / `−`, or the ＋ / − buttons |
| Pan | right-drag | two-finger drag | two fingers | shift + arrows |
| Fit view | — | — | — | `0` / Home, or the ⤢ button |

The model auto-frames the first time geometry appears.
