// A constraint-defined square. Four lines are turned into a 20x20 square purely
// by geometric + dimensional constraints (no explicit coordinates), then
// extruded. This is the M1 constraint solver at work.
function square(side: number) {
  const [bottom, right, top, left] = lines(4);

  // Close the loop: each line's end meets the next line's start.
  coincident(
    [bottom.end, right.start],
    [right.end, top.start],
    [top.end, left.start],
    [left.end, bottom.start],
  );
  parallel([bottom, top], [left, right]);
  perpendicular(bottom, right);
  equal([bottom, right, top, left]); // all four sides equal
  horizontal(bottom); // pin the orientation
  distance(bottom.start, bottom.end, side); // set the size

  return sketch({ bottom, right, top, left });
}

const sk = square(20);
const body = extrude(sk.region, 20);

// Show the solid by default; click "sketch" to see the solved 2D profile.
render(body, { sketch: sk });
