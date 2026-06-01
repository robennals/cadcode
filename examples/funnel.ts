// A funnel: loft through three circles stacked at increasing heights.
const funnel = loft([circle(30), circle(22), circle(5)], [0, 8, 36]);

render(funnel);
