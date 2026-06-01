// A funnel: loft through three circles, then hollow it into a thin wall open at
// BOTH ends (wide mouth + narrow spout) — that's what makes it a funnel.
const cone = loft([circle(30), circle(22), circle(5)], [0, 8, 36]);
const funnel = shell(cone, 2, [faces(cone).top, faces(cone).bottom]);

render(funnel, { cone });
