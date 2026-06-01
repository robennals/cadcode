import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { init as initKernel } from "@cadcode/kernel/oc";
import { init as initSolver } from "@cadcode/solver";
import { runCode } from "@cadcode/runtime/run";
import { bundleFile } from "./bundle";

const examplesDir = fileURLToPath(new URL("../../../examples", import.meta.url));
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

describe("examples all render", () => {
  beforeAll(async () => { await Promise.all([initKernel(), initSolver()]); });
  for (const f of files) {
    it(`renders ${f}`, async () => {
      const bundled = await bundleFile(join(examplesDir, f));
      expect(bundled.error).toBeUndefined();
      const result = runCode(bundled.code);
      expect(result.errors).toEqual([]);
      expect(result.stages.length).toBeGreaterThan(0);
      for (const s of result.stages) expect(s.mesh.positions.length).toBeGreaterThan(0);
    });
  }
});
