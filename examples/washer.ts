// A washer: a disc with a concentric hole punched through it (boolean subtract).
const disc = extrude(circle(12), 4);
const hole = extrude(circle(6), 4);
const washer = subtract(disc, hole);

render(washer, { disc, hole });
