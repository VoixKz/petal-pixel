import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { buildV2Geometry, type V2Params } from "@/math/flowerGeometry";
import { paletteHighlightHex } from "./Flower3D";
import { BUD, bakeFlower, foldedMaterial } from "./budFold";

const BUD_TILT = 0.1;
const BLOOM_TILT = 0.72;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A soft pool of shade under the flower, drawn once. */
function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const fade = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  fade.addColorStop(0, "rgba(20,20,18,0.2)");
  fade.addColorStop(0.5, "rgba(20,20,18,0.07)");
  fade.addColorStop(1, "rgba(20,20,18,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function Flower({ params, growth, spin }: { params: V2Params; growth: { value: number }; spin: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Mesh>(null);

  const baked = useMemo(() => {
    const raw = buildV2Geometry(params);
    const result = bakeFlower(raw, params.family);
    raw.dispose();
    return result;
  }, [params]);
  const material = useMemo(
    () => foldedMaterial(paletteHighlightHex(params.palette, "#ffffff"), baked.alphaMax, baked.floor, growth),
    [params, baked, growth],
  );
  const texture = useMemo(shadowTexture, []);

  useEffect(
    () => () => {
      baked.geometry.dispose();
      material.dispose();
    },
    [baked, material],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const t = smooth(growth.value);
    if (outer.current) {
      outer.current.rotation.x = THREE.MathUtils.lerp(BUD_TILT, BLOOM_TILT, t);
      outer.current.position.y = -THREE.MathUtils.lerp(BUD.height / 2, baked.openCentreY, t);
    }
    if (inner.current && spin) inner.current.rotation.y += delta * 0.16;
    if (shade.current) {
      shade.current.scale.setScalar(THREE.MathUtils.lerp(0.8, 1.7, t));
      shade.current.position.y = THREE.MathUtils.lerp(-0.5, -0.98, t);
    }
  });

  return (
    <>
      <group ref={outer}>
        <group ref={inner}>
          <mesh geometry={baked.geometry} material={material} frustumCulled={false} />
        </group>
      </group>
      <mesh ref={shade} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

interface GrowingFlowerProps {
  params: V2Params | null;
  /** Shared with the page: 0 is a closed bud, 1 the finished flower. */
  growth: { value: number };
  /** Stops drawing while the flower is off screen. */
  active?: boolean;
  spin?: boolean;
  onReady?: () => void;
}

/** A flower that opens on a light page. It has no background of its own. */
export function GrowingFlower({ params, growth, active = true, spin = true, onReady }: GrowingFlowerProps) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 2]}
      camera={{ position: [0, 0.35, 4.1], fov: 34 }}
      // No tone mapping: on a light page ACES drains the petals' colour.
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
      onCreated={() => onReady?.()}
    >
      {/* A warm fill from below keeps shaded petals their own colour; grey turns yellow olive. */}
      <hemisphereLight args={["#ffffff", "#f3e6cf", 1.15]} />
      <directionalLight position={[3, 5, 4]} intensity={1.05} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} color="#dfe8ff" />
      <directionalLight position={[0, -3, 3]} intensity={0.4} color="#fff4e0" />
      <Environment resolution={256} frames={1} environmentIntensity={0.3}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 4, -3]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#e8eeff" position={[-5, 1, 2]} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#fff0e0" position={[4, 3, 3]} scale={3} />
      </Environment>
      {params && <Flower key={JSON.stringify(params.palette?.stops) + params.family} params={params} growth={growth} spin={spin} />}
    </Canvas>
  );
}
