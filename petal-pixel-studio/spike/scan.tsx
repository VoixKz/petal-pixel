// THROWAWAY: look at the scans from three sides to find their axes.
import { Suspense, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";

const draco = new DRACOLoader().setDecoderPath("/draco/");

function Scan({ url, view }: { url: string; view: number[] }) {
  const gltf = useLoader(GLTFLoader, url, (l) => (l as GLTFLoader).setDRACOLoader(draco));
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  useEffect(() => { console.log(url, JSON.stringify({ size, centre, min: box.min, max: box.max })); }, []);
  const s = 2 / Math.max(size.x, size.y, size.z);
  return (
    <group scale={s}>
      <group position={[-centre.x, -centre.y, -centre.z]}><primitive object={scene} /></group>
    </group>
  );
}

const VIEWS = [[0, 0, 4], [4, 0, 0], [0, 4, 0.01]];
function App() {
  useEffect(() => { setTimeout(() => ((window as any).__ready = true), 5000); }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "1fr 1fr" }}>
      {["/models/lycaste.glb", "/models/embreea.glb"].flatMap((u) => VIEWS.map((v, i) => (
        <div key={u + i} style={{ background: "#eee", position: "relative" }}>
          <Canvas camera={{ position: v as [number, number, number], fov: 40 }} gl={{ preserveDrawingBuffer: true, toneMapping: 0 }}>
            <ambientLight intensity={2} /><directionalLight position={[2, 3, 4]} intensity={2} />
            <axesHelper args={[1.3]} />
            <Suspense fallback={null}><Scan url={u} view={v} /></Suspense>
          </Canvas>
          <span style={{ position: "absolute", top: 4, left: 6, font: "12px system-ui" }}>{u} from {v.join(",")}</span>
        </div>
      )))}
    </div>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<App />);
