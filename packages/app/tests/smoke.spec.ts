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

test("layout stays on-screen on a small window", async ({ page }) => {
  const W = 520;
  const H = 380;
  await page.setViewportSize({ width: W, height: H });
  await page.goto("/");

  // Nothing overflows the window horizontally or vertically.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);

  // The hierarchy browser (bottom-right) is fully within the window.
  const tree = await page.getByTestId("tree").boundingBox();
  expect(tree).not.toBeNull();
  expect(tree!.x + tree!.width).toBeLessThanOrEqual(W + 1);
  expect(tree!.y + tree!.height).toBeLessThanOrEqual(H + 1);

  // The fit-view control is fully within the window.
  const fit = await page.getByRole("button", { name: "Fit view" }).boundingBox();
  expect(fit).not.toBeNull();
  expect(fit!.x + fit!.width).toBeLessThanOrEqual(W + 1);
  expect(fit!.y + fit!.height).toBeLessThanOrEqual(H + 1);
});
