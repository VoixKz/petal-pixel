import * as THREE from "three";
import type { BloomParams, FlowerType } from "@/math/flowerTypes";
import { cosDeg, sinDeg } from "@/math/supplement";
import { getBloomProfile } from "@/math/flowers/bloomProfiles";
import { solidify, SHELL_THICKNESS } from "@/math/flowers/shell";
import { addCenterDome } from "@/math/flowers/center";

/**
 * Pre-shell surface budget for the bloom family. The bloom sweep has no vertex
 * cap of its own (~100k verts at the dense end); solidify() then ~doubles it, so
 * cap the base grid here (post-shell ≈ 70k). We coarsen the shared theta/r steps
 * uniformly rather than clipping the sweep, so appearance is ~identical.
 */
export const BLOOM_SURFACE_CAP = 35000;

export function createParametricBloomGeometry(type: FlowerType, params: BloomParams) {
  const profile = getBloomProfile(type);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  let thetaStep = Math.max(0.1, profile.thetaStep * params.thetaStep);
  let rStep = Math.max(0.005, profile.rStep * params.rStep);

  const buildRValues = () => {
    const out: number[] = [];
    for (let r = 0; r <= 1.000001; r += rStep) out.push(Math.min(1, r));
    return out;
  };
  const buildThetaValues = () => {
    const out: number[] = [];
    for (let theta = profile.thetaStart; theta <= profile.thetaEnd + 0.0001; theta += thetaStep) {
      out.push(theta);
    }
    return out;
  };

  let rValues = buildRValues();
  let thetaValues = buildThetaValues();

  // Vertex-cap guard (before the shell doubles the count): if the grid would
  // exceed BLOOM_SURFACE_CAP, coarsen both steps by sqrt(est/cap) and rebuild.
  const est = rValues.length * thetaValues.length;
  if (est > BLOOM_SURFACE_CAP) {
    const grow = Math.sqrt(est / BLOOM_SURFACE_CAP);
    thetaStep = Math.max(0.1, thetaStep * grow);
    rStep = Math.max(0.005, rStep * grow);
    rValues = buildRValues();
    thetaValues = buildThetaValues();
  }

  const indexGrid = Array.from({ length: rValues.length }, () => Array(thetaValues.length).fill(-1));

  for (let ri = 0; ri < rValues.length; ri += 1) {
    const r = rValues[ri];
    const color = profile.color(r, params);

    for (let ti = 0; ti < thetaValues.length; ti += 1) {
      const theta = thetaValues[ti];
      const phi = (180 / (profile.phiDiv * params.opening)) * Math.exp(-theta / (profile.phiDecay * params.density * 180));
      const petalCut = THREE.MathUtils.clamp(profile.petalCut(theta, params), 0.15, 1.9);
      const hangDown = profile.hangA * params.hangDown * Math.pow(r, 2) * Math.pow(profile.hangB * r - 1, 2) * sinDeg(phi);
      const centerSoftness = THREE.MathUtils.smoothstep(r, 0.03, 0.24);
      const radialCore = petalCut * Math.max(0, r * sinDeg(phi) + hangDown * cosDeg(phi)) * centerSoftness;

      if (radialCore <= 0) {
        continue;
      }

      const shrink = Math.max(0.05, 1 - theta / (profile.fade * params.fade));
      const scale = params.scale * shrink;
      if (scale <= 0) {
        continue;
      }

      const x = scale * radialCore * sinDeg(theta);
      const y = -scale * petalCut * (r * cosDeg(phi) - hangDown * sinDeg(phi));
      const z = scale * radialCore * cosDeg(theta);

      const index = positions.length / 3;
      indexGrid[ri][ti] = index;

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let ri = 0; ri < rValues.length - 1; ri += 1) {
    for (let ti = 0; ti < thetaValues.length - 1; ti += 1) {
      const a = indexGrid[ri][ti];
      const b = indexGrid[ri + 1][ti];
      const c = indexGrid[ri + 1][ti + 1];
      const d = indexGrid[ri][ti + 1];

      if (a >= 0 && b >= 0 && c >= 0) {
        indices.push(a, b, c);
      }
      if (a >= 0 && c >= 0 && d >= 0) {
        indices.push(a, c, d);
      }
    }
  }

  // Fill the soft/flat centre with a small deep dome + stamens (colour = the
  // deep inner stop, i.e. profile.color at r=0 under the bright-tips reversal).
  // Appended after the base surface (append-after-base invariant).
  const inner = profile.color(0, params);
  const innerColor = new THREE.Color().setRGB(inner.r, inner.g, inner.b);
  addCenterDome(positions, colors, indices, {
    radius: Math.max(4, params.scale * 0.05),
    height: Math.max(4, params.scale * 0.04),
    color: innerColor,
    up: "y",
    baseOffset: 0,
    stamens: 7,
  });

  // Petal thickness: append a normal-offset backing shell after the base surface.
  const solid = solidify(positions, colors, indices, SHELL_THICKNESS);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(solid.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(solid.colors, 3));
  geometry.setIndex(solid.indices);
  geometry.computeVertexNormals();
  return geometry;
}
