// A bottle: revolve a 2D profile (points are radius/height, starting and ending
// on the axis so the revolution is a solid), then shell it hollow with only the
// top (neck) face open.
const profile = polygon([
  [0, 0],
  [25, 0],
  [25, 45],
  [16, 60],
  [10, 75],
  [10, 92],
  [0, 92],
]);
const solid = revolve(profile);
const bottle = shell(solid, 2.5, faces(solid).top);

render(bottle, { solid, profile });
