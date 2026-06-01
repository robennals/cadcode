// `cadcode dev` implementation. Serves the viewer app (via Vite) on top of a
// project directory, and for the file currently being viewed: bundles it + its
// imports, runs it headlessly through the kernel, and live-pushes the resulting
// meshes to the browser over Vite's HMR socket. Re-renders automatically when
// the file or any of its imports change on disk.
import {
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
} from "node:fs";
import { createServer, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep, join, extname } from "node:path";
import { init } from "@cadcode/kernel/oc";
import { runCode } from "@cadcode/runtime/run";
import {
  serializeRunResult,
  RENDER_EVENT,
  SELECT_EVENT,
  type RunResult,
  type SelectMessage,
} from "@cadcode/protocol";
import { bundleFile } from "./bundle";

export function readModelFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeModelFile(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite"]);

/** Recursively list editable model files (.ts, excluding tests and decls). */
export function listModelFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (
        entry.isFile() &&
        extname(entry.name) === ".ts" &&
        !entry.name.endsWith(".d.ts") &&
        !entry.name.endsWith(".test.ts")
      ) {
        out.push(relative(root, full));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** Resolve a project-relative path, rejecting anything that escapes the root. */
export function resolveWithin(root: string, rel: string): string {
  const normRoot = resolve(root);
  const abs = resolve(normRoot, rel);
  if (abs !== normRoot && !abs.startsWith(normRoot + sep)) {
    throw new Error("path escapes root");
  }
  return abs;
}

/** Resolve the dev target into a project root and an optional initial file. */
export function resolveTarget(
  cwd: string,
  target?: string,
): { root: string; initial?: string } {
  if (!target) return { root: cwd };
  const abs = resolve(cwd, target);
  const st = statSync(abs);
  if (st.isDirectory()) return { root: abs };
  return { root: dirname(abs), initial: relative(dirname(abs), abs) };
}

/** When no target is given, prefer an ./examples folder if one exists. */
export function defaultTarget(cwd: string): string | undefined {
  try {
    if (statSync(resolve(cwd, "examples")).isDirectory()) return "examples";
  } catch {
    /* no examples dir */
  }
  return undefined;
}

export async function startDev(
  target?: string,
): Promise<{ url: string; root: string }> {
  const effective = target ?? defaultTarget(process.cwd());
  const { root, initial } = resolveTarget(process.cwd(), effective);
  await init(); // load OpenCascade once for headless rendering

  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../app");
  const server = await createServer({
    root: appRoot,
    plugins: [cadcodePlugin(root, initial)],
  });
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  server.printUrls();
  if (initial) {
    console.log(`\n  Rendering ${initial}`);
    console.log(`  Open ${url}?file=${encodeURIComponent(initial)}\n`);
  }
  return { url, root };
}

function cadcodePlugin(root: string, initial?: string): Plugin {
  return {
    name: "cadcode-server",
    configureServer(server) {
      // --- REST: list files and read a file's contents ---
      server.middlewares.use("/api/files", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ files: listModelFiles(root), initial: initial ?? null }),
        );
      });
      server.middlewares.use("/api/file", (req, res) => {
        const u = new URL(req.originalUrl || req.url || "", "http://localhost");
        const rel = u.searchParams.get("path");
        if (!rel) {
          res.statusCode = 400;
          res.end("missing path");
          return;
        }
        let abs: string;
        try {
          abs = resolveWithin(root, rel);
        } catch {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        if (req.method === "GET") {
          try {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(readModelFile(abs));
          } catch {
            res.statusCode = 404;
            res.end("not found");
          }
          return;
        }
        res.statusCode = 405;
        res.end();
      });

      // --- Live render over the HMR socket ---
      let activeFile: string | null = null;
      let watched = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const render = async () => {
        if (!activeFile) return;
        let absEntry: string;
        try {
          absEntry = resolveWithin(root, activeFile);
        } catch {
          return;
        }
        const bundled = await bundleFile(absEntry);
        const result: RunResult = bundled.error
          ? { hierarchy: [], meshes: [], errors: [bundled.error] }
          : runCode(bundled.code);

        // Watch only the user's own source files (not node_modules).
        const nextWatched = new Set(
          bundled.inputs.filter(
            (p) =>
              p.startsWith(resolve(root) + sep) &&
              !p.includes(`${sep}node_modules${sep}`),
          ),
        );
        for (const p of nextWatched) if (!watched.has(p)) server.watcher.add(p);
        for (const p of watched) if (!nextWatched.has(p)) server.watcher.unwatch(p);
        watched = nextWatched;

        server.ws.send(RENDER_EVENT, {
          file: activeFile,
          result: serializeRunResult(result),
        });
      };
      const scheduleRender = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(render, 80);
      };

      server.ws.on(SELECT_EVENT, (data: SelectMessage) => {
        if (!data?.file) return;
        activeFile = data.file;
        scheduleRender();
      });
      server.watcher.on("change", (file) => {
        if (watched.has(resolve(file))) scheduleRender();
      });
    },
  };
}
