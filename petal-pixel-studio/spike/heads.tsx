// THROWAWAY: every real head at several moments, under the page's own light.
import { Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Head } from "@/components/flower/blossom/Head";
import { Stage } from "@/components/flower/blossom/Stage";

const q = new URLSearchParams(location.search);
const ids = (q.get("ids") ?? "rose,water-lily,peony,camellia,hibiscus").split(",");
const night = Number(q.get("night") ?? 0);
const lifes = [0.48, 0.58, 0.64, 0.8];
const CELL = 2.7;
const DAY = { value: 0 };
const NIGHT = { value: 1 };
const lamp = new THREE.Color("#ffcf9e");
const plain = { hue: 0, saturation: 1, value: 1 };

function Aim() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const across = ((lifes.length - 1) * CELL) / 2;
    const down = ((ids.length - 1) * CELL) / 2;
    const far = Math.max(lifes.length, ids.length) * CELL * 2.0;
    camera.position.set(across, -down + 0.9 + far * 0.32, far);
    camera.lookAt(across, -down + 0.9, 0);
  }, [camera]);
  return null;
}

function Grid() {
  const glow = night ? NIGHT : DAY;
  return (
    <Stage glow={glow} ground={false}>
      <Aim />
      <Suspense fallback={null}>
        {ids.map((id, row) =>
          lifes.map((value, col) => (
            <group key={`${id}${col}`} position={[col * CELL, -row * CELL, 0]}>
              <Head
                source={{ url: `/models/heads/${id}.glb`, top: Number(q.get(id) ?? 1.3), closed: 0.46, twist: 0.9, bud: 0.8, size: 1, neck: 0, kept: 0.93, credit: { by: "", url: "", licence: "CC0" } }}
                tint={plain}
                fullness={1}
                turn={0}
                life={{ value }}
                glow={glow}
                lamp={lamp}
                onReady={() => document.body.setAttribute("data-ready", "1")}
              />
            </group>
          )),
        )}
      </Suspense>
    </Stage>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <Canvas shadows camera={{ fov: 30 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }} dpr={1}>
    <Grid />
  </Canvas>,
);
