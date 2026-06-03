// Round only the TOP rim of a block, leaving the bottom edges sharp — selection
// by face reference, not "all edges".
const block = extrude(rect(40, 40), 20);
const rounded = fillet(block, edges(block.top), 4);
render(rounded, { block });
