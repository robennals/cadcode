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

/** How to find a face of a body. */
declare type FaceLocator = { kind: "planeZ"; z: number } | { kind: "named"; name: "top" | "bottom" };
declare interface FaceRef { body: string; locator: FaceLocator }
/** An edge selection (from edges()/connectingEdges()). */
declare interface EdgeQuery { kind: string; body: string }

/** A body handle that also exposes named face references. */
declare type Body = Handle & { top: FaceRef; bottom: FaceRef };

/** A centered, axis-aligned rectangular region (a 2D profile to extrude). */
declare function rect(width: number, height: number): Handle;

/** A circle region centered at the origin. */
declare function circle(radius: number): Handle;

/** A region from explicit closed-polygon 2D points. */
declare function polygon(points: [number, number][]): Handle;

/** Extrude a region into a solid body. */
declare function extrude(region: Handle, height: number): Body;

/** Revolve a region's profile around the Z axis (profile points are radius/height). */
declare function revolve(region: Handle, opts?: { angle?: number }): Handle;

/** Loft through a stack of regions, each placed at the matching z height. */
declare function loft(regions: Handle[], heights: number[]): Handle;

/** Edges of a body (all) or of a face. */
declare function edges(target: Handle | FaceRef): EdgeQuery;
/** Edges connecting two faces (e.g. the verticals between top and bottom). */
declare function connectingEdges(a: FaceRef, b: FaceRef): EdgeQuery;
/** Named face references of a body. */
declare function faces(body: Handle): { top: FaceRef; bottom: FaceRef };

/** Hollow a body to a wall thickness, opening the selected face(s). Defaults to
 *  the top (a cup); pass `[faces(b).top, faces(b).bottom]` for an open tube. */
declare function shell(body: Handle, thickness: number, open?: FaceRef | FaceRef[]): Handle;

/** Round the selected edges of a body. */
declare function fillet(body: Handle, edges: EdgeQuery | EdgeQuery[], radius: number): Handle;

/** Bevel the selected edges of a body. */
declare function chamfer(body: Handle, edges: EdgeQuery | EdgeQuery[], distance: number): Handle;

/** Combine two bodies (boolean union). */
declare function union(a: Handle, b: Handle): Handle;

/** Cut the second body out of the first (boolean subtract). */
declare function subtract(a: Handle, b: Handle): Handle;

/** Keep only the overlap of two bodies (boolean intersect). */
declare function intersect(a: Handle, b: Handle): Handle;

/** Translate a body by an [x, y, z] offset (e.g. to position holes for booleans). */
declare function move(body: Handle, offset: [number, number, number]): Handle;

/**
 * Declare what the viewer should render. The first argument is the primary
 * object (shown by default); the optional second argument names additional
 * stages the viewer lists and lets you click to view instead.
 *
 *   render(rounded, { cube, face });
 */
declare function render(primary: Handle, stages?: Record<string, Handle>): void;

// --- 2D sketch constraints (M1) ---

/** A sketch point. */
declare interface Point {
  readonly __id: string;
}
/** A sketch line with two endpoints. */
declare interface Line {
  readonly __id: string;
  readonly start: Point;
  readonly end: Point;
}

/** Create a free sketch point (optionally seeded near x,y). */
declare function point(x?: number, y?: number): Point;
/** Create n sketch lines (each with its own start/end points). */
declare function lines(n: number): Line[];
/** Make each given pair of points coincident. */
declare function coincident(...pairs: [Point, Point][]): void;
/** Make the lines in each group mutually parallel. */
declare function parallel(...groups: Line[][]): void;
/** Make two lines perpendicular. */
declare function perpendicular(a: Line, b: Line): void;
/** Make all the given lines equal length. */
declare function equal(lines: Line[]): void;
/** Constrain a line to be horizontal. */
declare function horizontal(line: Line): void;
/** Constrain a line to be vertical. */
declare function vertical(line: Line): void;
/** Constrain the distance between two points. */
declare function distance(a: Point, b: Point, value: number): void;
/** Bundle constrained entities into a sketch. The result is a region you can
 *  `extrude` (via `.region`) and also `render` directly. */
declare function sketch<T extends Record<string, Line>>(
  entities: T,
): T & Handle & { region: Handle };
