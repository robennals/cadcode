// A block with all its edges beveled (chamfer) — compare with fillet.
const block = extrude(rect(40, 40), 15);
const beveled = chamfer(block, edges(block).all, 4);

render(beveled, { block });
