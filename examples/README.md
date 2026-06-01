# examples/

Sample cadcode model files to play with. Render them with:

```bash
pnpm dev            # renders this examples/ folder
pnpm dev <path>     # render a different folder of models
```

Then pick a file in the sidebar, or open it directly, e.g.
`http://localhost:5173/?file=bracket.ts`. Edit any file in your own editor and
the render refreshes automatically.

## Files

- `cube.ts` — a rounded cube; the simplest self-contained model.
- `bracket.ts` — built from a helper in `lib/shapes.ts`, showing cross-file imports.
- `lib/shapes.ts` — reusable geometry helpers (not a model on its own).
- `tsconfig.json` — sets `"types": ["@cadcode/types"]` so editors get IntelliSense
  for the global API. (This folder depends on `@cadcode/types` rather than keeping
  a `.d.ts` of its own — the same setup you'd use in your own project.)
