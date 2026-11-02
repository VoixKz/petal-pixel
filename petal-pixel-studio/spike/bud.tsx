// THROWAWAY SPIKE, open at /spike/bud.html. Not part of the app.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { createFlowerViaGrpc } from "@/integrations/flowerBackend/client";
import { buildV2Geometry, toV2Params, type V2Params } from "@/math/flowerGeometry";
import { paletteHighlightHex } from "@/components/flower/Flower3D";
import { BUD, bakeFlower, foldedMaterial, grow, type BakedFlower } from "./budFold";

const BG = "#14141c";
const NINE = [
  ["rose", "Ben"],
  ["camellia", "Anna"],
  ["lotus", "Zara"],
  ["dahlia", "Dana"],
  ["zinnia", "Oleg"],
  ["classic", "Maria"],
  ["sunflower", "Sofia"],
  ["rhodonea", "Omar"],
  ["superformula", "Alina"],
] as const;

interface Loaded extends BakedFlower {
  family: string;
  name: string;
  material: THREE.MeshPhysicalMaterial;
}

// Reloads must not burn through the backend's per-IP limit.
async function fetchParams(name: string): Promise<V2Params> {
  const key = `spike-bud:${name}`;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached) as V2Params;
  const response = await createFlowerViaGrpc(name);
  if (!response.params) throw new Error("empty params");
  const v2 = toV2Params(response.params);
  localStorage.setItem(key, JSON.stringify(v2));
  return v2;
}

async function loadFlower(name: string): Promise<Loaded> {
  const v2 = await fetchParams(name);
  const raw = buildV2Geometry(v2);
  const baked = bakeFlower(raw, v2.family);
  raw.dispose();
  return {
    ...baked,
    family: v2.family,
    name,
    material: foldedMaterial(paletteHighlightHex(v2.palette, "#ffffff"), baked.alphaMax, baked.floor),
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

function Flower({ flower, x, y, spin, scale = 1 }: { flower: Loaded; x: number; y: number; spin: boolean; scale?: number }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const w = window as unknown as { __frames?: number[] };
    w.__frames ??= [];
    if (w.__frames.length < 3) w.__frames.push(Math.round(performance.now()));
    const t = ease(grow.value);
    if (outer.current) {
      outer.current.rotation.x = THREE.MathUtils.lerp(0.1, 0.72, t);
      outer.current.position.set(x, y - THREE.MathUtils.lerp(BUD.height / 2, flower.openCentreY, t) * scale, 0);
    }
    if (inner.current && spin) inner.current.rotation.y += dt * 0.18;
  });
  return (
    <group ref={outer} scale={scale}>
      <group ref={inner}>
        <mesh geometry={flower.geometry} material={flower.material} frustumCulled={false} />
      </group>
    </group>
  );
}

function Lights() {
  return (
    <>
      <color attach="background" args={[BG]} />
      <hemisphereLight args={["#fff4e6", "#1a1a24", 0.6]} />
      <directionalLight position={[5, 6, 5]} intensity={1.2} />
      <pointLight position={[-2, -1, 2]} intensity={0.5} color="#7c8cff" />
      <directionalLight position={[-4, 4, -6]} intensity={0.7} color="#bcd4ff" />
      <Environment resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={2.2} color="#fff2e0" position={[0, 4, -4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#bcd4ff" position={[-5, 1, 2]} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffd9b0" position={[4, 3, 3]} scale={3} />
      </Environment>
      <EffectComposer>
        <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.3} mipmapBlur intensity={0.8} />
        <Vignette eskil={false} offset={0.35} darkness={0.5} />
      </EffectComposer>
    </>
  );
}

const CELL = 2.5;

function GridFlowers({ flowers, spin }: { flowers: Loaded[]; spin: boolean }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const zoom = size.height / (3 * CELL);
  useEffect(() => {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [camera, zoom]);
  const cellWidth = size.width / zoom / 3;
  return (
    <>
      {flowers.map((flower, i) => (
        <Flower
          key={flower.family}
          flower={flower}
          x={((i % 3) - 1) * cellWidth}
          y={(1 - Math.floor(i / 3)) * CELL}
          spin={spin}
          scale={Math.min(1, cellWidth / 2.4)}
        />
      ))}
    </>
  );
}

const Grid = memo(function Grid({ flowers, spin, onPick }: { flowers: Loaded[]; spin: boolean; onPick: (f: Loaded) => void }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas orthographic camera={{ position: [0, 0, 10], near: 0.1, far: 40 }} gl={{ antialias: true, alpha: false, toneMappingExposure: 1.3 }}>
        <Lights />
        <GridFlowers flowers={flowers} spin={spin} />
      </Canvas>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplate: "repeat(3, 1fr) / repeat(3, 1fr)" }}>
        {flowers.map((flower) => (
          <button key={flower.family} onClick={() => onPick(flower)} style={cellButton}>
            {flower.family} · {flower.name}
          </button>
        ))}
      </div>
    </div>
  );
});

const Single = memo(function Single({ flower, spin }: { flower: Loaded; spin: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas camera={{ position: [0, 0.2, 4], fov: 40 }} gl={{ antialias: true, alpha: false, toneMappingExposure: 1.3 }}>
        <Lights />
        <Flower flower={flower} x={0} y={0} spin={spin} />
        <OrbitControls enablePan={false} minDistance={1.5} maxDistance={9} />
      </Canvas>
    </div>
  );
});

function App() {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const [flowers, setFlowers] = useState<Loaded[]>([]);
  const [picked, setPicked] = useState<Loaded | null>(null);
  const [t, setT] = useState(() => Number(query.get("t") ?? 0));
  const [playing, setPlaying] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const spin = query.get("spin") !== "0";

  // Every view is its own page load, which keeps this throwaway page simple.
  useEffect(() => {
    const target = query.get("name") ?? NINE.find(([family]) => family === query.get("one"))?.[1];
    const work = target
      ? loadFlower(target).then(setPicked)
      : Promise.all(NINE.map(([, n]) => loadFlower(n))).then((list) => {
          (window as unknown as { __loaded?: number }).__loaded = Math.round(performance.now());
          setFlowers(list);
        });
    work.catch((e) => setProblem(String(e)));
  }, [query]);

  useEffect(() => {
    grow.value = t;
  }, [t]);

  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min((now - started) / 6000, 1);
      setT(next);
      if (next < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const go = useCallback((search: Record<string, string>) => {
    location.search = new URLSearchParams({ ...search, t: String(grow.value) }).toString();
  }, []);
  const pick = useCallback((f: Loaded) => go({ one: f.family }), [go]);
  const tryName = () => {
    if (name.trim()) go({ name: name.trim() });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: "#e8e6f0", font: "14px system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 16px", flexWrap: "wrap" }}>
        <b>Черновик: бутон → цветок</b>
        <span style={{ opacity: 0.6 }}>временная страница, в приложение не войдёт</span>
        <span style={{ flex: 1 }} />
        {picked && <button onClick={() => go({})} style={barButton}>← Все 9</button>}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryName()}
          placeholder="Своё имя и Enter"
          style={{ background: "#22222c", color: "inherit", border: "1px solid #3a3a48", borderRadius: 6, padding: "6px 10px" }}
        />
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {flowers.length === 0 && !picked && !problem && <p style={{ padding: 16 }}>Загружаю цветы…</p>}
        {problem && <p style={{ padding: 16, color: "#ff9aa2" }}>{problem}</p>}
        {picked ? <Single flower={picked} spin={spin} /> : flowers.length > 0 && <Grid flowers={flowers} spin={spin} onPick={pick} />}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px" }}>
        <button
          onClick={() => {
            if (t >= 1) setT(0);
            setPlaying((p) => !p);
          }}
          style={barButton}
        >
          {playing ? "Пауза" : "▶ Вырастить"}
        </button>
        <span style={{ opacity: 0.7 }}>бутон</span>
        <input
          aria-label="Рост"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          style={{ flex: 1, accentColor: "#ff8fb1" }}
        />
        <span style={{ opacity: 0.7 }}>цветок</span>
      </div>
    </div>
  );
}

const barButton: React.CSSProperties = {
  background: "#2a2a36",
  color: "inherit",
  border: "1px solid #3a3a48",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
};

const cellButton: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#c9c6d6",
  font: "12px system-ui, sans-serif",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  paddingBottom: 6,
  cursor: "pointer",
};

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
