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
  // The stage panel lists the render() stages with their types.
  await expect(page.getByTestId("stages")).toContainText("result");
  await expect(page.getByTestId("stages")).toContainText("fillet");
  // No visible error panel.
  await expect(page.getByTestId("errors")).toBeHidden();
});

test("lists render() stages and switches the view when one is clicked", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);

  // box.ts calls render(rounded, { block: part }) -> stages: result, block.
  const result = page.getByTestId("stage-result");
  const block = page.getByTestId("stage-block");
  await expect(result).toBeVisible();
  await expect(block).toContainText("extrude");
  await expect(result).toHaveAttribute("aria-pressed", "true");

  // Click the "block" stage -> it becomes active, the toolbar reflects it, and
  // the viewport still shows a (different) single mesh.
  await block.click();
  await expect(block).toHaveAttribute("aria-pressed", "true");
  await expect(result).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("file-name-current").locator("..")).toContainText("extrude");
  await expect.poll(() => meshCount(page)).toBe(1);
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

  const stages = await page.getByTestId("stages").boundingBox();
  expect(stages).not.toBeNull();
  expect(stages!.x + stages!.width).toBeLessThanOrEqual(W + 1);
  expect(stages!.y + stages!.height).toBeLessThanOrEqual(H + 1);

  const fit = await page.getByRole("button", { name: "Fit view" }).boundingBox();
  expect(fit).not.toBeNull();
  expect(fit!.x + fit!.width).toBeLessThanOrEqual(W + 1);
  expect(fit!.y + fit!.height).toBeLessThanOrEqual(H + 1);
});

test("renders a constraint-solved sketch (square) and its sketch stage", async ({
  page,
}) => {
  await page.goto("/?file=square.ts");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  // Stages: the extruded result + the solved sketch shown as a face.
  await expect(page.getByTestId("stage-result")).toContainText("extrude");
  await expect(page.getByTestId("stage-sketch")).toContainText("sketch");
  await expect(page.getByTestId("errors")).toBeHidden();
});

test("renders an operator example (hollow revolved bottle)", async ({ page }) => {
  await page.goto("/?file=bottle.ts");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  // result = the shelled bottle; the un-shelled revolve is the "solid" stage.
  await expect(page.getByTestId("stage-result")).toContainText("shell");
  await expect(page.getByTestId("stage-solid")).toContainText("revolve");
  await expect(page.getByTestId("errors")).toBeHidden();
});

test("rounds only the top rim via a face reference", async ({ page }) => {
  await page.goto("/?file=rounded-top.ts");
  await expect.poll(() => meshCount(page), { timeout: 60000 }).toBe(1);
  await expect(page.getByTestId("stage-result")).toContainText("fillet");
  await expect(page.getByTestId("errors")).toBeHidden();
});
