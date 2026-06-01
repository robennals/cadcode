// Top-level viewer UI, Storybook-style: a persistent sidebar lists every model
// file in the project; clicking one renders it in the main area. The browser
// never edits or executes models — you edit files in your own editor. This app
// tells the `cadcode dev` server which file to render (chosen by the ?file= URL
// param or the sidebar) and displays the meshes + hierarchy the server
// live-pushes over Vite's HMR socket whenever that file (or its imports) change.
// Rendering is lazy: only the selected file is ever built.
import { useEffect, useRef, useState } from "react";
import {
  deserializeRunResult,
  RENDER_EVENT,
  SELECT_EVENT,
  type RunResult,
  type RenderMessage,
} from "@cadcode/protocol";
import { Viewport } from "./Viewport";

const EMPTY: RunResult = { hierarchy: [], meshes: [], errors: [] };

type Status = "connecting" | "live" | "no-server";

function fileFromUrl(): string | null {
  return new URLSearchParams(location.search).get("file");
}

function setUrlFile(file: string | null, replace: boolean) {
  const u = new URL(location.href);
  if (file) u.searchParams.set("file", file);
  else u.searchParams.delete("file");
  history[replace ? "replaceState" : "pushState"]({}, "", u);
}

export function App() {
  const [result, setResult] = useState<RunResult>(EMPTY);
  const [files, setFiles] = useState<string[]>([]);
  const [file, setFile] = useState<string | null>(fileFromUrl());
  const [status, setStatus] = useState<Status>("connecting");
  const fileRef = useRef<string | null>(file);
  fileRef.current = file;

  // Discover available files. Open the URL's file, else the server's initial
  // file (when `cadcode dev <file>` targeted one), else show the index.
  useEffect(() => {
    (async () => {
      let resp: Response | null = null;
      try {
        resp = await fetch("/api/files");
      } catch {
        resp = null;
      }
      const isJson =
        resp?.ok && (resp.headers.get("content-type") || "").includes("application/json");
      if (!resp || !isJson) {
        setStatus("no-server");
        return;
      }
      const data: { files: string[]; initial: string | null } = await resp.json();
      setFiles(data.files);
      setStatus("live");
      const chosen = fileFromUrl() || data.initial || null;
      if (chosen) {
        if (chosen !== fileFromUrl()) setUrlFile(chosen, true);
        setFile(chosen);
      }
    })();
  }, []);

  // Render channel: apply meshes the server pushes for the file we're viewing.
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) {
      setStatus("no-server");
      return;
    }
    const onRender = (msg: RenderMessage) => {
      if (msg.file !== fileRef.current) return;
      setResult(deserializeRunResult(msg.result));
    };
    hot.on(RENDER_EVENT, onRender);
    return () => hot.off(RENDER_EVENT, onRender);
  }, []);

  // Tell the server which file to render; keep the tab title in sync.
  useEffect(() => {
    document.title = file ? `${file} — cadcode` : "cadcode";
    setResult(EMPTY);
    if (!file) return;
    import.meta.hot?.send(SELECT_EVENT, { file });
  }, [file]);

  // Honour browser back/forward between files.
  useEffect(() => {
    const onPop = () => setFile(fileFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pickFile = (f: string) => {
    if (f === file) return;
    setUrlFile(f, false);
    setFile(f);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "210px 1fr",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#1e1e1e",
      }}
    >
      <Sidebar files={files} active={file} status={status} onPick={pickFile} />
      <Main file={file} status={status} result={result} hasFiles={files.length > 0} />
    </div>
  );
}

function Sidebar({
  files,
  active,
  status,
  onPick,
}: {
  files: string[];
  active: string | null;
  status: Status;
  onPick: (f: string) => void;
}) {
  return (
    <div
      data-testid="file-list"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderRight: "1px solid #333",
        background: "#252526",
        color: "#ccc",
        font: "13px system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          fontWeight: 700,
          color: "#fff",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        cadcode
        <StatusDot status={status} />
      </div>
      <div style={{ overflow: "auto", padding: "6px 0", flex: 1, minHeight: 0 }}>
        {files.length === 0 ? (
          <div style={{ padding: "6px 12px", color: "#777" }}>
            {status === "no-server" ? "no server" : "no model files"}
          </div>
        ) : (
          files.map((f) => {
            const isActive = f === active;
            return (
              <button
                key={f}
                onClick={() => onPick(f)}
                aria-current={isActive ? "page" : undefined}
                title={f}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 12px",
                  border: "none",
                  borderLeft: `3px solid ${isActive ? "#4f9dde" : "transparent"}`,
                  background: isActive ? "#37373d" : "transparent",
                  color: isActive ? "#fff" : "#bbb",
                  font: "12px monospace",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {f}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Main({
  file,
  status,
  result,
  hasFiles,
}: {
  file: string | null;
  status: Status;
  result: RunResult;
  hasFiles: boolean;
}) {
  if (status === "no-server") {
    return (
      <Placeholder
        title="No cadcode server"
        body="Run `cadcode dev <file-or-dir>` in your project, then reload."
      />
    );
  }
  if (!file) {
    return (
      <Placeholder
        title="Select a model file"
        body={
          hasFiles
            ? "Pick a file from the sidebar to render its model."
            : "No .ts model files found in this project."
        }
      />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          padding: "6px 12px",
          background: "#2d2d30",
          borderBottom: "1px solid #3a3a3a",
          color: "#e6e6e6",
          font: "13px system-ui, sans-serif",
        }}
      >
        <span style={{ color: "#9aa4ad", flexShrink: 0 }}>rendering</span>
        <span
          data-testid="file-name-current"
          title={file}
          style={{
            fontFamily: "monospace",
            color: "#cfe3ff",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {file}
        </span>
        <span style={{ flex: 1 }} />
        <StatusDot status={status} hasErrors={result.errors.length > 0} withText />
      </div>

      <Viewport key={file} meshes={result.meshes} />

      <div style={{ minWidth: 0 }}>
        {result.errors.length > 0 ? (
          <div
            data-testid="errors"
            style={{
              maxHeight: 120,
              overflow: "auto",
              background: "#3a1d1d",
              color: "#ff9a9a",
              fontFamily: "monospace",
              fontSize: 12,
              padding: "6px 10px",
              borderTop: "1px solid #5a2a2a",
            }}
          >
            {result.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        ) : (
          <div data-testid="errors" style={{ display: "none" }} />
        )}
        <div
          data-testid="tree"
          style={{
            maxHeight: 150,
            overflow: "auto",
            background: "#252526",
            color: "#ccc",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 6,
            borderTop: "1px solid #333",
          }}
        >
          {result.hierarchy.length === 0 ? (
            <span style={{ color: "#777" }}>No bodies yet.</span>
          ) : (
            result.hierarchy.map((n) => (
              <div key={n.id} style={{ opacity: n.alive ? 1 : 0.5 }}>
                {n.alive ? "● " : "○ "}
                {n.label} <span style={{ color: "#666" }}>{n.id}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-testid="placeholder"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: "100%",
        color: "#888",
        font: "14px system-ui, sans-serif",
        padding: 20,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 16, color: "#bbb" }}>{title}</div>
      <div style={{ fontFamily: "monospace", fontSize: 12 }}>{body}</div>
    </div>
  );
}

function StatusDot({
  status,
  hasErrors,
  withText,
}: {
  status: Status;
  hasErrors?: boolean;
  withText?: boolean;
}) {
  const color =
    status === "no-server"
      ? "#888"
      : hasErrors
        ? "#e06c6c"
        : status === "live"
          ? "#5fbf6f"
          : "#d6b25e";
  const text =
    status === "no-server" ? "no server" : hasErrors ? "error" : status === "live" ? "live" : "…";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      {withText && <span style={{ color: "#9aa4ad", fontSize: 12 }}>{text}</span>}
    </span>
  );
}
