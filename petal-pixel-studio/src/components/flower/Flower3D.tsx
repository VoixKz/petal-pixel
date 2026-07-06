import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FlowerParams } from "@/stores/flowerStore";
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

export function Flower3D({ params, onBoundsChange }: Flower3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current && params.idleMotion) {
      groupRef.current.rotation.y += delta * params.rotationSpeed * 0.3;
    }
  });

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
    const usesVertexColors = isV2(params)
      ? true
      : params.flowerType === "rose" || isBloomType(params.flowerType);
    if (usesVertexColors) {
      return new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: params.material === "metallic" ? 0.24 : params.material === "glass" ? 0.06 : 0.66,
        metalness: params.material === "metallic" ? 0.72 : 0.05,
        transparent: params.material === "glass",
        opacity: params.material === "glass" ? 0.7 : 1,
        emissive: new THREE.Color(params.colorA),
        emissiveIntensity: params.glowIntensity * 0.1,
      });
    }

    return new THREE.MeshPhysicalMaterial({
      color: params.colorA,
      side: THREE.DoubleSide,
      roughness: params.material === "metallic" ? 0.28 : params.material === "glass" ? 0.08 : 0.7,
      metalness: params.material === "metallic" ? 0.66 : 0.04,
      transparent: params.material === "glass",
      opacity: params.material === "glass" ? 0.76 : 1,
      emissive: new THREE.Color(params.colorB),
      emissiveIntensity: params.glowIntensity * 0.16,
    });
  }, [params.flowerType, params.family, params.algoVersion, params.material, params.colorA, params.colorB, params.glowIntensity]);

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
      <mesh geometry={geometry} material={material} rotation={blossomRotation} />
    </group>
  );
}
