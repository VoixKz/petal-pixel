import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Plant } from "@/components/flower/blossom/Plant";
import { Stage } from "@/components/flower/blossom/Stage";
import { Turntable, useTurning } from "@/components/flower/blossom/Turntable";
import type { Grower } from "./growers";

const { lerp, smoothstep } = THREE.MathUtils;

/** Follows the plant: down at the soil for the shoot, up at the head for the bloom. */
function Rig({ life }: { life: { value: number } }) {
  useFrame(({ camera, size }) => {
    const t = life.value;
    const up = smoothstep(t, 0.02, 0.5);
    const close = smoothstep(t, 0.5, 0.86);
    const wide = size.width > 900 && size.width > size.height;
    const tall = size.height > size.width;
    const far = tall ? 8.8 : 7.3;
    const lookAt = lerp(lerp(0.62, 1.86, up), 2.36, close);
    const distance = lerp(lerp(4.6, far, up), tall ? 7.2 : 6, close);
    camera.position.set(0, lookAt + 0.9, distance);
    camera.lookAt(0, lookAt, 0);
    // On a wide screen the words sit on the left, so the plant stands right of centre.
    const perspective = camera as THREE.PerspectiveCamera;
    if (wide) perspective.setViewOffset(size.width, size.height, -size.width * 0.19, 0, size.width, size.height);
    else perspective.clearViewOffset();
  });
  return null;
}

export interface GrowStageProps {
  grower: Grower;
  seed: string;
  life: { value: number };
  glow: { value: number };
  night: boolean;
  /** False while the section is off screen, so nothing draws there. */
  active: boolean;
  onReady: () => void;
  onScanReady: () => void;
}

export default function GrowStage({ grower, seed, life, glow, night, active, onReady, onScanReady }: GrowStageProps) {
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches).current;
  const { angle, handlers } = useTurning();

  return (
    <div className="grow__canvas" {...handlers}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        frameloop={active ? "always" : "never"}
        camera={{ position: [0, 1.6, 5.2], fov: 30 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        onCreated={onReady}
      >
        <Stage glow={glow} bloom={night}>
          <Rig life={life} />
          <Turntable angle={angle}>
            <Plant key={`${grower.id}-${seed}`} seed={seed} species={grower.species} scan={grower.scan} onScanReady={onScanReady} life={life} glow={glow} sway={!still} />
          </Turntable>
        </Stage>
      </Canvas>
    </div>
  );
}
