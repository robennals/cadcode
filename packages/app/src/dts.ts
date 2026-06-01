/** Ambient global API surface, injected into Monaco for IntelliSense. */
export const CADCODE_DTS = `
interface Handle { readonly __id: string }
interface EdgeSelector { body: string; kind: "all" }
interface EdgeQuery { readonly all: EdgeSelector }
/** A centered axis-aligned rectangular region. */
declare function rect(width: number, height: number): Handle;
/** Extrude a region into a solid body. */
declare function extrude(region: Handle, height: number): Handle;
/** Round the selected edges of a body. */
declare function fillet(body: Handle, edges: EdgeSelector, radius: number): Handle;
/** Query the edges of a body. */
declare function edges(body: Handle): EdgeQuery;
`;
