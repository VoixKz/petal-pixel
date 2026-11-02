import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Plant } from "@/components/flower/blossom/Plant";
import { Stage } from "@/components/flower/blossom/Stage";
import { buildBlossom } from "@/math/blossom/build";
import { emptyPath, placeAt, traceStem } from "@/math/blossom/stem";

const GROWN = { value: 1 };
const DAYLIGHT = { value: 0 };

/** Looks at the open flower from a little above, with its stem running out of the frame. */
function Aim({ seed }: { seed: string }) {
  const camera = useThree((s) => s.camera);
  const heart = useMemo(() => {
    const path = emptyPath();
    traceStem(buildBlossom(seed).stem, 1, 0, path);
    const tip = placeAt(path, path.length);
    return new THREE.Vector3(tip.x, tip.y, tip.z).addScaledVector(new THREE.Vector3(tip.tx, tip.ty, tip.tz), 0.28);
  }, [seed]);

  useEffect(() => {
    camera.position.set(heart.x, heart.y + 1, heart.z + 4.6);
    camera.lookAt(heart.x, heart.y - 0.16, heart.z);
  }, [camera, heart]);
  return null;
}

export interface KeptFlowerProps {
  seed: string;
  /** False while it is off screen, so nothing draws there. */
  active: boolean;
  onReady: () => void;
}

/** The flower the visitor grew, fully open, at the point where they can keep it. */
export default function KeptFlower({ seed, active, onReady }: KeptFlowerProps) {
  const still = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 3.4, 5], fov: 30 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
    >
      <Stage glow={DAYLIGHT} ground={false}>
        <Aim seed={seed} />
        <Plant key={seed} seed={seed} life={GROWN} glow={DAYLIGHT} sway={!still} onHeadReady={onReady} />
      </Stage>
    </Canvas>
  );
}
