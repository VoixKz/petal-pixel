import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { seededRandom } from "@/math/blossom/build";

const SIZE = 512;

/** A soft ball of light, as a picture: light scattering in the air around the lamp. */
function haloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d") as CanvasRenderingContext2D;
  const fade = c.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  fade.addColorStop(0, "rgba(255,255,255,1)");
  fade.addColorStop(0.16, "rgba(255,255,255,.5)");
  fade.addColorStop(0.42, "rgba(255,255,255,.13)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = fade;
  c.fillRect(0, 0, SIZE, SIZE);
  return new THREE.CanvasTexture(canvas);
}

/** Shafts of light leaving through the gaps between the petals. */
function raysTexture(seed: string): THREE.CanvasTexture {
  const random = seededRandom(`${seed}:rays`);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d") as CanvasRenderingContext2D;
  c.translate(SIZE / 2, SIZE / 2);
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 46; i += 1) {
    const angle = random() * Math.PI * 2;
    const width = 0.012 + random() * 0.05;
    const reach = (SIZE / 2) * (0.5 + random() * 0.5);
    const shaft = c.createRadialGradient(0, 0, 0, 0, 0, reach);
    const strength = 0.1 + random() * 0.26;
    shaft.addColorStop(0, `rgba(255,255,255,${strength})`);
    shaft.addColorStop(0.4, `rgba(255,255,255,${strength * 0.42})`);
    shaft.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = shaft;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, reach, angle - width, angle + width);
    c.closePath();
    c.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

export interface LanternProps {
  seed: string;
  glow: { value: number };
  /** Colour of the light in the air. */
  colour: string;
  /** How far the flower has opened: a closed bud holds its light in. */
  open: () => number;
}

/** The light of the night lamp as it spreads through the air around the flower. */
export function Lantern({ seed, glow, colour, open }: LanternProps) {
  const halo = useRef<THREE.Sprite>(null);
  const rays = useRef<THREE.Sprite>(null);
  const textures = useMemo(() => ({ halo: haloTexture(), rays: raysTexture(seed) }), [seed]);
  const materials = useMemo(
    () => ({
      halo: new THREE.SpriteMaterial({ map: textures.halo, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 }),
      rays: new THREE.SpriteMaterial({ map: textures.rays, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 }),
    }),
    [textures, colour],
  );

  useEffect(
    () => () => {
      textures.halo.dispose();
      textures.rays.dispose();
      materials.halo.dispose();
      materials.rays.dispose();
    },
    [textures, materials],
  );

  useFrame(({ clock }) => {
    const night = glow.value;
    const opened = open();
    // The small flicker of a warm bulb seen through something alive.
    const breath = 1 + Math.sin(clock.elapsedTime * 0.9) * 0.03;
    materials.halo.opacity = night * (0.045 + opened * 0.025) * breath;
    materials.rays.opacity = night * opened * 0.035 * breath;
    halo.current?.scale.setScalar(4.4 + opened * 1.8);
    rays.current?.scale.setScalar(4.8 + opened * 1.8);
    if (rays.current) rays.current.material.rotation = clock.elapsedTime * 0.012;
  });

  return (
    <group position={[0, 0.26, 0]}>
      <sprite ref={halo} material={materials.halo} renderOrder={20} />
      <sprite ref={rays} material={materials.rays} renderOrder={21} />
    </group>
  );
}
