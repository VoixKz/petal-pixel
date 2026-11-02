import { Suspense, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildBlossom, type Blossom } from "@/math/blossom/build";
import { LIFE, smooth } from "@/math/blossom/life";
import { emptyPath, emptyTube, placeAt, traceStem, tubeIndex, writeLeaves, writeThorns, writeTube } from "@/math/blossom/stem";
import type { Species } from "@/math/blossom/species";
import { leafDepthMaterial, leafGeometry, leafMaterial, type LeafUniforms } from "./leaf";
import { Lantern } from "./Lantern";
import { ScanHead, type ScanSource } from "./Scan";
import { heartColour, partsGeometry, petalDepthMaterial, petalMaterial, type BlossomUniforms } from "./material";
import { DetailLevel, FULL_DETAIL_BELOW } from "./Stage";

/** Where the day light comes from, so petals can glow when it is behind them. */
const SUN = new THREE.Vector3(3, 7, 4).normalize();
const AIR_BRIGHTNESS = 0.3;

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
/** Where the stem swells to carry the flower: a smooth cup, turned on a lathe. */
const RECEPTACLE = new THREE.LatheGeometry(
  [
    [0.016, -0.24],
    [0.019, -0.17],
    [0.028, -0.12],
    [0.05, -0.07],
    [0.078, -0.03],
    [0.09, 0.005],
    [0.075, 0.035],
    [0.03, 0.05],
    [0, 0.052],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  20,
);
/** The floor of the flower, in the colour of its petals, so no green shows between their bases. */
const HEART = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const THORN = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);

/** The stem glows faintly near the flower at night, from the light falling down it. */
function stemMaterial(glow: { value: number }, lamp: { value: THREE.Color }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uGlow: glow, uLamp: lamp });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aNear;\nvarying float vNear;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvNear = aNear;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;\nuniform vec3 uLamp;\nvarying float vNear;")
      .replace(
        "#include <emissivemap_fragment>",
        "totalEmissiveRadiance += uGlow * uLamp * diffuseColor.rgb * (0.06 + vNear * 1.2);",
      );
  };
  material.customProgramCacheKey = () => "blossom-stem";
  return material;
}

/** Lit by the lamp it sits around, so the heart of the flower is never a dark hole. */
function nearLampMaterial(colour: string, roughness: number, glow: { value: number }, lamp: { value: THREE.Color }, sky = 1): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness, envMapIntensity: sky });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uGlow: glow, uLamp: lamp });
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;\nuniform vec3 uLamp;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance += uGlow * uLamp * diffuseColor.rgb * 1.5;");
  };
  material.customProgramCacheKey = () => "blossom-near-lamp";
  return material;
}

export interface PlantProps {
  seed: string;
  species?: Species;
  /** A scanned flower to grow on this stem instead of generated petals. */
  scan?: ScanSource;
  onScanReady?: () => void;
  /** Shared with the page: 0 is bare soil, 1 the finished flower. */
  life: { value: number };
  /** 0 is day, 1 the night light. */
  glow: { value: number };
  lamp?: string;
  spin?: boolean;
  /** Lets the plant move a little in still air. */
  sway?: boolean;
  /** While true the air stops, so a picture of the plant comes out the same every time. */
  hold?: { value: boolean };
  onBuilt?: (blossom: Blossom) => void;
}

export function Plant({ seed, species, scan, onScanReady, life, glow, lamp = "#ffcf9e", spin = false, sway = false, hold, onBuilt }: PlantProps) {
  const blossom = useMemo(() => buildBlossom(seed, species), [seed, species]);
  useEffect(() => onBuilt?.(blossom), [blossom, onBuilt]);
  const plan = useMemo(() => ({ ...blossom.stem, nod: scan?.nod ?? blossom.stem.nod }), [blossom, scan]);

  // The air glows with the flower's own colour, warmed by the bulb.
  const light = useMemo(() => {
    const air = new THREE.Color(blossom.colour[1]).lerp(new THREE.Color(lamp), 0.45);
    // Every flower lights the air equally, or pale ones turn the whole night grey.
    return `#${air.multiplyScalar(AIR_BRIGHTNESS / (air.r * 0.3 + air.g * 0.55 + air.b * 0.15)).getHexString()}`;
  }, [blossom, lamp]);

  const shared = useMemo(
    () => ({ uGlow: glow, uLamp: { value: new THREE.Color(lamp) }, uSun: { value: SUN } }),
    [glow, lamp],
  );
  const flowerUniforms = useMemo<BlossomUniforms>(
    () => ({
      ...shared,
      uLife: life,
      uBud: { value: new THREE.Vector4(blossom.species.bud.radius, blossom.species.bud.height, blossom.species.bud.twist, blossom.species.ruffle) },
    }),
    [shared, life, blossom],
  );
  const leafUniforms = useMemo<LeafUniforms>(
    () => ({
      ...shared,
      uShade: { value: new THREE.Color(blossom.species.green[0]) },
      uGreen: { value: new THREE.Color(blossom.species.green[1]) },
      uBright: { value: new THREE.Color(blossom.species.green[2]) },
      uHeart: { value: new THREE.Vector3() },
    }),
    [shared, blossom],
  );

  const solid = useContext(DetailLevel) < FULL_DETAIL_BELOW;
  const flower = useMemo(() => partsGeometry(scan ? blossom.head : [...blossom.petals, ...blossom.head], solid), [blossom, scan, solid]);
  const flowerMaterial = useMemo(() => petalMaterial(flowerUniforms, solid), [flowerUniforms, solid]);
  const parts = useMemo(() => {
    const foliage = leafGeometry(blossom.leaves);
    const tube = emptyTube();
    const stem = new THREE.BufferGeometry();
    stem.setAttribute("position", new THREE.BufferAttribute(tube.positions, 3).setUsage(THREE.DynamicDrawUsage));
    stem.setAttribute("normal", new THREE.BufferAttribute(tube.normals, 3).setUsage(THREE.DynamicDrawUsage));
    stem.setAttribute("color", new THREE.BufferAttribute(tube.colours, 3).setUsage(THREE.DynamicDrawUsage));
    stem.setAttribute("aNear", new THREE.BufferAttribute(tube.nearness, 1).setUsage(THREE.DynamicDrawUsage));
    stem.setIndex(tubeIndex());
    return { foliage, stem, tube, path: emptyPath() };
  }, [blossom]);
  const materials = useMemo(
    () => ({
      flowerDepth: petalDepthMaterial(flowerUniforms),
      leaf: leafMaterial(leafUniforms, blossom.species.gloss),
      leafDepth: leafDepthMaterial(leafUniforms),
      stem: stemMaterial(glow, shared.uLamp),
      pod: nearLampMaterial(blossom.species.pod?.colour ?? blossom.species.green[1], 0.8, glow, shared.uLamp),
      hip: nearLampMaterial(blossom.species.stem.top, 0.6, glow, shared.uLamp),
      // No sky reaches this deep, and its grey on a dark floor would read as green.
      heart: nearLampMaterial(`#${heartColour(blossom.colour).getHexString()}`, 1, glow, shared.uLamp, 0),
      thorn: new THREE.MeshStandardMaterial({ color: "#7c4a34", roughness: 0.5 }),
    }),
    [flowerUniforms, leafUniforms, blossom, glow, shared],
  );

  useEffect(
    () => () => {
      flower.dispose();
      flowerMaterial.dispose();
    },
    [flower, flowerMaterial],
  );
  useEffect(
    () => () => {
      parts.foliage.geometry.dispose();
      parts.stem.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
    [parts, materials],
  );

  const leaves = useRef<THREE.InstancedMesh>(null);
  const thorns = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const pod = useRef<THREE.Mesh>(null);
  const heart = useRef<THREE.Mesh>(null);
  const opened = useCallback(() => smooth(life.value, LIFE.petals[0], LIFE.petals[1]), [life]);

  useFrame(({ clock }, delta) => {
    const t = life.value;
    traceStem(plan, t, sway && !hold?.value ? clock.elapsedTime : 0, parts.path);
    writeTube(plan, parts.path, parts.tube);
    for (const name of ["position", "normal", "color", "aNear"]) parts.stem.getAttribute(name).needsUpdate = true;

    const tip = placeAt(parts.path, parts.path.length);
    if (head.current) {
      head.current.position.set(tip.x, tip.y, tip.z);
      head.current.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, new THREE.Vector3(tip.tx, tip.ty, tip.tz));
      head.current.scale.setScalar(THREE.MathUtils.lerp(0.07, 1, smooth(t, LIFE.swell[0], LIFE.swell[1])));
    }
    leafUniforms.uHeart.value.set(tip.x, tip.y, tip.z);

    if (leaves.current) {
      const ages = parts.foliage.geometry.getAttribute("aAge") as THREE.InstancedBufferAttribute;
      writeLeaves(plan, parts.path, t, parts.foliage.blades, leaves.current.instanceMatrix.array as Float32Array, ages.array as Float32Array);
      leaves.current.instanceMatrix.needsUpdate = true;
      ages.needsUpdate = true;
    }
    if (thorns.current) {
      writeThorns(plan, parts.path, blossom.thorns, thorns.current.instanceMatrix.array as Float32Array);
      thorns.current.instanceMatrix.needsUpdate = true;
    }
    if (heart.current) heart.current.scale.set(0.115, 0.062, 0.115).multiplyScalar(Math.max(opened(), 0.001));
    if (pod.current) pod.current.scale.setScalar(Math.max(smooth(t, LIFE.pod[0], LIFE.pod[1]), 0.001));
    if (turn.current && spin) turn.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={turn}>
      <mesh geometry={parts.stem} material={materials.stem} frustumCulled={false} castShadow />
      <instancedMesh
        ref={leaves}
        args={[parts.foliage.geometry, materials.leaf, parts.foliage.blades.length]}
        customDepthMaterial={materials.leafDepth}
        frustumCulled={false}
        castShadow
      />
      {blossom.thorns.length > 0 && (
        <instancedMesh ref={thorns} args={[THORN, materials.thorn, blossom.thorns.length]} frustumCulled={false} castShadow />
      )}
      <group ref={head}>
        <mesh geometry={RECEPTACLE} material={materials.hip} scale={blossom.species.sepals > 0 ? 1 : 0.68} castShadow />
        {!scan && <mesh ref={heart} geometry={HEART} material={materials.heart} />}
        {scan && (
          <Suspense fallback={null}>
            <ScanHead source={scan} life={life} glow={glow} lamp={shared.uLamp.value} onReady={onScanReady} />
          </Suspense>
        )}
        {!scan && blossom.species.pod && (
          // Sits on top of the heart, so it never shows through from behind the flower.
          <group position={[0, blossom.species.pod.height * 0.7, 0]} scale={[blossom.species.pod.radius, blossom.species.pod.height, blossom.species.pod.radius]}>
            <mesh ref={pod} geometry={SPHERE} material={materials.pod} />
          </group>
        )}
        <mesh
          geometry={flower}
          material={flowerMaterial}
          customDepthMaterial={materials.flowerDepth}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
        <Lantern seed={seed} glow={glow} colour={light} open={opened} />
      </group>
    </group>
  );
}
