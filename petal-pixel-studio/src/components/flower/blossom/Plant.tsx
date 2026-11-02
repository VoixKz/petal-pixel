import { Component, Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildBlossom, type Blossom } from "@/math/blossom/build";
import { LIFE, smooth } from "@/math/blossom/life";
import { emptyPath, emptyTube, placeAt, traceStem, tubeIndex, writeLeaves, writeThorns, writeTube } from "@/math/blossom/stem";
import type { HeadSource, Species } from "@/math/blossom/species";
import { forgetHead, Head } from "./Head";
import { leafDepthMaterial, leafGeometry, leafMaterial, type LeafUniforms } from "./leaf";
import { Lantern } from "./Lantern";

/** Where the day light comes from, so petals can glow when it is behind them. */
const SUN = new THREE.Vector3(3, 7, 4).normalize();
const AIR_BRIGHTNESS = 0.3;

/** Carries the flower off the end of the stem. A bud's base folds up, so the neck is long under it. */
const NECK = new THREE.LatheGeometry(
  [
    [0.02, 0],
    [0.021, 0.3],
    [0.024, 0.62],
    [0.032, 0.86],
    [0.05, 0.97],
    [0, 1],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  16,
);
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

/** Lit by the lamp it sits around. */
function nearLampMaterial(colour: string, roughness: number, glow: { value: number }, lamp: { value: THREE.Color }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uGlow: glow, uLamp: lamp });
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;\nuniform vec3 uLamp;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance += uGlow * uLamp * diffuseColor.rgb * 1.5;");
  };
  material.customProgramCacheKey = () => "blossom-near-lamp";
  return material;
}

/** A flower that will not load leaves its stem standing, and the page around it. */
class HeadGuard extends Component<{ source: HeadSource; onFail?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    forgetHead(this.props.source);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface PlantProps {
  seed: string;
  species?: Species;
  /** Called once the flower itself has loaded and can be seen. */
  onHeadReady?: () => void;
  /** Called if the flower could not be loaded. The stem stays. */
  onHeadFailed?: () => void;
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

export function Plant({ seed, species, onHeadReady, onHeadFailed, life, glow, lamp = "#ffcf9e", spin = false, sway = false, hold, onBuilt }: PlantProps) {
  const blossom = useMemo(() => buildBlossom(seed, species), [seed, species]);
  useEffect(() => onBuilt?.(blossom), [blossom, onBuilt]);

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
      leaf: leafMaterial(leafUniforms, blossom.species.gloss),
      leafDepth: leafDepthMaterial(leafUniforms),
      stem: stemMaterial(glow, shared.uLamp),
      hip: nearLampMaterial(blossom.species.stem.top, 0.6, glow, shared.uLamp),
      thorn: new THREE.MeshStandardMaterial({ color: "#4a3324", roughness: 0.6 }),
    }),
    [leafUniforms, blossom, glow, shared],
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
  const neck = useRef<THREE.Mesh>(null);
  const opened = useCallback(() => smooth(life.value, LIFE.petals[0], LIFE.petals[1]), [life]);

  useFrame(({ clock }, delta) => {
    const t = life.value;
    traceStem(blossom.stem, t, sway && !hold?.value ? clock.elapsedTime : 0, parts.path);
    writeTube(blossom.stem, parts.path, parts.tube);
    for (const name of ["position", "normal", "color", "aNear"]) parts.stem.getAttribute(name).needsUpdate = true;

    const tip = placeAt(parts.path, parts.path.length);
    if (head.current) {
      head.current.position.set(tip.x, tip.y, tip.z);
      head.current.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, new THREE.Vector3(tip.tx, tip.ty, tip.tz));
      head.current.scale.setScalar(THREE.MathUtils.lerp(0.07, 1, smooth(t, LIFE.swell[0], LIFE.swell[1])));
    }
    if (neck.current) neck.current.scale.set(1, 0.05 + blossom.species.head.neck * (1 - opened()), 1);
    leafUniforms.uHeart.value.set(tip.x, tip.y, tip.z);

    if (leaves.current) {
      const ages = parts.foliage.geometry.getAttribute("aAge") as THREE.InstancedBufferAttribute;
      writeLeaves(blossom.stem, parts.path, t, parts.foliage.blades, leaves.current.instanceMatrix.array as Float32Array, ages.array as Float32Array);
      leaves.current.instanceMatrix.needsUpdate = true;
      ages.needsUpdate = true;
    }
    if (thorns.current) {
      writeThorns(blossom.stem, parts.path, blossom.thorns, thorns.current.instanceMatrix.array as Float32Array);
      thorns.current.instanceMatrix.needsUpdate = true;
    }
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
        <mesh ref={neck} geometry={NECK} material={materials.hip} castShadow />
        <HeadGuard source={blossom.species.head} onFail={onHeadFailed}>
          <Suspense fallback={null}>
            <Head
              source={blossom.species.head}
              tint={blossom.tint}
              fullness={blossom.fullness}
              turn={blossom.turn}
              life={life}
              glow={glow}
              lamp={shared.uLamp.value}
              onReady={onHeadReady}
            />
          </Suspense>
        </HeadGuard>
        <Lantern seed={seed} glow={glow} colour={light} open={opened} />
      </group>
    </group>
  );
}
