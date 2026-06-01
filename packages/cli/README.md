# @cadcode/cli

The command-line dev server. Renders model files from your own git repo — like
Storybook, but for CAD model files. cadcode never owns storage; you edit files in
your own editor and version-control them.

- **`cadcode dev [dir|file]`** — serves the `@cadcode/app` viewer on top of a
  project. With no argument it serves the current directory (the repo's
  `pnpm dev` prefers an `./examples` folder); a directory serves that project; a
  file opens that file. It:
  - lists the project's `.ts` model files (sidebar) and lets the `?file=<path>`
    URL select one;
  - **bundles the selected file + its imports** (esbuild) so model files can
    `import` other files and npm libraries;
  - runs the bundle **headlessly** through `@cadcode/runtime` + `@cadcode/kernel`
    and **live-pushes** the render stages to the browser over Vite's HMR socket;
  - **watches** the file and its imports and re-renders on save (auto-refresh).
  Rendering is lazy — only the file currently being viewed is built.
- **`cadcode export`** — placeholder; headless STL/STEP/3MF export arrives in M4.

Run it via the repo-root scripts: `pnpm dev [path]` or `pnpm cadcode dev [path]`
(both execute the TypeScript through `tsx`).

## Files

- `src/index.ts` — argv parsing and command dispatch.
- `src/dev.ts` — `startDev()` (Vite server, `/api/files` + `/api/file`, the HMR
  render channel, and file-watching) plus helpers: `listModelFiles`,
  `resolveWithin` (path-safety), `resolveTarget`, `defaultTarget`.
- `src/bundle.ts` — `bundleFile()`: esbuild-bundles an entry + its imports and
  reports the input files to watch.
- `src/index.test.ts` — tests for the helpers and a real bundle→run with an import.
- `bin/cadcode.js` — published bin shim (runs the built JS output).
