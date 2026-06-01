// three.js viewport: sets up scene/camera/lights/grid once and rebuilds the
// body meshes whenever they change. Navigation uses OrbitControls (mouse,
// touchpad, touch) plus viewport-scoped keyboard controls and on-screen
// widgets for rotate / pan / zoom / fit. Exposes data-mesh-count for tests.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BodyMesh } from "@cadcode/protocol";

/** Imperative camera operations the widgets and keyboard drive. */
interface ViewApi {
  rotate(dTheta: number, dPhi: number): void;
  pan(dx: number, dy: number): void;
  dolly(factor: number): void;
  fitView(): void;
  /** Request a render (e.g. after the meshes change). */
  invalidate(): void;
}

export function Viewport({ meshes }: { meshes: BodyMesh[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const apiRef = useRef<ViewApi | null>(null);
  const framedRef = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const host = hostRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      10000,
    );
    camera.position.set(60, 60, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    // Key light from the front-top, plus a dimmer fill light from the opposite
    // side so faces aren't left in the dark when you rotate to the back.
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(50, 80, 30);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-50, -30, -40);
    scene.add(fillLight);

    // Orientation aids — help perceive pan/zoom/rotate.
    const grid = new THREE.GridHelper(400, 40, 0x444444, 0x2c2c2c);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(30));

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = true; // intuitive touchpad/scroll zoom
    controls.screenSpacePanning = true;
    // Mouse: left = rotate, right = pan, middle = zoom (OrbitControls defaults).
    // Touch: one finger = rotate, two fingers = zoom + pan.
    controls.target.set(0, 0, 0);

    // --- On-demand rendering ---
    // Instead of a permanent 60fps loop, render only while something is moving.
    // controls.update() returns true while the (damped) camera is still
    // settling, so we keep looping until it reports no change, then stop.
    let raf = 0;
    let looping = false;
    const frame = () => {
      const changed = controls.update();
      renderer.render(scene, camera);
      if (changed) {
        raf = requestAnimationFrame(frame);
      } else {
        looping = false;
      }
    };
    const requestRender = () => {
      if (looping) return;
      looping = true;
      raf = requestAnimationFrame(frame);
    };
    // OrbitControls emits "change" on every camera move (user input, damping,
    // and our imperative helpers' controls.update()), which drives rendering.
    controls.addEventListener("change", requestRender);

    // --- Imperative helpers driven by widgets + keyboard ---
    const sph = new THREE.Spherical();
    const rotate = (dTheta: number, dPhi: number) => {
      const offset = camera.position.clone().sub(controls.target);
      sph.setFromVector3(offset);
      sph.theta -= dTheta;
      sph.phi = Math.max(0.001, Math.min(Math.PI - 0.001, sph.phi - dPhi));
      offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    const dolly = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(factor);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    const pan = (dx: number, dy: number) => {
      const distance = camera.position.clone().sub(controls.target).length();
      const scale = (distance * 0.0012) || 0.1;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const move = right
        .multiplyScalar(-dx * scale)
        .add(up.multiplyScalar(dy * scale));
      camera.position.add(move);
      controls.target.add(move);
      controls.update();
    };
    const fitView = () => {
      const box = new THREE.Box3();
      group.children.forEach((c) => box.expandByObject(c));
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = (camera.fov * Math.PI) / 180;
      const dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.8;
      controls.target.copy(center);
      const dir = new THREE.Vector3(1, 0.8, 1).normalize();
      camera.position.copy(center).add(dir.multiplyScalar(dist));
      camera.near = Math.max(dist / 1000, 0.01);
      camera.far = dist * 1000;
      camera.updateProjectionMatrix();
      controls.update();
    };
    apiRef.current = { rotate, pan, dolly, fitView, invalidate: requestRender };
    requestRender(); // first frame

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      requestRender();
    };
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      // Free GPU buffers for every geometry/material in the scene (renderer
      // .dispose() does not traverse the scene graph).
      scene.traverse((o) => {
        const mesh = o as Partial<THREE.Mesh>;
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material | undefined)?.dispose?.();
      });
      materialRef.current?.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      apiRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Dispose the previous frame's GPU buffers before replacing them.
    for (const child of group.children) {
      (child as THREE.Mesh).geometry?.dispose();
    }
    group.clear();
    materialRef.current?.dispose();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f9dde,
      metalness: 0.1,
      roughness: 0.6,
      // Render both sides so hollow/open shapes (shells, funnels) don't look
      // cut-through where you see their interior walls.
      side: THREE.DoubleSide,
    });
    materialRef.current = mat;
    for (const m of meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      group.add(new THREE.Mesh(g, mat));
    }
    // Frame the model the first time geometry appears.
    if (!framedRef.current && meshes.length > 0) {
      apiRef.current?.fitView();
      framedRef.current = true;
    }
    // New geometry needs a render even when the camera hasn't moved.
    apiRef.current?.invalidate();
  }, [meshes]);

  // Press-and-hold support so buttons repeat while held.
  const stopHold = () => {
    if (holdTimer.current != null) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  };
  // Stop any in-progress hold if the component unmounts (e.g. file switch)
  // before pointerup fires, so the interval can't leak.
  useEffect(() => stopHold, []);
  const hold = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      fn();
      stopHold();
      holdTimer.current = window.setInterval(fn, 60);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const api = apiRef.current;
    if (!api) return;
    const ROT = 0.14;
    const PAN = 40;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        e.shiftKey ? api.pan(-PAN, 0) : api.rotate(-ROT, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        e.shiftKey ? api.pan(PAN, 0) : api.rotate(ROT, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.shiftKey ? api.pan(0, PAN) : api.rotate(0, ROT);
        break;
      case "ArrowDown":
        e.preventDefault();
        e.shiftKey ? api.pan(0, -PAN) : api.rotate(0, -ROT);
        break;
      case "+":
      case "=":
        e.preventDefault();
        api.dolly(0.9);
        break;
      case "-":
      case "_":
        e.preventDefault();
        api.dolly(1.1);
        break;
      case "0":
      case "Home":
        e.preventDefault();
        api.fitView();
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="viewport"
      data-mesh-count={meshes.length}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // Allow the grid row to shrink instead of overflowing on small windows.
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        outline: "none",
      }}
    >
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <style>{CONTROL_CSS}</style>

      <div className="cc-hint">
        drag rotate · scroll zoom · right-drag pan · click viewport then use arrows / ± / 0
      </div>

      <div className="cc-controls">
        <div className="cc-dpad" role="group" aria-label="Rotate view">
          <button
            className="cc-btn cc-n"
            aria-label="Rotate up"
            title="Rotate up (↑)"
            {...hold(() => apiRef.current?.rotate(0, 0.14))}
          >
            ▲
          </button>
          <button
            className="cc-btn cc-w"
            aria-label="Rotate left"
            title="Rotate left (←)"
            {...hold(() => apiRef.current?.rotate(-0.14, 0))}
          >
            ◀
          </button>
          <button
            className="cc-btn cc-fit cc-center"
            aria-label="Fit view"
            title="Fit view (0)"
            onClick={() => apiRef.current?.fitView()}
          >
            ⤢
          </button>
          <button
            className="cc-btn cc-e"
            aria-label="Rotate right"
            title="Rotate right (→)"
            {...hold(() => apiRef.current?.rotate(0.14, 0))}
          >
            ▶
          </button>
          <button
            className="cc-btn cc-s"
            aria-label="Rotate down"
            title="Rotate down (↓)"
            {...hold(() => apiRef.current?.rotate(0, -0.14))}
          >
            ▼
          </button>
        </div>

        <div className="cc-zoom" role="group" aria-label="Zoom">
          <button
            className="cc-btn"
            aria-label="Zoom in"
            title="Zoom in (+)"
            {...hold(() => apiRef.current?.dolly(0.92))}
          >
            ＋
          </button>
          <button
            className="cc-btn"
            aria-label="Zoom out"
            title="Zoom out (−)"
            {...hold(() => apiRef.current?.dolly(1.08))}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

const CONTROL_CSS = `
.cc-hint {
  position: absolute; top: 8px; left: 10px; right: 10px;
  color: #9aa4ad; font: 11px/1.4 system-ui, sans-serif;
  pointer-events: none; user-select: none; text-shadow: 0 1px 2px #000;
}
.cc-controls {
  position: absolute; right: 14px; bottom: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.cc-dpad {
  display: grid; gap: 4px;
  grid-template-columns: repeat(3, 34px);
  grid-template-rows: repeat(3, 34px);
}
.cc-n { grid-column: 2; grid-row: 1; }
.cc-w { grid-column: 1; grid-row: 2; }
.cc-center { grid-column: 2; grid-row: 2; }
.cc-e { grid-column: 3; grid-row: 2; }
.cc-s { grid-column: 2; grid-row: 3; }
.cc-zoom { display: flex; flex-direction: column; gap: 4px; }
.cc-btn {
  width: 34px; height: 34px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(40, 42, 46, 0.85); color: #e6e6e6;
  border: 1px solid #4a4d52; border-radius: 7px;
  font-size: 14px; line-height: 1; cursor: pointer;
  pointer-events: auto; user-select: none;
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  transition: background 0.12s, border-color 0.12s, transform 0.06s;
}
.cc-btn:hover { background: rgba(60, 110, 170, 0.9); border-color: #6ea8e0; }
.cc-btn:active { transform: scale(0.92); }
.cc-fit { font-size: 16px; color: #cfe3ff; }
`;
