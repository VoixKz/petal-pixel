import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FlowerParams } from "@/stores/flowerStore";
import {
  createClassicFlowerGeometry,
  createParametricBloomGeometry,
  createRoseFlowerGeometry,
  isBloomType,
} from "@/math/flowerGeometry";

interface Flower3DProps {
  params: FlowerParams;
  onBoundsChange?: (bounds: { center: THREE.Vector3; size: THREE.Vector3; radius: number }) => void;
}

export function Flower3D({ params, onBoundsChange }: Flower3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current && params.idleMotion) {
      groupRef.current.rotation.y += delta * params.rotationSpeed * 0.3;
    }
  });

  const geometry = useMemo(() => {
    if (params.flowerType === "rose") {
      return createRoseFlowerGeometry(params.roseParams);
    }
    if (isBloomType(params.flowerType)) {
      return createParametricBloomGeometry(params.flowerType, params.bloomParams);
    }
    return createClassicFlowerGeometry(params.classicParams);
  }, [params]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const material = useMemo(() => {
    if (params.flowerType === "rose" || isBloomType(params.flowerType)) {
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
  }, [params]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const blossomRotation: [number, number, number] = useMemo(() => {
    if (params.flowerType === "classic") {
      return [-Math.PI / 2, 0, 0];
    }
    return [Math.PI, 0, 0];
  }, [params.flowerType]);

  useEffect(() => {
    if (!onBoundsChange) {
      return;
    }

    geometry.computeBoundingBox();
    const source = geometry.boundingBox;
    if (!source) {
      return;
    }

    const transformed = source.clone();
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...blossomRotation));
    transformed.applyMatrix4(rotationMatrix);

    transformed.min.multiplyScalar(0.0045).add(new THREE.Vector3(0, -0.75, 0));
    transformed.max.multiplyScalar(0.0045).add(new THREE.Vector3(0, -0.75, 0));

    const size = transformed.getSize(new THREE.Vector3());
    const center = transformed.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.35);

    onBoundsChange({ center, size, radius });
  }, [geometry, blossomRotation, onBoundsChange]);

  return (
    <group
      ref={groupRef}
      rotation={[0.3, (params.rotation * Math.PI) / 180, 0]}
      scale={[0.0045, 0.0045, 0.0045]}
      position={[0, -0.75, 0]}
    >
      <mesh geometry={geometry} material={material} rotation={blossomRotation} />
    </group>
  );
}
