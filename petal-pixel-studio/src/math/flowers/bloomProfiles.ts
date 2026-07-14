import { asinDeg, hsbToThreeColor, sinDeg } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { BloomParams, FlowerType } from "@/math/flowerTypes";

export interface BloomProfile {
  thetaStart: number;
  thetaEnd: number;
  thetaStep: number;
  rStep: number;
  phiDiv: number;
  phiDecay: number;
  fade: number;
  hangA: number;
  hangB: number;
  petalCut: (theta: number, params: BloomParams) => number;
  color: (r: number, params: BloomParams) => { r: number; g: number; b: number };
}

export function getBloomProfile(type: FlowerType): BloomProfile {
  if (type === "zinnia") {
    return {
      thetaStart: -360,
      thetaEnd: 2700,
      thetaStep: 1.5,
      rStep: 0.02,
      phiDiv: 2,
      phiDecay: 16,
      fade: 6500,
      hangA: 1.3,
      hangB: 1.25,
      petalCut: (theta, params) => {
        const v = 1 - (((10.4 * params.petalFreq * theta) % 360) / 180);
        return 1 - 0.5 * Math.pow((5 / 4) * Math.pow(v, 2) - 1 / 12, 2) * params.petalAmp;
      },
      color: (r, params) =>
        params.palette
          ? // Bright-tips: catalog palettes ascend bright(pos0)->dark(pos1), so
            // sample at (1 - r) — the petal edge (r=1) lands on the bright pos-0
            // stop instead of the darkest stop that vanished into the scene. The
            // HSB fallback below stays at `r` (v1 identity).
            samplePalette(params.palette.stops, 1 - r)
          : hsbToThreeColor(335, -r * 40 + 100 + params.satShift, r * 50 + 50 + params.briShift),
    };
  }

  if (type === "camellia") {
    return {
      thetaStart: 0,
      thetaEnd: 3600,
      thetaStep: 1.5,
      rStep: 0.02,
      phiDiv: 2.5,
      phiDecay: 16,
      fade: 6000,
      hangA: 1.4,
      hangB: 1,
      petalCut: (theta, params) =>
        0.75 +
        (Math.abs(asinDeg(sinDeg(2.75 * params.petalFreq * theta)) + 80 * sinDeg(2.75 * params.petalFreq * theta)) / 480) *
          params.petalAmp,
      color: (r, params) =>
        params.palette
          ? samplePalette(params.palette.stops, 1 - r) // bright-tips (see zinnia)
          : hsbToThreeColor(335, -r * 5 + 10 + params.satShift, r * 50 + 50 + params.briShift),
    };
  }

  if (type === "lotus") {
    return {
      thetaStart: 0,
      thetaEnd: 1440,
      thetaStep: 1.5,
      rStep: 0.02,
      phiDiv: 2.5,
      phiDecay: 6.5,
      fade: 10000,
      hangA: 2.3,
      hangB: 0.8,
      petalCut: (theta, params) =>
        0.5 +
        (Math.abs(asinDeg(sinDeg(2.25 * params.petalFreq * theta)) + 120 * sinDeg(2.25 * params.petalFreq * theta)) / 360) *
          params.petalAmp,
      color: (r, params) =>
        params.palette
          ? samplePalette(params.palette.stops, 1 - r) // bright-tips (see zinnia)
          : hsbToThreeColor(310, (r * 50 - 30) * 3 + 5 + params.satShift, 100 + params.briShift),
    };
  }

  return {
    thetaStart: 0,
    thetaEnd: 5400,
    thetaStep: 1.5,
    rStep: 0.03,
    phiDiv: 1.75,
    phiDecay: 11,
    fade: 20000,
    hangA: 2.3,
    hangB: 0.9,
    petalCut: (theta, params) =>
      0.6 +
      (Math.abs(asinDeg(sinDeg(4.75 * params.petalFreq * theta)) + 420 * sinDeg(4.75 * params.petalFreq * theta)) / 2000) *
        params.petalAmp,
    color: (r, params) =>
      params.palette
        ? samplePalette(params.palette.stops, 1 - r) // bright-tips (see zinnia)
        : hsbToThreeColor(20 - r * 20, 80 - r * 40 + params.satShift, 60 + r * 40 + params.briShift),
  };
}
