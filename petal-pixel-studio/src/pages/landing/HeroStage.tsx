import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Plant } from "@/components/flower/blossom/Plant";
import { PlantRig } from "@/components/flower/blossom/PlantRig";
import { Stage } from "@/components/flower/blossom/Stage";
import { Turntable, useTurning } from "@/components/flower/blossom/Turntable";

export interface HeroStageProps {
  seed: string;
  life: { value: number };
  /** False once the hero has scrolled away, so nothing draws there. */
  active: boolean;
  /** The flower itself has arrived, so the picture standing in for it can go. */
  onReady: () => void;
  /** The flower could not be loaded. */
  onLost: () => void;
}

const NIGHT_NEVER = { value: 0 };

export default function HeroStage({ seed, life, active, onReady, onLost }: HeroStageProps) {
  const still = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches).current;
  const { angle, handlers } = useTurning();

  return (
    <div className="hero__canvas" {...handlers}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        frameloop={active ? "always" : "never"}
        camera={{ position: [0, 2.3, 8.4], fov: 30 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <Stage glow={NIGHT_NEVER}>
          <PlantRig life={life} />
          <Turntable angle={angle}>
            <Plant key={seed} seed={seed} life={life} glow={NIGHT_NEVER} sway={!still} onHeadReady={onReady} onHeadFailed={onLost} />
          </Turntable>
        </Stage>
      </Canvas>
    </div>
  );
}
