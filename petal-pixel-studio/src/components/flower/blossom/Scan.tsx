import { useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { LIFE } from "@/math/blossom/build";

/** A real flower scanned in 3D, and what it takes to grow it on one of our stems. */
export interface ScanSource {
  url: string;
  /** The point the petals come out of, in the scan's own axes, sized to radius 1. */
  heart: readonly [number, number, number];
  /** Radians that turn the way the flower faces onto the plant's upright axis. */
  face: readonly [number, number, number];
  /** Scans keep a cut piece of stalk. Triangles below all three of these are dropped. */
  stalkBelow: readonly [number, number, number];
  nod: number;
}

const SPAN = 0.2;
const draco = new DRACOLoader().setDecoderPath("/draco/");

const fold = /* glsl */ `
uniform float uLife;
varying float vCore;
varying vec3 vToLamp;

float settle(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

// A scan is one fixed shape, so opening it means folding every point toward the upright
// axis of the flower. The parts leaning furthest out open first, like outer petals.
vec3 foldPoint(vec3 p) {
  float reach = length(p);
  float lean = acos(clamp(p.y / max(reach, 0.0001), -1.0, 1.0));
  float turn = atan(p.z, p.x);
  float order = 1.0 - clamp(lean / 1.9, 0.0, 1.0);
  float age = settle((uLife - mix(${LIFE.petals[0].toFixed(3)}, ${LIFE.petals[1].toFixed(3)}, order)) / ${SPAN.toFixed(3)});
  float young = mix(0.36, 1.0, smoothstep(${LIFE.swell[0].toFixed(3)}, ${LIFE.swell[1].toFixed(3)}, uLife));
  float closedLean = 0.06 + lean * 0.2;
  // Long petals fold shorter, so the tips stay inside the sepals.
  float closedReach = min(reach * 0.74, 0.62) * young;
  float r = mix(closedReach, reach, age);
  float l = mix(closedLean, lean, age);
  float t = turn + (1.0 - age) * 0.7;
  return vec3(r * sin(l) * cos(t), r * cos(l), r * sin(l) * sin(t));
}
`;

const scanSkin = /* glsl */ `
uniform float uGlow;
uniform vec3 uLamp;
varying float vCore;
varying vec3 vToLamp;
`;

function scanMaterial(
  source: THREE.MeshStandardMaterial,
  uniforms: Record<string, { value: unknown }>,
): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.side = THREE.DoubleSide;
  material.roughness = 0.72;
  material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${fold}`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        vec3 start = foldPoint(position);
        vec3 side = normalize(abs(normal.y) > 0.9 ? cross(normal, vec3(1.0, 0.0, 0.0)) : cross(normal, vec3(0.0, 1.0, 0.0)));
        vec3 over = cross(normal, side);
        vec3 foldNormal = cross(foldPoint(position + side * 0.01) - start, foldPoint(position + over * 0.01) - start);
        vec3 objectNormal = dot(foldNormal, foldNormal) > 1e-18 ? normalize(foldNormal) : normal;
        vCore = length(start);
        vToLamp = normalMatrix * -start;
        `,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = start;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${scanSkin}`)
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        float near = exp(-vCore * 1.5);
        float square = 0.5 + 0.5 * abs(dot(normal, normalize(vToLamp)));
        vec3 through = pow(diffuseColor.rgb, vec3(2.0));
        through /= max(max(through.r, max(through.g, through.b)), 0.001);
        totalEmissiveRadiance += uGlow * uLamp * (through * (near * 1.55 * square + 0.05) + near * near * near * near * 0.7);
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-scan";
  return material;
}

/** Bakes the scan into the plant's axes, with its heart at the origin and no cut stalk. */
function placed(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, source: ScanSource, unit: number, centre: THREE.Vector3) {
  const moved = geometry.clone();
  const position = moved.attributes.position as THREE.BufferAttribute;
  const index = moved.index;
  if (index) {
    const kept: number[] = [];
    const point = new THREE.Vector3();
    const stalk = (i: number) => {
      point.fromBufferAttribute(position, i).sub(centre).multiplyScalar(unit);
      return point.x < source.stalkBelow[0] && point.y < source.stalkBelow[1] && point.z < source.stalkBelow[2];
    };
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (!(stalk(a) && stalk(b) && stalk(c))) kept.push(a, b, c);
    }
    moved.setIndex(kept);
  }
  moved.applyMatrix4(matrix);
  return moved;
}

export interface ScanHeadProps {
  source: ScanSource;
  life: { value: number };
  glow: { value: number };
  lamp: THREE.Color;
  onReady?: () => void;
}

export function ScanHead({ source, life, glow, lamp, onReady }: ScanHeadProps) {
  const gltf = useLoader(GLTFLoader, source.url, (loader) => (loader as GLTFLoader).setDRACOLoader(draco));

  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const unit = 2 / Math.max(size.x, size.y, size.z);
    const uniforms = {
      uLife: life,
      uGlow: glow,
      uLamp: { value: lamp },
    };
    const toPlant = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(...source.face))
      .multiply(new THREE.Matrix4().makeTranslation(-source.heart[0], -source.heart[1], -source.heart[2]))
      .multiply(new THREE.Matrix4().makeScale(unit, unit, unit))
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
    const found: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const matrix = toPlant.clone().multiply(mesh.matrixWorld);
      found.push({
        geometry: placed(mesh.geometry, matrix, source, unit, centre.clone().applyMatrix4(mesh.matrixWorld.clone().invert())),
        material: scanMaterial(mesh.material as THREE.MeshStandardMaterial, uniforms),
      });
    });
    return found;
  }, [gltf, source, life, glow, lamp]);

  useEffect(() => onReady?.(), [onReady]);

  useEffect(
    () => () => {
      for (const { geometry, material } of meshes) {
        geometry.dispose();
        material.dispose();
      }
    },
    [meshes],
  );

  return (
    <>
      {meshes.map(({ geometry, material }) => (
        <mesh key={geometry.uuid} geometry={geometry} material={material} frustumCulled={false} castShadow />
      ))}
    </>
  );
}
