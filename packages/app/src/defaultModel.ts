// The starter source shown in the editor when no file is loaded.
export const DEFAULT_MODEL = `// cadcode M0 — explicit geometry, no solver yet.
const face = rect(20, 20);
const cube = extrude(face, 20);
const rounded = fillet(cube, edges(cube).all, 3);
`;
