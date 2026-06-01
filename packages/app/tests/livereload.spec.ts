// Verifies the core promise of the viewer: when the file on disk changes, the
// render updates automatically (no browser reload). Writes a temp model file in
// the fixtures dir, then rewrites it to declare an extra stage and asserts the
// stage panel follows.
import { test, expect } from "@playwright/test";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const liveFile = fileURLToPath(new URL("./fixtures/_live.ts", import.meta.url));

const ONE_STAGE = "const a = extrude(rect(10, 10), 10);\nrender(a);\n";
const TWO_STAGES =
  "const a = extrude(rect(10, 10), 10);\n" +
  "const b = extrude(rect(5, 5), 20);\n" +
  "render(a, { b });\n";

test.beforeAll(() => writeFileSync(liveFile, ONE_STAGE));
test.afterAll(() => rmSync(liveFile, { force: true }));

test("auto-refreshes the render when the file changes on disk", async ({ page }) => {
  await page.goto("/?file=_live.ts");
  const stageButtons = page.getByTestId("stages").getByRole("button");
  await expect.poll(() => stageButtons.count(), { timeout: 60000 }).toBe(1);

  // Edit the file on disk (as the user's own editor would) — no page reload.
  writeFileSync(liveFile, TWO_STAGES);

  await expect.poll(() => stageButtons.count(), { timeout: 60000 }).toBe(2);
});
