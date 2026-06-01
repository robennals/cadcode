// Top-level UI: Monaco editor (left) + 3D viewport and hierarchy tree (right).
// Owns the worker, debounces edits into "run" messages, renders results and
// errors, and (when launched via the CLI) syncs the source file over /api/file.
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { WorkerResponse, RunResult } from "@cadcode/protocol";
import { Viewport } from "./Viewport";
import { DEFAULT_MODEL } from "./defaultModel";
import { CADCODE_DTS } from "./dts";

const EMPTY: RunResult = { hierarchy: [], meshes: [], errors: [] };

export function App() {
  const [source, setSource] = useState(DEFAULT_MODEL);
  const [result, setResult] = useState<RunResult>(EMPTY);
  const worker = useMemo(
    () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    [],
  );

  useEffect(() => {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === "result") setResult(e.data.result);
      else setResult({ hierarchy: [], meshes: [], errors: [e.data.message] });
    };
    return () => worker.terminate();
  }, [worker]);

  // Hydrate from the CLI file API if present. When served standalone, Vite's
  // SPA fallback answers /api/file with index.html (text/html); the CLI server
  // marks real model files with X-Cadcode-Model, so we only accept those.
  useEffect(() => {
    fetch("/api/file")
      .then((r) => (r.ok && r.headers.get("x-cadcode-model") ? r.text() : null))
      .then((t) => {
        if (t) setSource(t);
      })
      .catch(() => {});
  }, []);

  // Persist back to the CLI file API if present.
  useEffect(() => {
    const id = setTimeout(() => {
      fetch("/api/file", { method: "POST", body: source }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [source]);

  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => worker.postMessage({ type: "run", source }),
      300,
    );
  }, [source, worker]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #333",
          // Without min-width:0 the Monaco editor refuses to shrink and pushes
          // the right-hand column off-screen on narrow windows.
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Editor
            defaultLanguage="typescript"
            value={source}
            theme="vs-dark"
            onChange={(v) => setSource(v ?? "")}
            beforeMount={(monaco) => {
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                CADCODE_DTS,
                "cadcode-globals.d.ts",
              );
              monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                noLib: false,
                allowNonTsExtensions: true,
              });
            }}
          />
        </div>
        <div
          data-testid="errors"
          style={{
            height: 80,
            flexShrink: 0,
            overflow: "auto",
            background: "#2a1a1a",
            color: "#f88",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 6,
          }}
        >
          {result.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          // viewport (1fr) shrinks first; the tree (auto) keeps its size, so the
          // hierarchy browser stays on-screen even when the window is short.
          gridTemplateRows: "1fr auto",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Viewport meshes={result.meshes} />
        <div
          data-testid="tree"
          style={{
            maxHeight: 160,
            flexShrink: 0,
            borderTop: "1px solid #333",
            overflow: "auto",
            background: "#252526",
            color: "#ccc",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 6,
          }}
        >
          {result.hierarchy.map((n) => (
            <div key={n.id} style={{ opacity: n.alive ? 1 : 0.5 }}>
              {n.alive ? "● " : "○ "}
              {n.label} <span style={{ color: "#666" }}>{n.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
