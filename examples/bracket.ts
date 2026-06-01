// Demonstrates importing another file: this model is built from a helper in
// ./lib/shapes. Editing either file live-updates the render.
import { squareBlock } from "./lib/shapes";

const block = squareBlock(40, 12);
const bracket = fillet(block, edges(block).all, 3);

// Primary view is the filleted bracket; "block" steps back to the raw extrude.
render(bracket, { block });
