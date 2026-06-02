// A cup: a solid cylinder hollowed into an open-top vessel (shell).
const solid = extrude(circle(18), 35);
const cup = shell(solid, 2.5);

render(cup, { solid });
