// A bottle, revolved from a 2D profile. Profile points are (radius, height);
// it starts and ends on the axis (radius 0) so the revolution is a solid.
const profile = polygon([
  [0, 0],
  [25, 0],
  [25, 45],
  [16, 60],
  [10, 75],
  [10, 92],
  [0, 92],
]);
const bottle = revolve(profile);

render(bottle, { profile });
