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
  realpathSync,
} from "node:fs";
import { createServer, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, sep, join, extname } from "node:path";
import { init } from "@cadcode/kernel/oc";
import { runCode } from "@cadcode/runtime/run";
import {
  serializeRunResult,
  emptyResult,
  errorMessage,
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

function realpathOr(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p; // path may not exist yet
  }
}

function prefixOk(abs: string, root: string): boolean {
  return abs === root || abs.startsWith(root + sep);
}

/** True if `abs` is inside `root`, checking both the textual path (catches `..`)
 *  and the realpath (catches symlink escapes). */
export function isWithin(root: string, abs: string): boolean {
  const normRoot = resolve(root);
  if (!prefixOk(abs, normRoot)) return false;
  return prefixOk(realpathOr(abs), realpathOr(normRoot));
}

/** Resolve a project-relative path, rejecting anything that escapes the root
 *  (including via symlinks). Returns the logical (non-realpath) absolute path. */
export function resolveWithin(root: string, rel: string): string {
  const normRoot = resolve(root);
  const abs = resolve(normRoot, rel);
  if (!isWithin(normRoot, abs)) {
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
      // Per-file state so multiple viewers (tabs) on different files all work,
      // and so concurrent/rapid renders can't clobber each other:
      //   depsByFile  — the watched input files for each rendered file
      //   genByFile   — a monotonic token per file to drop stale async renders
      //   timers      — per-file debounce
      // (Entries persist for the session; a file viewed once keeps live-reloading
      //  even after its tab closes — acceptable for a local single-user tool.)
      const depsByFile = new Map<string, Set<string>>();
      const genByFile = new Map<string, number>();
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      let currentlyWatched = new Set<string>();

      const reconcileWatch = () => {
        const union = new Set<string>();
        for (const set of depsByFile.values()) for (const p of set) union.add(p);
        for (const p of union) if (!currentlyWatched.has(p)) server.watcher.add(p);
        for (const p of currentlyWatched) if (!union.has(p)) server.watcher.unwatch(p);
        currentlyWatched = union;
      };

      const renderFile = async (file: string) => {
        const gen = (genByFile.get(file) ?? 0) + 1;
        genByFile.set(file, gen);

        let absEntry: string;
        try {
          absEntry = resolveWithin(root, file);
        } catch {
          return;
        }

        let result: RunResult;
        let inputs: string[] | null = null;
        try {
          const bundled = await bundleFile(absEntry);
          if (bundled.error) {
            // Keep the previous watch set on a bundle error, so fixing an
            // imported file still triggers a re-render.
            result = emptyResult([bundled.error]);
          } else {
            result = runCode(bundled.code);
            inputs = bundled.inputs.filter(
              (p) => isWithin(root, p) && !p.includes(`${sep}node_modules${sep}`),
            );
          }
        } catch (e) {
          result = emptyResult([errorMessage(e)]);
        }

        // A newer render for this file superseded us while we awaited — drop.
        if (genByFile.get(file) !== gen) return;

        if (inputs) {
          depsByFile.set(file, new Set(inputs));
          reconcileWatch();
        } else if (!depsByFile.has(file)) {
          // First render failed: at least watch the entry so a fix re-renders.
          depsByFile.set(file, new Set([absEntry]));
          reconcileWatch();
        }
        server.ws.send(RENDER_EVENT, { file, result: serializeRunResult(result) });
      };

      const scheduleRender = (file: string) => {
        const prev = timers.get(file);
        if (prev) clearTimeout(prev);
        timers.set(
          file,
          setTimeout(() => {
            // renderFile catches its own errors; this .catch is a last-resort
            // guard so a render can never become an unhandled rejection.
            renderFile(file).catch((e) =>
              server.ws.send(RENDER_EVENT, {
                file,
                result: serializeRunResult(emptyResult([errorMessage(e)])),
              }),
            );
          }, 80),
        );
      };

      server.ws.on(SELECT_EVENT, (data: SelectMessage) => {
        if (data?.file) scheduleRender(data.file);
      });
      server.watcher.on("change", (file) => {
        const abs = resolve(file);
        for (const [f, deps] of depsByFile) if (deps.has(abs)) scheduleRender(f);
      });
    },
  };
}
