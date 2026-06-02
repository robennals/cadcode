// The simplest round solid: extrude a circle.
const base = circle(15);
const cyl = extrude(base, 40);

render(cyl, { base });
