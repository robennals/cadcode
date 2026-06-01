// Reusable helpers, imported by other model files. Because models are real
// TypeScript, you can factor common geometry into ordinary functions/modules.
export function squareBlock(size: number, height = size) {
  return extrude(rect(size, size), height);
}

export function roundedBlock(size: number, height: number, radius: number) {
  const body = squareBlock(size, height);
  return fillet(body, edges(body).all, radius);
}
