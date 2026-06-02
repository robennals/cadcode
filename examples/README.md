# examples/

Sample cadcode model files to play with. Render them with:

```bash
pnpm dev            # renders this examples/ folder
pnpm dev <path>     # render a different folder of models
```

Then pick a file in the sidebar, or open it directly, e.g.
`http://localhost:5173/?file=bracket.ts`. Edit any file in your own editor and
the render refreshes automatically.

Each model ends with `render(primary, { ...stages })` to declare what to show:
the viewport renders the primary object, and the stage panel at the bottom lists
the named stages so you can click one to view it instead (e.g. in `cube.ts`, step
back from the rounded cube to the plain `cube` or the base `face`).

## Gallery

Each file is a small, self-contained part that shows off an operator:

| File | Shows |
|---|---|
| `cube.ts` | extrude + fillet; render stages |
| `cylinder.ts` | `circle` + extrude |
| `square.ts` | constraint-solved sketch (`lines`/`coincident`/`distance`, …) |
| `washer.ts` | boolean `subtract` (a disc minus a concentric hole) |
| `bottle.ts` | `revolve` a profile, then `shell` it hollow (neck open) |
| `funnel.ts` | `loft` through stacked circles |
| `cup.ts` | `shell` (hollow open-top vessel) |
| `beveled-block.ts` | `chamfer` (bevelled edges) |
| `bracket.ts` | `move` + `subtract` (a slab with two drilled bolt holes) |
| `lib/shapes.ts` | reusable helpers (not a model on its own) |

## Operators

`extrude`, `revolve`, `loft`, `shell`, `fillet`, `chamfer`, `union`, `subtract`,
`intersect`, `move`; regions `rect`, `circle`, `polygon`, and constraint
`sketch(...)`. (`sweep` and parametric `dimension()` are coming next.)

## Setup

- `tsconfig.json` sets `"types": ["@cadcode/types"]` so editors get IntelliSense
  for the global API. (This folder depends on `@cadcode/types` rather than keeping
  a `.d.ts` of its own — the same setup you'd use in your own project.)
