// `cadcode dev` implementation: starts a Vite server for the app and exposes the
// chosen model file over /api/file (GET reads it with an X-Cadcode-Model marker,
// POST writes edits back to disk). Also exports the file read/write helpers.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export function readModelFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeModelFile(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}

/** Start the Vite dev server for the app, exposing the given model file over
 *  /api/file (GET/POST). Returns the resolved local URL. */
export async function startDev(modelPath: string): Promise<string> {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../app");
  const server = await createServer({
    root: appRoot,
    plugins: [
      {
        name: "cadcode-file-api",
        configureServer(s) {
          s.middlewares.use("/api/file", (req, res) => {
            if (req.method === "GET") {
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              // Distinguishes a real model file from Vite's SPA fallback HTML.
              res.setHeader("X-Cadcode-Model", "1");
              res.end(readModelFile(modelPath));
              return;
            }
            if (req.method === "POST") {
              let body = "";
              req.on("data", (c) => (body += c));
              req.on("end", () => {
                writeModelFile(modelPath, body);
                res.statusCode = 204;
                res.end();
              });
              return;
            }
            res.statusCode = 405;
            res.end();
          });
        },
      },
    ],
  });
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  server.printUrls();
  return url;
}
