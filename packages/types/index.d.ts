// Ambient cadcode model API. The functions below are available as GLOBALS in
// every model file (no import needed) — the dev server injects them at runtime.
// This file declares them so your editor gives full IntelliSense.
//
// Add it to your project's tsconfig.json:
//   { "compilerOptions": { "types": ["@cadcode/types"] } }
// or reference it from a single file:
//   /// <reference types="@cadcode/types" />
//
// Keep this an ambient script (no top-level import/export) so the declarations
// stay global.

/** An opaque handle to a region or body, passed between API calls. */
declare interface Handle {
  readonly __id: string;
}

/** A selector describing a set of edges on a body (M0 supports `all`). */
declare interface EdgeSelector {
  body: string;
  kind: "all";
}

declare interface EdgeQuery {
  readonly all: EdgeSelector;
}

/** A centered, axis-aligned rectangular region (a 2D profile to extrude). */
declare function rect(width: number, height: number): Handle;

/** Extrude a region into a solid body. */
declare function extrude(region: Handle, height: number): Handle;

/** Round the selected edges of a body. */
declare function fillet(body: Handle, edges: EdgeSelector, radius: number): Handle;

/** Query the edges of a body (M0 supports `.all`). */
declare function edges(body: Handle): EdgeQuery;

/**
 * Declare what the viewer should render. The first argument is the primary
 * object (shown by default); the optional second argument names additional
 * stages the viewer lists and lets you click to view instead.
 *
 *   render(rounded, { cube, face });
 */
declare function render(primary: Handle, stages?: Record<string, Handle>): void;
