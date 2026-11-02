// THROWAWAY: draws one name's flower for a picture on the page.
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Plant } from "@/components/flower/blossom/Plant";
import { NIGHT_GROUND, Stage } from "@/components/flower/blossom/Stage";
import { buildBlossom } from "@/math/blossom/build";
import { seedOf } from "@/math/blossom/name";
import { emptyPath, placeAt, traceStem } from "@/math/blossom/stem";
import { SPECIES } from "@/math/blossom/species";

const q = new URLSearchParams(location.search);
const name = q.get("name") ?? "Dana";
const night = Number(q.get("night") ?? 0);
const t = Number(q.get("t") ?? 1);
const frame = q.get("frame") ?? "head";
const grower = SPECIES.find((s) => s.id === q.get("grower"));

function NightBackdrop() {
  const scene = useThree((s) => s.scene);
  const colour = useMemo(() => new THREE.Color(NIGHT_GROUND), []);
  useFrame(() => {
    scene.background = colour;
  });
  return null;
}

function ClearBackdrop() {
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    scene.background = null;
  });
  return null;
}

function Aim({ seed }: { seed: string }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const plan = buildBlossom(seed, grower).stem;
    const path = emptyPath();
    traceStem(plan, t, 0, path);
    const tip = placeAt(path, path.length);
    const heart = new THREE.Vector3(tip.x, tip.y, tip.z).addScaledVector(new THREE.Vector3(tip.tx, tip.ty, tip.tz), 0.28);
    if (frame === "first") {
      // What the hero's camera sees at the start, on a screen of this shape.
      const { lerp, smoothstep } = THREE.MathUtils;
      const lookAt = lerp(0.7, 1.62, smoothstep(t, 0.04, 0.5));
      camera.position.set(0, lookAt + 0.7, lerp(5.4, 8.4, smoothstep(t, 0.04, 0.5)));
      camera.lookAt(0, lookAt, 0);
    } else if (frame === "top") {
      camera.position.set(heart.x, heart.y + 1.5, heart.z + 0.7);
      camera.lookAt(heart);
      (camera as THREE.PerspectiveCamera).fov = 24;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else if (frame === "cover") {
      camera.position.set(heart.x - 0.62, heart.y + 0.86, heart.z + 3.5);
      camera.lookAt(heart.x - 0.62, heart.y - 0.02, heart.z);
    } else if (frame === "lamp") {
      camera.position.set(heart.x, heart.y + 0.3, heart.z + 7.4);
      camera.lookAt(heart.x, heart.y - 0.72, heart.z);
    } else if (frame === "thumb") {
      camera.position.set(heart.x, heart.y + 1.3, heart.z + 5.2);
      camera.lookAt(heart);
    } else {
      camera.position.set(heart.x, heart.y + 1, heart.z + 4.6);
      camera.lookAt(heart.x, heart.y - 0.16, heart.z);
    }
  }, [camera, seed]);
  return null;
}

function App() {
  const [seed, setSeed] = useState("");
  useEffect(() => {
    if (grower) setSeed(`grow-${grower.id}-0`);
    else setSeed(seedOf(name));
  }, []);
  useEffect(() => {
    if (seed) setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 3500);
  }, [seed]);
  if (!seed) return null;
  return (
    <Canvas shadows="percentage" camera={{ fov: 30, position: [0, 3, 6] }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }}>
      <Stage glow={{ value: night }} bloom={night > 0} ground={frame === "first"}>
        {night > 0 && <NightBackdrop />}
        {frame === "first" && <ClearBackdrop />}
        <Aim seed={seed} />
        <Plant seed={seed} species={grower} life={{ value: t }} glow={{ value: night }} onHeadReady={() => ((window as unknown as { __head: boolean }).__head = true)} />
      </Stage>
    </Canvas>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
