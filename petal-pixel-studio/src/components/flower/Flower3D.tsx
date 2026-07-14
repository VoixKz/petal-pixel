import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { FlowerParams } from "@/stores/flowerStore";
import type { Palette } from "@/math/palette";
import { isV2 } from "@/math/flowerVersion";
import {
  buildV2Geometry,
  createClassicFlowerGeometry,
  createParametricBloomGeometry,
  createRoseFlowerGeometry,
  isBloomType,
} from "@/math/flowerGeometry";
import {
  computeFlowerBounds,
  GROUP_POSITION_Y,
  GROUP_SCALE,
  GROUP_TILT_X,
  type FlowerBounds,
} from "@/math/flowerBounds";

interface Flower3DProps {
  params: FlowerParams;
  onBoundsChange?: (bounds: FlowerBounds) => void;
}

/** Perceptual-ish luminance of a hex color (Rec.601 weights over THREE's parsed RGB). */
function hexLuminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/**
 * Hex of the brightest palette stop by luminance (drives the sheen/emissive tint
 * toward the flower's own highlight). Falls back to `fallbackHex` when there is
 * no palette (v1 records carry no `palette`).
 */
export function paletteHighlightHex(palette: Palette | undefined, fallbackHex: string): string {
  const stops = palette?.stops;
  if (!stops || stops.length === 0) return fallbackHex;
  let best = stops[0];
  let bestL = hexLuminance(best.hex);
  for (let i = 1; i < stops.length; i += 1) {
    const l = hexLuminance(stops[i].hex);
    if (l > bestL) {
      best = stops[i];
      bestL = l;
    }
  }
  return best.hex;
}

/**
 * Stable FNV-1a hash of the seed string mapped to [0, 1). Pure and deterministic,
 * so a given name always breathes with the same phase/amplitude. Render-only —
 * never mutates params or geometry.
 */
export function seedToUnit(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

export function Flower3D({ params, onBoundsChange }: Flower3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const breathRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  // Seed-deterministic breathing: same name → same phase/amplitude (render-only).
  const breath = useMemo(() => {
    const u = seedToUnit(params.seed);
    return {
      phase: u * Math.PI * 2,
      breatheAmp: 0.012 + u * 0.01,
      tiltAmp: 0.015 + (1 - u) * 0.01,
    };
  }, [params.seed]);

  useFrame((state, delta) => {
    if (!params.idleMotion) return;
    const g = groupRef.current;
    const b = breathRef.current;
    if (g) g.rotation.y += delta * params.rotationSpeed * 0.3;
    if (b) {
      const t = state.clock.getElapsedTime();
      b.scale.setScalar(1 + breath.breatheAmp * Math.sin(t * 0.9 + breath.phase));
      b.rotation.x = breath.tiltAmp * Math.sin(t * 0.6 + breath.phase);
      b.rotation.z = breath.tiltAmp * 0.5 * Math.cos(t * 0.45 + breath.phase);
    }
    // ren-scene set frameloop="demand"; keep requesting frames while idle.
    state.invalidate();
  });

  // Bootstrap the demand loop when idle turns on; when it turns off, settle the
  // breath group back to its exact base pose (no residual breathing/tilt) and
  // request one frame so the reset renders under frameloop="demand".
  useEffect(() => {
    if (params.idleMotion) {
      invalidate();
      return;
    }
    const b = breathRef.current;
    if (b) {
      b.scale.setScalar(1);
      b.rotation.set(0, 0, 0);
    }
    invalidate();
  }, [params.idleMotion, invalidate]);

  const geometry = useMemo(() => {
    if (isV2(params)) {
      return buildV2Geometry(params);
    }
    if (params.flowerType === "rose") {
      return createRoseFlowerGeometry(params.roseParams);
    }
    if (isBloomType(params.flowerType)) {
      return createParametricBloomGeometry(params.flowerType, params.bloomParams);
    }
    return createClassicFlowerGeometry(params.classicParams);
  }, [params.flowerType, params.algoVersion, params.family, params.classicParams, params.roseParams, params.bloomParams, params.palette, params.sunflowerParams, params.rhodoneaParams, params.superformulaParams]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const material = useMemo(() => {
    // Tint sheen/emissive toward the flower's own highlight so petals read as
    // satin (not white plastic) while the per-vertex palette gradient stays
    // dominant. v1 records have no palette → fall back to colorB.
    const highlightHex = paletteHighlightHex(params.palette, params.colorB);
    const usesVertexColors = isV2(params)
      ? true
      : params.flowerType === "rose" || isBloomType(params.flowerType);
    if (usesVertexColors) {
      return new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: params.material === "metallic" ? 0.24 : params.material === "glass" ? 0.06 : 0.66,
        metalness: params.material === "metallic" ? 0.6 : 0,
        transparent: params.material === "glass",
        opacity: params.material === "glass" ? 0.7 : 1,
        sheen: params.material === "metallic" ? 0.25 : 0.5,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(highlightHex),
        clearcoat: params.material === "glass" ? 0 : 0.18,
        clearcoatRoughness: 0.35,
        // Keep emissive VERY low; glow lives in ren-scene's bloom pass so the
        // per-vertex gradient isn't washed toward one flat color.
        emissive: new THREE.Color(highlightHex),
        emissiveIntensity: params.glowIntensity * 0.03,
      });
    }

    return new THREE.MeshPhysicalMaterial({
      color: params.colorA,
      side: THREE.DoubleSide,
      roughness: params.material === "metallic" ? 0.28 : params.material === "glass" ? 0.08 : 0.7,
      metalness: params.material === "metallic" ? 0.66 : 0.04,
      transparent: params.material === "glass",
      opacity: params.material === "glass" ? 0.76 : 1,
      sheen: params.material === "metallic" ? 0.25 : 0.5,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(highlightHex),
      clearcoat: params.material === "glass" ? 0 : 0.18,
      clearcoatRoughness: 0.35,
      emissive: new THREE.Color(highlightHex),
      emissiveIntensity: params.glowIntensity * 0.03,
    });
  }, [params.flowerType, params.family, params.algoVersion, params.material, params.colorA, params.colorB, params.glowIntensity, params.palette]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const blossomRotation: [number, number, number] = useMemo(() => {
    if (isV2(params)) {
      return params.family === "classic" ? [-Math.PI / 2, 0, 0] : [Math.PI, 0, 0];
    }
    if (params.flowerType === "classic") {
      return [-Math.PI / 2, 0, 0];
    }
    return [Math.PI, 0, 0];
  }, [params.flowerType, params.family, params.algoVersion]);

  useEffect(() => {
    if (!onBoundsChange) {
      return;
    }

    const bounds = computeFlowerBounds(geometry, blossomRotation);
    if (bounds) {
      onBoundsChange(bounds);
    }
  }, [geometry, blossomRotation, onBoundsChange]);

  return (
    <group
      ref={groupRef}
      rotation={[GROUP_TILT_X, (params.rotation * Math.PI) / 180, 0]}
      scale={[GROUP_SCALE, GROUP_SCALE, GROUP_SCALE]}
      position={[0, GROUP_POSITION_Y, 0]}
    >
      <group ref={breathRef}>
        <mesh geometry={geometry} material={material} rotation={blossomRotation} />
      </group>
    </group>
  );
}
