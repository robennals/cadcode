import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Run the real `cadcode dev` server against the test fixtures, so the e2e tests
// exercise the full pipeline: server bundles + renders -> pushes to the viewer.
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "pnpm cadcode dev packages/app/tests/fixtures/box.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
