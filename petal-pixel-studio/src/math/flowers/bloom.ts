import * as THREE from "three";
import type { BloomParams, FlowerType } from "@/math/flowerTypes";
import { cosDeg, sinDeg } from "@/math/supplement";
import { getBloomProfile } from "@/math/flowers/bloomProfiles";

export function createParametricBloomGeometry(type: FlowerType, params: BloomParams) {
  const profile = getBloomProfile(type);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const thetaStep = Math.max(0.1, profile.thetaStep * params.thetaStep);
  const rStep = Math.max(0.005, profile.rStep * params.rStep);

  const rValues: number[] = [];
  for (let r = 0; r <= 1.000001; r += rStep) {
    rValues.push(Math.min(1, r));
  }

  const thetaValues: number[] = [];
  for (let theta = profile.thetaStart; theta <= profile.thetaEnd + 0.0001; theta += thetaStep) {
    thetaValues.push(theta);
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
