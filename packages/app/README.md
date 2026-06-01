# @cadcode/app

The browser **viewer** (Vite + React). It does not edit or execute models — you
edit model files in your own editor; this app renders them. It connects to the
`@cadcode/cli` dev server, tells it which file to render (chosen by the `?file=`
URL param or the sidebar), and displays the render stages the server live-pushes
over Vite's HMR socket whenever the file or its imports change.

Layout (Storybook-style): a sidebar lists every model file in the project; the
main area shows the selected file's name, the 3D viewport (with rotate/pan/zoom/
fit controls), and a stage panel listing the model's `render()` stages (click one
to view it). The current file is also shown in the tab title. Rendering is lazy —
only the selected file is built.

## Files

- `index.html` — HTML entry; mounts `src/main.tsx`.
- `vite.config.ts` — Vite config (React plugin, fs allow).
- `src/main.tsx` — React entry; mounts `<App>`.
- `src/App.tsx` — sidebar index + main viewer; resolves the file from the URL,
  subscribes to the HMR render channel, keeps the URL/tab-title in sync.
- `src/Viewport.tsx` — three.js scene with OrbitControls + on-screen
  rotate/pan/zoom/fit widgets and a keyboard fallback. See "Navigating the viewport".
- `playwright.config.ts` — boots a real `cadcode dev` server against `tests/fixtures`.
- `tests/fixtures/` — sample models used by the e2e tests (`box.ts` imports
  `lib/shapes.ts`; `tall.ts` is a second model). `_*.ts` are scratch files made by
  tests (gitignored).
- `tests/smoke.spec.ts` — viewer e2e: render, file name in URL/title, sidebar
  switching, URL selection, controls, responsive layout.
- `tests/livereload.spec.ts` — proves the render auto-refreshes when a file changes.

## Navigating the viewport

| Action | Mouse | Touchpad | Touch | Keyboard (click the viewport first) |
|---|---|---|---|---|
| Rotate | left-drag | drag | one finger | arrow keys, or the ▲◀▶▼ pad |
| Zoom | scroll / middle-drag | scroll / pinch | pinch | `+` / `−`, or the ＋ / − buttons |
| Pan | right-drag | two-finger drag | two fingers | shift + arrows |
| Fit view | — | — | — | `0` / Home, or the ⤢ button |

The model auto-frames the first time geometry appears.
