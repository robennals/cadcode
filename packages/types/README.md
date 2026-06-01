# @cadcode/types

Ambient TypeScript declarations for the cadcode model API, so your editor gives
full IntelliSense on the global functions (`rect`, `extrude`, `fillet`,
`edges`, …) without copying a `.d.ts` into your project.

The API is **global** — model files call `rect(...)` etc. with no `import`,
because the cadcode dev server injects these functions at runtime.

## Usage

Install it as a dev dependency in the repo where your model files live:

```bash
npm install -D @cadcode/types     # or pnpm add -D @cadcode/types
```

Then either add it to your `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@cadcode/types"] } }
```

or reference it from a single file:

```ts
/// <reference types="@cadcode/types" />
```

Now `rect`, `extrude`, `fillet`, and `edges` resolve with full type information
in any `.ts` model file.

## Files

- `index.d.ts` — the ambient global declarations (the single source of truth for
  the editor-facing API surface).
