// Ambient cadcode API — available as globals in every model file (no import).
// Having this in your project gives your editor full IntelliSense for the API.
declare interface Handle {
  readonly __id: string;
}
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
