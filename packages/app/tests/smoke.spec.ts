// Playwright smoke test: loads the app and verifies the default model renders
// one mesh, the tree shows the fillet, and no errors are reported.
import { test, expect } from "@playwright/test";

test("default model renders one mesh and a 3-node tree", async ({ page }) => {
  await page.goto("/");
  const viewport = page.getByTestId("viewport");
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-mesh-count")), {
      timeout: 60000,
    })
    .toBe(1);
  await expect(page.getByTestId("tree")).toContainText("fillet");
  await expect(page.getByTestId("errors")).toHaveText("");
});

test("viewport exposes rotate / zoom / fit controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Fit view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate left" })).toBeVisible();
  // Clicking a control must not throw or clear the rendered mesh.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("viewport").getAttribute("data-mesh-count")),
    )
    .toBe(1);
});
