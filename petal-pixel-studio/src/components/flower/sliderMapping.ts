import type { FlowerType } from "@/math/flowerTypes";
import { BLOOM_TYPES } from "@/math/flowerTypes";

export interface SliderMapping {
  param: "classic" | "rose" | "bloom";
  key: string;
  min: number;
  max: number;
  step: number;
}

export function mapPetalCount(flowerType: FlowerType): SliderMapping | null {
  if (flowerType === "rose") return null;
  if (BLOOM_TYPES.includes(flowerType)) {
    return { param: "bloom", key: "petalFreq", min: 0.4, max: 2.2, step: 0.05 };
  }
  return { param: "classic", key: "pNum", min: 1, max: 20, step: 1 };
}

export function mapPetalDepth(flowerType: FlowerType): SliderMapping | null {
  if (flowerType === "rose") return null;
  if (BLOOM_TYPES.includes(flowerType)) {
    return { param: "bloom", key: "petalAmp", min: 0.4, max: 2.2, step: 0.05 };
  }
  return { param: "classic", key: "pSharp", min: 0, max: 1.4, step: 0.01 };
}

export function mapPetalSize(flowerType: FlowerType): SliderMapping | null {
  if (flowerType === "rose") return null;
  if (BLOOM_TYPES.includes(flowerType)) {
    return { param: "bloom", key: "scale", min: 120, max: 420, step: 1 };
  }
  return { param: "classic", key: "pLen", min: 20, max: 120, step: 1 };
}
