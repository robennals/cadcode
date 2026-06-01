// three.js viewport: sets up scene/camera/lights once, then rebuilds the meshes
// (with a slow auto-rotate) whenever the body meshes change. Exposes
// data-mesh-count for the smoke test.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { BodyMesh } from "@cadcode/protocol";

interface SceneState {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
}

export function Viewport({ meshes }: { meshes: BodyMesh[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);
    const camera = new THREE.PerspectiveCamera(
      50,
      el.clientWidth / el.clientHeight,
      0.1,
      5000,
    );
    camera.position.set(60, 60, 60);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(50, 80, 30);
    scene.add(dir);
    const group = new THREE.Group();
    scene.add(group);
    state.current = { scene, renderer, camera, group };

    let raf = 0;
    const animate = () => {
      group.rotation.y += 0.005;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.group.clear();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f9dde,
      metalness: 0.1,
      roughness: 0.6,
    });
    for (const m of meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      s.group.add(new THREE.Mesh(g, mat));
    }
  }, [meshes]);

  return (
    <div
      ref={ref}
      style={{ width: "100%", height: "100%" }}
      data-testid="viewport"
      data-mesh-count={meshes.length}
    />
  );
}
