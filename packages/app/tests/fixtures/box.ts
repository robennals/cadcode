// A rounded cube built from an imported helper.
import { squareBlock } from "./lib/shapes";

const part = squareBlock(20);
const rounded = fillet(part, edges(part).all, 3);
render(rounded, { block: part });
