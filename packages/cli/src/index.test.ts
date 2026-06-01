// Tests the CLI's model-file read/write helpers against a temp file.
import { describe, it, expect } from "vitest";
import { readModelFile, writeModelFile } from "./dev";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cli file helpers", () => {
  it("reads and writes a model file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cadcode-"));
    const file = join(dir, "model.ts");
    writeFileSync(file, "const a = rect(1,1);");
    expect(readModelFile(file)).toContain("rect(1,1)");
    writeModelFile(file, "const b = rect(2,2);");
    expect(readModelFile(file)).toContain("rect(2,2)");
  });
});
