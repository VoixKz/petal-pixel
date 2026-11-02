// THROWAWAY: a contact sheet of every species at one moment of life.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Plant } from "@/components/flower/blossom/Plant";
import { Stage } from "@/components/flower/blossom/Stage";
import { SPECIES } from "@/math/blossom/species";
import { GROWERS, type Grower } from "@/pages/landing/growers";
import type { ScanSource } from "@/components/flower/blossom/Scan";

const q = new URLSearchParams(location.search);
const life = { value: Number(q.get("t") ?? 1) };
const glow = { value: Number(q.get("night") ?? 0) };
const close = q.get("close") === "1";
const mid = q.get("mid") === "1";
const salt = q.get("s") ?? "sheet";
const only = q.get("only");
const list = only ? SPECIES.filter((s) => only.split(",").includes(s.id)) : SPECIES;
const columns = Number(q.get("cols") ?? (only ? list.length : 4));

const strip = q.get("strip");
const SCANS: Record<string, ScanSource> = {
  lycaste: { url: "/models/lycaste.glb", heart: [0, -0.02, -0.3], face: [-Math.PI / 2, 0, 0], stalkBelow: [9, -0.34, -0.25], nod: 1.16 },
  embreea: { url: "/models/embreea.glb", heart: [0, 0.2, -0.24], face: [-Math.PI / 2, 0, 0], stalkBelow: [9, 9, -0.42], nod: 1.16, tint: ["#e6d49a", "#fdf4dc"] },
};
const STAGES = [0.04, 0.14, 0.26, 0.38, 0.5, 0.58, 0.66, 0.74, 0.86, 1];

const thumb = GROWERS.find((g) => g.id === q.get("thumb"));

function Thumb() {
  const grower = thumb as Grower;
  useEffect(() => {
    setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 3500);
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas shadows="percentage" camera={{ position: [0, 3.5, 4.3], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 2.25, 0)} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: 0 }}>
        <Stage glow={glow} ground={false}>
          <Plant seed={`grow-${grower.id}-0`} species={grower.species} scan={grower.scan} life={life} glow={glow} />
        </Stage>
      </Canvas>
    </div>
  );
}

function Strip() {
  const species = SPECIES.find((s) => s.id === strip) ?? SPECIES[0];
  useEffect(() => {
    setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 3000);
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(2, 1fr)" }}>
      {STAGES.map((t) => (
        <div key={t} style={{ position: "relative" }}>
          <Canvas shadows="percentage" camera={{ position: [0, 2.4, 7.2], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 1.7, 0)} gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: 0 }}>
            <Stage glow={glow} bloom={glow.value > 0}>
              <Plant seed={`${salt}-${species.id}`} species={species} scan={SCANS[strip as string]} life={{ value: t }} glow={glow} />
            </Stage>
          </Canvas>
          <span style={{ position: "absolute", left: 8, top: 6, font: "12px system-ui", color: glow.value > 0.5 ? "#fff" : "#000" }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function App() {
  useEffect(() => {
    setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 3000);
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(list.length / columns)}, 1fr)` }}>
      {list.map((s) => (
        <div key={s.id} style={{ position: "relative" }}>
          <Canvas shadows="percentage" camera={{ position: close ? [0, 3.3, 4.5] : mid ? [0, 1.5, 4.4] : [0, 2, 7.6], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, close ? 2.4 : mid ? 1.15 : 1.6, 0)} gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: 0 }}>
            <Stage glow={glow} bloom={glow.value > 0}>
              <Plant seed={`${salt}-${s.id}`} species={s} life={life} glow={glow} />
            </Stage>
          </Canvas>
          <span style={{ position: "absolute", left: 10, top: 8, font: "13px system-ui", color: glow.value > 0.5 ? "#fff" : "#000" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(thumb ? <Thumb /> : strip ? <Strip /> : <App />);
