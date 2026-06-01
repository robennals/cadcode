# @cadcode/cli

The command-line entry point. Runs the cadcode app on top of files in your own
git repo — cadcode never owns storage.

- **`cadcode dev <file.ts>`** — starts a Vite server for `@cadcode/app` and
  exposes the chosen model file over `/api/file`: the browser editor loads it,
  and edits are saved back to disk. This is the "run on top of your repo" mode.
- **`cadcode export`** — placeholder; headless STL/STEP/3MF export arrives in
  milestone M4.

For local development run it via the repo-root script `pnpm cadcode <args>`
(which executes the TypeScript through `tsx`), e.g. `pnpm cadcode dev model.ts`.

## Files

- `src/index.ts` — argv parsing and command dispatch; also re-exports the dev
  helpers.
- `src/dev.ts` — `startDev()` (Vite server + `/api/file` middleware) and the
  `readModelFile`/`writeModelFile` helpers.
- `src/index.test.ts` — tests for the file read/write helpers.
- `bin/cadcode.js` — published bin shim (runs the built JS output).
