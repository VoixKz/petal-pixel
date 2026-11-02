import { useEffect, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { LIFE, smooth } from "@/math/blossom/life";
import { OPENING_GLSL } from "@/math/blossom/opening";
import type { HeadSource, Tint } from "@/math/blossom/species";

const draco = new DRACOLoader().setDecoderPath("/draco/");
const withDraco = (loader: THREE.Loader) => (loader as GLTFLoader).setDRACOLoader(draco);

const OPEN_PLACE = /* glsl */ `
uniform float uOpen;
varying float vCore;
varying vec3 vToLamp;
`;

const SKIN = /* glsl */ `
uniform float uGlow;
uniform vec3 uLamp;
uniform vec3 uTint;
varying float vCore;
varying vec3 vToLamp;

vec3 toHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-5)), d / (q.x + 1e-5), q.x);
}

vec3 fromHsv(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// A name turns the petals to its own colour. The green around them stays green.
vec3 tinted(vec3 c) {
  vec3 hsv = toHsv(c);
  vec3 turned = fromHsv(vec3(fract(hsv.x + uTint.x), min(hsv.y * uTint.y, 1.0), hsv.z * uTint.z));
  float leafy = smoothstep(0.0, 0.05, c.g - max(c.r, c.b));
  return mix(turned, c, leafy);
}
`;

function headMaterial(source: THREE.MeshStandardMaterial, uniforms: Record<string, { value: unknown }>): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.side = THREE.DoubleSide;
  material.roughness = 0.62;
  material.metalness = 0;
  // Grey sky on a pale petal reads as metal, and a scan already holds its own soft shade.
  material.envMapIntensity = 0.35;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OPENING_GLSL}\n${OPEN_PLACE}`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        vec3 start = openPoint(position, uOpen);
        vec3 side = normalize(abs(normal.y) > 0.9 ? cross(normal, vec3(1.0, 0.0, 0.0)) : cross(normal, vec3(0.0, 1.0, 0.0)));
        vec3 over = cross(normal, side);
        vec3 moved = cross(openPoint(position + side * 0.01, uOpen) - start, openPoint(position + over * 0.01, uOpen) - start);
        vec3 objectNormal = dot(moved, moved) > 1e-18 ? normalize(moved) : normal;
        vCore = length(start);
        vToLamp = normalMatrix * -start;
        `,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = start;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKIN}`)
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = tinted(diffuseColor.rgb);")
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        float near = exp(-vCore * 1.5);
        float square = 0.5 + 0.5 * abs(dot(normal, normalize(vToLamp)));
        vec3 through = pow(diffuseColor.rgb, vec3(2.0));
        through /= max(max(through.r, max(through.g, through.b)), 0.001);
        totalEmissiveRadiance += uGlow * uLamp * (through * (near * 1.55 * square + 0.05) + near * near * near * near * 0.7);
        totalEmissiveRadiance += (1.0 - uGlow) * diffuseColor.rgb * 0.2;
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-head";
  return material;
}

/** So a shadow on the soil has the shape of the bud, and not of the flower it will become. */
function headDepthMaterial(uniforms: Record<string, { value: unknown }>): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${OPENING_GLSL}\n${OPEN_PLACE}`)
      .replace("#include <begin_vertex>", "vec3 transformed = openPoint(position, uOpen);");
  };
  material.customProgramCacheKey = () => "blossom-head-depth";
  return material;
}

export interface HeadProps {
  source: HeadSource;
  tint: Tint;
  /** How far this flower opens at the end of its life: 1 is as it was scanned. */
  fullness: number;
  /** Turn around its own axis, so no two of a kind face the same way. */
  turn: number;
  life: { value: number };
  glow: { value: number };
  lamp: THREE.Color;
  onReady?: () => void;
}

export function Head({ source, tint, fullness, turn, life, glow, lamp, onReady }: HeadProps) {
  const gltf = useLoader(GLTFLoader, source.url, withDraco);

  const parts = useMemo(() => {
    const uniforms = {
      uOpen: { value: 0 },
      uShape: { value: new THREE.Vector4(source.top, source.closed, source.twist, source.bud) },
      uKept: { value: source.kept },
      uTint: { value: new THREE.Vector3(tint.hue, tint.saturation, tint.value) },
      uGlow: glow,
      uLamp: { value: lamp },
    };
    const meshes: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) meshes.push({ geometry: mesh.geometry, material: headMaterial(mesh.material as THREE.MeshStandardMaterial, uniforms) });
    });
    return { uniforms, meshes, depth: headDepthMaterial(uniforms) };
  }, [gltf, source, tint, glow, lamp]);

  useFrame(() => {
    parts.uniforms.uOpen.value = smooth(life.value, LIFE.petals[0], LIFE.petals[1]) * fullness;
  });

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // The geometry belongs to the loader's cache and is shared by every flower of this kind.
  useEffect(
    () => () => {
      for (const { material } of parts.meshes) material.dispose();
      parts.depth.dispose();
    },
    [parts],
  );

  return (
    <group rotation={[0, turn, 0]} scale={source.size}>
      {parts.meshes.map(({ geometry, material }) => (
        <mesh key={material.uuid} geometry={geometry} material={material} customDepthMaterial={parts.depth} frustumCulled={false} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** Drops a failed download from the cache, so the next try goes back to the network. */
export const forgetHead = (source: HeadSource) => useLoader.clear(GLTFLoader, source.url);
