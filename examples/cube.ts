// A rounded cube — the simplest self-contained model.
// Explicit geometry (no constraint solver yet, that arrives in M1).
const face = rect(30, 30);
const cube = extrude(face, 30);
const rounded = fillet(cube, edges(cube).all, 4);
