// A mounting bracket: a slab with two bolt holes drilled through it, using
// move() to position the holes and subtract() to cut them out.
const slab = extrude(rect(70, 28), 8);

function boltHole(x: number) {
  return move(extrude(circle(4), 8), [x, 0, 0]);
}

const drilled = subtract(slab, boltHole(-22));
const bracket = subtract(drilled, boltHole(22));

render(bracket, { slab });
