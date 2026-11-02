// THROWAWAY SPIKE. Folds any finished flower into a bud on the GPU.
//
// Every vertex is read in polar form around the flower's base: how far out it
// is (rho) and how far it leans from straight up (alpha). The closed bud is a
// solid of revolution; a vertex's rho picks its height in that solid and its
// alpha picks how close to the skin it sits, so outer petals become the skin
// and inner petals end up inside. Growing just sweeps rho, alpha and the twist
// from the bud pose back to the real flower, which is why petals swing open
// instead of sliding in a straight line. At grow = 1 this is the exact flower.
import * as THREE from "three";

export const grow = { value: 1 };

export const BUD = {
  height: 0.78,
  width: 0.34,
  belly: 0.72,
  layers: 0.55,
  twist: 1.5,
  stagger: 0.32,
};

const foldGlsl = /* glsl */ `
uniform float uGrow;
uniform float uAlphaMax;
uniform float uFloor;

vec3 petalFold(vec3 p) {
  float rho = length(p);
  if (rho < 1e-4) return p;
  float alpha = acos(clamp(p.y / rho, -1.0, 1.0));
  float phi = atan(p.z, p.x);
  float u = clamp(rho, 0.0, 1.0);
  float a = clamp(alpha / uAlphaMax, 0.0, 1.0);

  // Outer petals open first, the heart of the flower last.
  float t = clamp((uGrow - (1.0 - a) * ${BUD.stagger.toFixed(3)}) / ${(1 - BUD.stagger).toFixed(3)}, 0.0, 1.0);
  float closed = 1.0 - t * t * t * (t * (t * 6.0 - 15.0) + 10.0);

  // Everything shorter than the petals (stamens, the centre dome) folds into the
  // base of the bud; otherwise it hangs below it like legs.
  float v = clamp((u - uFloor) / (1.0 - uFloor), 0.0, 1.0);
  float budY = ${BUD.height.toFixed(3)} * v;
  float budR = ${BUD.width.toFixed(3)} * sin(PI * pow(v, ${BUD.belly.toFixed(3)})) * pow(a, ${BUD.layers.toFixed(3)});
  float rhoBud = length(vec2(budR, budY));
  // atan(0, 0) is undefined, and one NaN pixel turns the whole frame black in bloom.
  float alphaBud = rhoBud > 1e-5 ? atan(budR, budY) : alpha;
  float rhoNew = mix(rho, rhoBud, closed);
  float alphaNew = mix(alpha, alphaBud, closed);
  float phiNew = phi + ${BUD.twist.toFixed(3)} * u * closed;

  float s = sin(alphaNew);
  return vec3(rhoNew * s * cos(phiNew), rhoNew * cos(alphaNew), rhoNew * s * sin(phiNew));
}
`;

export interface BakedFlower {
  geometry: THREE.BufferGeometry;
  alphaMax: number;
  /** Where the petals start, as a share of the flower's reach. */
  floor: number;
  /** Middle of the open flower above its base, to keep it framed while it grows. */
  openCentreY: number;
}

/** Stands the flower on its base at the origin, with its farthest point at 1. */
export function bakeFlower(source: THREE.BufferGeometry, family: string): BakedFlower {
  const g = source.clone();
  g.rotateX(family === "classic" ? -Math.PI / 2 : Math.PI);

  const pos = g.attributes.position;
  let rMax = 0;
  for (let i = 0; i < pos.count; i += 1) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getZ(i)));
  let yBase = Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.hypot(pos.getX(i), pos.getZ(i)) < rMax * 0.12) yBase = Math.min(yBase, pos.getY(i));
  }
  g.translate(0, -yBase, 0);

  let rhoMax = 0;
  const rhos: number[] = [];
  const alphas: number[] = [];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rho = Math.hypot(x, y, z);
    rhoMax = Math.max(rhoMax, rho);
    rhos.push(rho);
    if (rho > 1e-6) alphas.push(Math.acos(THREE.MathUtils.clamp(y / rho, -1, 1)));
  }
  // A percentile, not the maximum: a few stray vertices must not make the whole
  // flower read as "inner layers" and leave the bud thin.
  alphas.sort((a, b) => a - b);
  const alphaMax = alphas[Math.floor(alphas.length * 0.9)];
  rhos.sort((a, b) => a - b);
  const floor = rhos[Math.floor(rhos.length * 0.12)] / rhoMax;
  g.scale(1 / rhoMax, 1 / rhoMax, 1 / rhoMax);
  g.computeBoundingBox();
  const box = g.boundingBox as THREE.Box3;
  return { geometry: g, alphaMax, floor, openCentreY: (box.min.y + box.max.y) / 2 };
}

/** The studio's satin petal material, with the fold spliced into its vertex stage. */
export function foldedMaterial(highlightHex: string, alphaMax: number, floor: number): THREE.MeshPhysicalMaterial {
  const highlight = new THREE.Color(highlightHex);
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.66,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: highlight,
    clearcoat: 0.18,
    clearcoatRoughness: 0.35,
    emissive: highlight,
    emissiveIntensity: 0.015,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrow = grow;
    shader.uniforms.uAlphaMax = { value: alphaMax };
    shader.uniforms.uFloor = { value: floor };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${foldGlsl}`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        vec3 foldN = normalize(normal);
        vec3 foldT = normalize(cross(foldN, abs(foldN.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 foldB = cross(foldN, foldT);
        vec3 foldP = petalFold(position);
        vec3 foldC = cross(petalFold(position + foldT * 0.004) - foldP, petalFold(position + foldB * 0.004) - foldP);
        vec3 objectNormal = dot(foldC, foldC) > 1e-16 ? normalize(foldC) : foldN;
        `,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = foldP;");
  };
  material.customProgramCacheKey = () => "bud-fold";
  return material;
}
