// Verifies the core promise of the viewer: when the file on disk changes, the
// render updates automatically (no browser reload). Writes a temp model file in
// the fixtures dir, then rewrites it and asserts the mesh count follows.
import { test, expect } from "@playwright/test";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const liveFile = fileURLToPath(new URL("./fixtures/_live.ts", import.meta.url));

const ONE_BODY = "const a = extrude(rect(10, 10), 10);\n";
const TWO_BODIES = ONE_BODY + "const b = extrude(rect(5, 5), 20);\n";

test.beforeAll(() => writeFileSync(liveFile, ONE_BODY));
test.afterAll(() => rmSync(liveFile, { force: true }));

test("auto-refreshes the render when the file changes on disk", async ({ page }) => {
  await page.goto("/?file=_live.ts");
  await expect
    .poll(
      async () =>
        Number(await page.getByTestId("viewport").getAttribute("data-mesh-count")),
      { timeout: 60000 },
    )
    .toBe(1);

  // Edit the file on disk (as the user's own editor would) — no page reload.
  writeFileSync(liveFile, TWO_BODIES);

  await expect
    .poll(
      async () =>
        Number(await page.getByTestId("viewport").getAttribute("data-mesh-count")),
      { timeout: 60000 },
    )
    .toBe(2);
});
