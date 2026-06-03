// Tests the CLI's pure helpers (file listing, path safety, target resolution)
// and a real bundle->run of a model that imports another file.
import { describe, it, expect, beforeAll } from "vitest";
import {
  readModelFile,
  writeModelFile,
  listModelFiles,
  resolveWithin,
  resolveTarget,
  defaultTarget,
} from "./dev";
import { bundleFile } from "./bundle";
import { init } from "@cadcode/kernel/oc";
import { runCode } from "@cadcode/runtime/run";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "cadcode-"));
  mkdirSync(join(dir, "lib"));
  mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
  writeFileSync(
    join(dir, "lib", "shapes.ts"),
    "export function squareBlock(s) { return extrude(rect(s, s), s); }\n",
  );
  writeFileSync(
    join(dir, "box.ts"),
    "import { squareBlock } from './lib/shapes';\n" +
      "const part = squareBlock(20);\n" +
      "const rounded = fillet(part, edges(part), 3);\n" +
      "render(rounded, { block: part });\n",
  );
  writeFileSync(join(dir, "box.test.ts"), "// excluded\n");
  writeFileSync(join(dir, "types.d.ts"), "// excluded\n");
  writeFileSync(join(dir, "node_modules", "pkg", "index.ts"), "// excluded\n");
  return dir;
}

describe("cli file helpers", () => {
  it("reads and writes a model file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cadcode-"));
    const file = join(dir, "model.ts");
    writeFileSync(file, "const a = rect(1,1);");
    expect(readModelFile(file)).toContain("rect(1,1)");
    writeModelFile(file, "const b = rect(2,2);");
    expect(readModelFile(file)).toContain("rect(2,2)");
  });

  it("lists model files, excluding tests/decls/node_modules", () => {
    const dir = makeProject();
    expect(listModelFiles(dir)).toEqual(["box.ts", "lib/shapes.ts"]);
  });

  it("rejects paths that escape the project root", () => {
    const dir = makeProject();
    expect(resolveWithin(dir, "box.ts")).toBe(join(dir, "box.ts"));
    expect(() => resolveWithin(dir, "../secret")).toThrow();
    expect(() => resolveWithin(dir, "/etc/passwd")).toThrow();
  });

  it("rejects a symlink that points outside the project root", () => {
    const dir = makeProject();
    const outside = mkdtempSync(join(tmpdir(), "cadcode-outside-"));
    writeFileSync(join(outside, "secret.ts"), "// secret");
    symlinkSync(join(outside, "secret.ts"), join(dir, "link.ts"));
    // Textually inside root, but realpath escapes — must be rejected.
    expect(() => resolveWithin(dir, "link.ts")).toThrow();
  });

  it("resolves a directory target vs a file target", () => {
    const dir = makeProject();
    expect(resolveTarget(dir, undefined)).toEqual({ root: dir });
    expect(resolveTarget(dir, ".")).toEqual({ root: dir });
    expect(resolveTarget(dir, "box.ts")).toEqual({ root: dir, initial: "box.ts" });
  });

  it("defaults to an ./examples folder when one exists", () => {
    const dir = makeProject();
    expect(defaultTarget(dir)).toBeUndefined();
    mkdirSync(join(dir, "examples"));
    expect(defaultTarget(dir)).toBe("examples");
  });
});

describe("bundle + run a model that imports another file", () => {
  beforeAll(async () => {
    await init();
  });

  it("produces render stages from box.ts -> lib/shapes.ts", async () => {
    const dir = makeProject();
    const bundled = await bundleFile(join(dir, "box.ts"));
    expect(bundled.error).toBeUndefined();
    // The imported file is part of the bundle's inputs (so it gets watched).
    expect(bundled.inputs.some((p) => p.endsWith("shapes.ts"))).toBe(true);

    const result = runCode(bundled.code);
    expect(result.errors).toEqual([]);
    expect(result.primary).toBe("result");
    expect(result.stages.map((s) => [s.name, s.op])).toEqual([
      ["result", "fillet"],
      ["block", "extrude"],
    ]);
    for (const s of result.stages) {
      expect(s.mesh.positions.length).toBeGreaterThan(0);
    }
  });
});
