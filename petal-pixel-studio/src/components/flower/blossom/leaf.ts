// A leaf is a stalk that becomes a blade. It comes out folded along its midrib and curled
// toward the stem, then its stalk arches, its blade droops and its two halves open.
// Each blade is one instance of a grid, placed on the stem from JavaScript.
import * as THREE from "three";
import { bladesOf, type Blade, type Leaf } from "@/math/blossom/stem";

const POSE = /* glsl */ `
attribute vec4 aSize;    // stalk, blade, width, teeth
attribute vec4 aCurve;   // arch, droop, fold, lobes
attribute vec2 aOutline; // waist, blunt
attribute float aAge;
varying vec2 vLeaf;
varying float vLeafAge;
varying float vTeeth;
varying float vLobes;
varying float vNear;

const float STALK_WIDTH = 0.014;

vec2 arc(float angle, float curve, float s) {
  float bend = abs(curve) < 0.001 ? 0.001 : curve;
  return vec2(sin(angle + bend * s) - sin(angle), cos(angle + bend * s) - cos(angle)) / bend;
}

vec3 leafPoint(vec2 g) {
  float u = g.x;
  float v = clamp(g.y, 0.0, 1.0);
  float age = aAge;
  float grown = mix(0.18, 1.0, age);
  float stalk = aSize.x * grown;
  float blade = aSize.y * grown;
  float total = stalk + blade;
  float at = v * total;
  float arch = mix(-0.4, aCurve.x, age);
  float droop = mix(-1.1, aCurve.y, age);
  float stalkCurve = arch / max(stalk, 0.001);
  float bladeCurve = droop / max(blade, 0.001);

  vec2 along;
  float angle;
  if (at < stalk) {
    along = arc(0.0, stalkCurve, at);
    angle = stalkCurve * at;
  } else {
    along = arc(0.0, stalkCurve, stalk) + arc(arch, bladeCurve, at - stalk);
    angle = arch + bladeCurve * (at - stalk);
  }
  float b = (at - stalk) / max(blade, 0.001);
  float inBlade = smoothstep(0.0, 0.03, b);
  float shape = pow(max(sin(PI * pow(clamp(b, 0.0, 1.0), aOutline.x)), 0.0), aOutline.y);
  float stalkWidth = (STALK_WIDTH + aSize.x * 0.016) * mix(0.5, 1.0, age);
  float width = mix(stalkWidth, aSize.z * mix(0.46, 1.0, age) * shape, inBlade);
  // The halves part last, once the blade has its length. A stalk stays a deep V, so it
  // keeps its thickness from every side.
  float fold = mix(1.1, mix(1.42, aCurve.z, smoothstep(0.3, 1.0, age)), inBlade);
  float lift = abs(u) * width * sin(fold) * inBlade;
  // The surface swells between the side veins, and the margin waves a little.
  float quilt = 0.01 * sin((b - abs(u) * 0.42) * 22.0) * abs(u) * (1.0 - abs(u)) * inBlade;
  float wave = 0.016 * sin(b * 9.0 + u * 2.0) * u * u * inBlade;
  lift += (quilt + wave) * age;
  vec2 up = vec2(sin(angle), cos(angle));
  return vec3(along.x + up.x * lift, along.y + up.y * lift, u * width * cos(fold));
}
`;

const SKIN = /* glsl */ `
uniform float uGlow;
uniform vec3 uLamp;
uniform vec3 uSun;
uniform vec3 uShade;
uniform vec3 uGreen;
uniform vec3 uBright;
varying vec2 vLeaf;
varying float vLeafAge;
varying float vTeeth;
varying float vLobes;
varying float vNear;
`;

export interface LeafUniforms {
  uGlow: { value: number };
  uLamp: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
  uShade: { value: THREE.Color };
  uGreen: { value: THREE.Color };
  uBright: { value: THREE.Color };
  uHeart: { value: THREE.Vector3 };
}

function spliceVertex(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: LeafUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${POSE}`)
    .replace("#include <begin_vertex>", "vec3 transformed = leafPoint(position.xy);");
}

export function leafMaterial(uniforms: LeafUniforms, gloss: number): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide,
    roughness: THREE.MathUtils.lerp(0.72, 0.3, gloss),
    specularIntensity: THREE.MathUtils.lerp(0.35, 0.8, gloss),
  });
  material.onBeforeCompile = (shader) => {
    spliceVertex(shader, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHeart;")
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        float stepV = position.y > 0.5 ? -0.02 : 0.02;
        vec3 p0 = leafPoint(position.xy);
        vec3 pu = leafPoint(position.xy + vec2(position.x > 0.0 ? -0.1 : 0.1, 0.0));
        vec3 pv = leafPoint(position.xy + vec2(0.0, stepV));
        vec3 foldNormal = cross(pu - p0, pv - p0) * sign(stepV) * (position.x > 0.0 ? -1.0 : 1.0);
        vec3 objectNormal = dot(foldNormal, foldNormal) > 1e-16 ? normalize(foldNormal) : vec3(0.0, 1.0, 0.0);
        float bladeLength = max(aSize.y, 0.001);
        vLeaf = vec2(position.x, (position.y * (aSize.x + aSize.y) - aSize.x) / bladeLength);
        vLeafAge = aAge;
        vTeeth = aSize.w;
        vLobes = aCurve.w;
        vNear = exp(-length((instanceMatrix * vec4(p0, 1.0)).xyz - uHeart) * 1.5);
        `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKIN}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        float side = abs(vLeaf.x);
        float b = vLeaf.y;
        float blade = step(0.0, b);
        // The margin is cut here, a pixel at a time, so teeth stay sharp at any size.
        if (blade > 0.5 && vTeeth > 0.0 && side > 1.0 - vTeeth * (1.0 - fract(b * 7.0))) discard;
        if (blade > 0.5 && vLobes > 0.0) {
          float notch = abs(cos(b * PI * vLobes * 2.0));
          if (side > 0.34 + 0.66 * sqrt(notch)) discard;
        }
        float rib = 1.0 - smoothstep(0.0, 0.05, side);
        float vein = smoothstep(0.88, 1.0, abs(sin((b - side * 0.42) * 22.0))) * (1.0 - side * 0.5);
        vec3 leaf = mix(uShade, uGreen, smoothstep(0.0, 0.8, b * 0.5 + side * 0.6));
        leaf = mix(leaf, uBright, rib * 0.62 + vein * 0.2);
        // Young leaves are tender and light, and the underside of any leaf is paler.
        leaf = mix(leaf, uBright, (1.0 - vLeafAge) * 0.5);
        if (!gl_FrontFacing) leaf = mix(leaf, uBright, 0.42);
        if (blade < 0.5) leaf = uGreen;
        diffuseColor.rgb = leaf;
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        vec3 bounced = diffuseColor.rgb * diffuseColor.rgb;
        totalEmissiveRadiance += (1.0 - uGlow) * bounced * 0.14;
        // Sun comes through a leaf from behind, yellower than it went in.
        vec3 sun = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
        float behind = pow(clamp(0.5 - 0.5 * dot(normal, sun), 0.0, 1.0), 1.6);
        totalEmissiveRadiance += (1.0 - uGlow) * diffuseColor.rgb * vec3(1.0, 1.1, 0.45) * behind * 0.26;
        // Leaves catch a little of the light falling from the flower above them.
        totalEmissiveRadiance += uGlow * uLamp * diffuseColor.rgb * (0.04 + vNear * 0.9);
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-leaf";
  return material;
}

export function leafDepthMaterial(uniforms: LeafUniforms): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => spliceVertex(shader, uniforms);
  material.customProgramCacheKey = () => "blossom-leaf-depth";
  return material;
}

/** One grid for all the blades, with what makes each of them different. */
export function leafGeometry(leaves: readonly Leaf[]): { geometry: THREE.InstancedBufferGeometry; blades: Blade[] } {
  const blades = bladesOf(leaves);
  const grid = new THREE.PlaneGeometry(2, 1, 10, 44);
  grid.translate(0, 0.5, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = grid.index;
  geometry.setAttribute("position", grid.attributes.position);
  geometry.setAttribute("normal", grid.attributes.normal);
  geometry.setAttribute("uv", grid.attributes.uv);
  const array = (size: number, fill: (blade: Blade) => number[]) =>
    new THREE.InstancedBufferAttribute(new Float32Array(blades.flatMap(fill)), size);
  const scaleOf = ({ leaflet }: Blade) => leaflet?.scale ?? 1;
  geometry.setAttribute(
    "aSize",
    array(4, (blade) => [
      blade.leaflet ? 0.02 : blade.leaf.stalk,
      blade.leaf.blade * scaleOf(blade),
      blade.leaf.width * scaleOf(blade),
      blade.leaf.teeth,
    ]),
  );
  geometry.setAttribute(
    "aCurve",
    array(4, (blade) => [blade.leaflet ? 0 : blade.leaf.arch, blade.leaf.droop, blade.leaf.fold, blade.leaf.lobes]),
  );
  geometry.setAttribute("aOutline", array(2, (blade) => [blade.leaf.waist, blade.leaf.blunt]));
  const ages = new THREE.InstancedBufferAttribute(new Float32Array(blades.length), 1);
  ages.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aAge", ages);
  return { geometry, blades };
}

