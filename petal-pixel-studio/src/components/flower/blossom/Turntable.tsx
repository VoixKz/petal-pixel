import { useRef, type MutableRefObject, type PointerEvent, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";

/** Turns toward an angle with a little weight, so a drag never feels stuck to the pointer. */
export function Turntable({ angle, group, children }: { angle: { current: number }; group?: MutableRefObject<THREE.Group | null>; children: ReactNode }) {
  const own = useRef<THREE.Group>(null);
  const held = group ?? own;
  useFrame((_, delta) => {
    if (!held.current) return;
    held.current.rotation.y += (angle.current - held.current.rotation.y) * (1 - Math.exp(-delta * 8));
  });
  return <group ref={held}>{children}</group>;
}

/** Sideways drags on a surface turn the plant; vertical ones are left to scroll the page. */
export function useTurning() {
  const angle = useRef(0);
  const grip = useRef<{ x: number; from: number } | null>(null);
  return {
    angle,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        grip.current = { x: event.clientX, from: angle.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (grip.current) angle.current = grip.current.from + (event.clientX - grip.current.x) * 0.008;
      },
      onPointerUp() {
        grip.current = null;
      },
      onPointerCancel() {
        grip.current = null;
      },
    },
  };
}
