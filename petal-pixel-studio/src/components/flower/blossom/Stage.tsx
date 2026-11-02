import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { seededRandom } from "@/math/blossom/build";

export const DAY_GROUND = "#f0f0f1";
export const NIGHT_GROUND = "#141412";
/** The name of what a plant stands on, so a portrait of the flower can leave it out. */
export const GROUND = "ground";

const SOIL_RADIUS = 1.5;
/** How far from the stem a shadow starts to thin out, and where it is gone. */
const SHADOW_FADE = [1.05, 2];

const SOIL_NOISE = /* glsl */ `
uniform vec3 uSoil;
uniform float uGlow;
uniform vec3 uLamp;
varying vec2 vSpot;

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** Earth takes the real light, so the plant's shadow falls on it and runs on to the ground. */
function soilMaterial(glow: { value: number }, lamp: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ transparent: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSoil: { value: new THREE.Color("#4a3426") },
      uGlow: glow,
      uLamp: { value: new THREE.Color(lamp) },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSpot;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpot = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SOIL_NOISE}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        float r = length(vSpot);
        float grain = noise(vSpot * 11.0) * 0.45 + noise(vSpot * 31.0) * 0.35 + noise(vSpot * 83.0) * 0.2;
        // The edge thins into scattered crumbs, the way loose earth ends.
        float edge = 1.14 + (noise(vSpot * 2.1) - 0.5) * 0.24;
        float thin = smoothstep(edge - 0.26, edge + 0.02, r);
        diffuseColor.a = 1.0 - smoothstep(0.34, 0.5, thin * 0.62 + grain * thin * 0.6);
        // Darker and damper right around the stem.
        float damp = mix(0.74, 1.0, smoothstep(0.0, 0.42, r));
        diffuseColor.rgb = uSoil * (0.24 + grain * 0.5) * damp * (1.0 - uGlow);
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        // At night only the ground under the flower is lit, and it takes the colour of the lamp.
        totalEmissiveRadiance += uGlow * uSoil * uLamp * (0.26 + grain * 0.5) * exp(-r * 1.7) * 0.9;
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-soil";
  return material;
}

const lump = (x: number, z: number) =>
  Math.sin(x * 5.1 + z * 2.3) * 0.5 + Math.sin(z * 6.7 - x * 3.1) * 0.35 + Math.sin((x + z) * 11.3) * 0.15;

/** A low mound with lumps, so the ground takes the light like a thing and not a stain. */
function soilGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(0.001, SOIL_RADIUS, 120, 48);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const fade = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, y), 0, 1.16);
    position.setZ(i, fade * (0.05 + lump(x, y) * 0.016) + fade * fade * 0.05);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function pebbles(): THREE.Matrix4[] {
  const random = seededRandom("pebbles");
  const hold = new THREE.Object3D();
  return Array.from({ length: 46 }, () => {
    const angle = random() * Math.PI * 2;
    const reach = 0.1 + random() ** 0.7 * 0.92;
    const size = 0.008 + random() ** 2.6 * 0.034;
    const fade = 1 - THREE.MathUtils.smoothstep(reach, 0, 1.16);
    hold.position.set(Math.cos(angle) * reach, fade * 0.09 + size * 0.2, Math.sin(angle) * reach);
    hold.scale.set(size, size * (0.5 + random() * 0.4), size * (0.7 + random() * 0.5));
    hold.rotation.set(random() * 3, random() * 3, random() * 3);
    hold.updateMatrix();
    return hold.matrix.clone();
  });
}

/** The patch of earth the plant comes out of. */
/** The page has no ground of its own, so the plant's shadow thins out past the soil. */
function shadowOnSoil(): THREE.ShadowMaterial {
  const material = new THREE.ShadowMaterial({ opacity: 0.1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace(
        "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );",
        `gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( ${SHADOW_FADE[0].toFixed(2)}, ${SHADOW_FADE[1].toFixed(2)}, length( vGround ) ) ) );`,
      );
  };
  return material;
}

function Soil({ glow, lamp }: { glow: { value: number }; lamp: string }) {
  const parts = useMemo(() => {
    return {
      material: soilMaterial(glow, lamp),
      geometry: soilGeometry(),
      stone: new THREE.IcosahedronGeometry(1, 1),
      stoneSkin: new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 0.9 }),
    };
  }, [glow, lamp]);
  const stones = useRef<THREE.InstancedMesh>(null);
  const placed = useMemo(pebbles, []);

  useEffect(() => {
    placed.forEach((matrix, i) => stones.current?.setMatrixAt(i, matrix));
    if (stones.current) stones.current.instanceMatrix.needsUpdate = true;
  }, [placed]);
  useEffect(
    () => () => {
      parts.material.dispose();
      parts.geometry.dispose();
      parts.stone.dispose();
      parts.stoneSkin.dispose();
    },
    [parts],
  );
  useFrame(() => parts.stoneSkin.color.set("#5a4636").multiplyScalar(1 - glow.value * 0.82));

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={-1} geometry={parts.geometry} material={parts.material} receiveShadow />
      <instancedMesh ref={stones} args={[parts.stone, parts.stoneSkin, placed.length]} castShadow />
    </>
  );
}

/**
 * The sun is split in two: the part that casts shadows and the part that doesn't. Petals
 * are translucent, so a petal's shadow on the next one should deepen it, never turn it grey.
 */
const SUN_THROUGH_SHADOW = 1.05;
const SUN_PAST_SHADOW = 1.35;

/** How long a frame may take, in ms, before the stage drops to its next level of detail. */
const FRAME_LIMITS = [30, 70];
/** How much detail the stage can afford right now. Parts of a plant read it to do with less. */
export const DetailLevel = createContext(0);
/** The level from which petals go back to a single surface. */
export const FULL_DETAIL_BELOW = FRAME_LIMITS.length;
/** A plant must never starve the page: at the lowest level it draws at most this often. */
const SLOWEST_GAP_MS = 240;
const SETTLING_MS = 600;
const SAMPLE_MS = 700;
const SAMPLE_FRAMES = 4;

/** Drawing on the processor, with no graphics card behind it. */
function hasNoGraphicsCard(gl: THREE.WebGLRenderer): boolean {
  const context = gl.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const name = String(info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : "");
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

/**
 * Watches how long frames really take and lowers the detail until the page stays
 * responsive: level 1 draws at one pixel per dot and drops the soft edges of the glow,
 * level 2 drops the glow and shadows too, and draws only a few times a second.
 */
function useFrameBudget(): { level: number; gap: number } {
  const gl = useThree((s) => s.gl);
  const [level, setLevel] = useState(() => (hasNoGraphicsCard(gl) ? FRAME_LIMITS.length : 0));
  const gap = useRef(SLOWEST_GAP_MS);
  const sample = useRef({ settling: SETTLING_MS, spent: 0, frames: [] as number[] });

  useFrame((state, delta) => {
    if (level >= 1 && gl.getPixelRatio() !== 1) gl.setPixelRatio(1);
    // A stage drawn on request has no steady frames to measure.
    if (state.frameloop === "never" || level >= FRAME_LIMITS.length || document.hidden) return;
    const ms = delta * 1000;
    const taken = sample.current;
    if (taken.settling > 0) {
      taken.settling -= ms;
      return;
    }
    taken.frames.push(ms);
    taken.spent += ms;
    if (taken.spent < SAMPLE_MS || taken.frames.length < SAMPLE_FRAMES) return;
    const typical = [...taken.frames].sort((a, b) => a - b)[taken.frames.length >> 1];
    sample.current = { settling: SETTLING_MS / 2, spent: 0, frames: [] };
    const next = FRAME_LIMITS.filter((limit) => typical > limit).length;
    if (next > level) {
      gap.current = Math.max(SLOWEST_GAP_MS, typical * 3);
      setLevel(next);
    }
  });

  return { level, gap: gap.current };
}

/** Takes over drawing and leaves the page most of its time between frames. */
function SparingFrames({ gap }: { gap: number }) {
  const last = useRef(0);
  useFrame(({ gl, scene, camera, frameloop }) => {
    const now = performance.now();
    // A stage drawn on request wants its picture now.
    if (frameloop !== "never" && now - last.current < gap) return;
    last.current = now;
    gl.render(scene, camera);
  }, 1);
  return null;
}

export interface StageProps {
  /** 0 is day, 1 the night light. */
  glow: { value: number };
  /** Bloom costs a full-screen pass, so it runs only while it can be seen. */
  bloom?: boolean;
  /** False leaves only the plant, on a transparent page: for pictures of it. */
  ground?: boolean;
  children: ReactNode;
}

/** Lights the plant and swings the whole scene between daylight and the night light. */
export function Stage({ glow, bloom = false, ground = true, children }: StageProps) {
  const scene = useThree((s) => s.scene);
  const { level, gap } = useFrameBudget();
  // Phones get a lighter shadow; it is the most expensive part of drawing the plant.
  const mapSize = useThree((s) => (s.size.width < 900 ? 1024 : 2048));
  const sky = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const softSun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const effect = useRef<{ intensity: number }>(null);
  const groundShadow = useMemo(shadowOnSoil, []);
  const colours = useMemo(
    () => ({ day: new THREE.Color(DAY_GROUND), night: new THREE.Color(NIGHT_GROUND), now: new THREE.Color(DAY_GROUND) }),
    [],
  );

  useEffect(() => {
    scene.background = ground ? colours.now : null;
    return () => {
      scene.background = null;
    };
  }, [scene, colours, ground]);

  useFrame(() => {
    const night = glow.value;
    const day = 1 - night;
    colours.now.copy(colours.day).lerp(colours.night, night);
    if (sky.current) sky.current.intensity = 0.62 * day + 0.03;
    if (sun.current) sun.current.intensity = SUN_THROUGH_SHADOW * day;
    if (softSun.current) softSun.current.intensity = SUN_PAST_SHADOW * day;
    if (fill.current) fill.current.intensity = 0.7 * day;
    if (effect.current) effect.current.intensity = 0.34 * night;
  });

  return (
    <DetailLevel.Provider value={level}>
      <hemisphereLight ref={sky} args={["#ffffff", "#d9cdb8", 0.62]} />
      <directionalLight
        ref={sun}
        castShadow={level < FRAME_LIMITS.length}
        position={[3, 7, 4]}
        intensity={SUN_THROUGH_SHADOW}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-radius={5}
        shadow-bias={-0.0016}
        shadow-normalBias={0.07}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={5}
        shadow-camera-bottom={-1}
      />
      <directionalLight ref={softSun} position={[3, 7, 4]} intensity={SUN_PAST_SHADOW} />
      <directionalLight ref={fill} position={[-4, 2, -3]} intensity={0.7} color="#dfe8ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 4, -3]} scale={[8, 4, 1]} />
      </Environment>
      {ground && (
        <group name={GROUND}>
          <Soil glow={glow} lamp="#ffcf9e" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[14, 14]} />
            <primitive object={groundShadow} attach="material" />
          </mesh>
        </group>
      )}
      {children}
      {bloom && level < FRAME_LIMITS.length && (
        <EffectComposer key={level} multisampling={level === 0 ? 4 : 0}>
          <Bloom ref={effect as never} mipmapBlur intensity={0} luminanceThreshold={0.62} luminanceSmoothing={0.3} radius={0.7} />
        </EffectComposer>
      )}
      {level >= FRAME_LIMITS.length && <SparingFrames gap={gap} />}
    </DetailLevel.Provider>
  );
}
