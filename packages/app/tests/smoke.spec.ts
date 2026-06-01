// End-to-end viewer tests against a live `cadcode dev` server: the server
// bundles + renders the fixture (which imports another file) and pushes meshes
// to the browser, which displays them with navigation controls and a file
// picker. Also checks the URL/title reflect the rendered file.
import { test, expect } from "@playwright/test";

async function meshCount(page: import("@playwright/test").Page) {
  return Number(await page.getByTestId("viewport").getAttribute("data-mesh-count"));
}

test("renders the initial file (built from an import) as one mesh", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  await expect(page.getByTestId("tree")).toContainText("fillet");
  // No visible error panel.
  await expect(page.getByTestId("errors")).toBeHidden();
});

test("shows the rendered file name in the toolbar, URL, and tab title", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  await expect(page).toHaveURL(/file=box\.ts/);
  await expect(page).toHaveTitle(/box\.ts/);
  await expect(page.getByTestId("file-name-current")).toHaveText("box.ts");
  // The sidebar highlights the active file.
  await expect(page.getByRole("button", { name: "box.ts" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the sidebar lists every model file and switches on click", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);

  // The index lists all model files, including the imported helper.
  await expect(page.getByRole("button", { name: "box.ts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "lib/shapes.ts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "tall.ts" })).toBeVisible();

  await page.getByRole("button", { name: "tall.ts" }).click();
  await expect(page).toHaveURL(/file=tall\.ts/);
  await expect(page).toHaveTitle(/tall\.ts/);
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
});

test("renders a file chosen directly by the URL", async ({ page }) => {
  await page.goto("/?file=tall.ts");
  await expect(page).toHaveTitle(/tall\.ts/);
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
});

test("viewport exposes rotate / zoom / fit controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Fit view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate left" })).toBeVisible();
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => meshCount(page)).toBe(1);
});

test("layout stays on-screen on a small window", async ({ page }) => {
  const W = 520;
  const H = 380;
  await page.setViewportSize({ width: W, height: H });
  await page.goto("/");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);

  const tree = await page.getByTestId("tree").boundingBox();
  expect(tree).not.toBeNull();
  expect(tree!.x + tree!.width).toBeLessThanOrEqual(W + 1);
  expect(tree!.y + tree!.height).toBeLessThanOrEqual(H + 1);

  const fit = await page.getByRole("button", { name: "Fit view" }).boundingBox();
  expect(fit).not.toBeNull();
  expect(fit!.x + fit!.width).toBeLessThanOrEqual(W + 1);
  expect(fit!.y + fit!.height).toBeLessThanOrEqual(H + 1);
});
