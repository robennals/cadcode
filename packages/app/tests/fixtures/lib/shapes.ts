// Shared helper imported by other model files — proves cross-file imports work.
export function squareBlock(size: number) {
  return extrude(rect(size, size), size);
}
