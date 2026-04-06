import type { FlowerParams as BackendFlowerParams } from "@/gen/flower/v1/service_pb";
import {
  BLOOM_TYPES,
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  FLOWER_TYPES,
  type BloomParams,
  type ClassicParams,
  type FlowerType,
  type RoseParams,
} from "@/math/flowerTypes";
import { createClassicFlowerGeometry } from "@/math/flowers/classic";
import { createParametricBloomGeometry } from "@/math/flowers/bloom";
import { createRoseFlowerGeometry } from "@/math/flowers/rose";

export { createClassicFlowerGeometry, createParametricBloomGeometry, createRoseFlowerGeometry };

export function pickFlowerTypeFromSeed(seed: bigint): FlowerType {
  const safe = Number(seed % BigInt(FLOWER_TYPES.length));
  return FLOWER_TYPES[safe] ?? "classic";
}

export function toTechniqueParams(seed: bigint, backend?: BackendFlowerParams): {
  flowerType: FlowerType;
  classicParams: ClassicParams;
  roseParams: RoseParams;
  bloomParams: BloomParams;
} {
  const seedN = Number(seed % BigInt(1_000_000));
  const flowerType = pickFlowerTypeFromSeed(seed);

  const classicParams: ClassicParams = {
    ...DEFAULT_CLASSIC_PARAMS,
    pNum: backend?.petalCount ? Math.max(2, Math.min(20, backend.petalCount)) : 5 + (seedN % 8),
    pLen: backend?.petalLength ? 40 + backend.petalLength * 40 : DEFAULT_CLASSIC_PARAMS.pLen + (seedN % 30),
    pSharp: backend?.petalWidth ? Math.max(0.12, Math.min(2, backend.petalWidth)) : DEFAULT_CLASSIC_PARAMS.pSharp + (seedN % 20) / 100,
    curve1: backend?.curvature ? 1 + backend.curvature * 0.8 : DEFAULT_CLASSIC_PARAMS.curve1,
    curve2: backend?.curvature ? 0.2 + Math.abs(backend.curvature) * 0.2 : DEFAULT_CLASSIC_PARAMS.curve2,
    fHeight: backend?.stemHeight ? 220 + backend.stemHeight * 50 : DEFAULT_CLASSIC_PARAMS.fHeight,
  };

  const roseParams: RoseParams = {
    ...DEFAULT_ROSE_PARAMS,
    opening: 1.4 + ((seedN % 20) / 10),
    vDensity: 6 + ((seedN % 40) / 5),
    pAlign: 2.2 + ((seedN % 30) / 20),
    curve1: backend?.curvature ? 1 + backend.curvature * 1.2 : DEFAULT_ROSE_PARAMS.curve1,
    curve2: 0.8 + ((seedN % 20) / 100) + (backend?.petalWidth ?? 0) * 0.2,
  };

  const bloomParams: BloomParams = {
    ...DEFAULT_BLOOM_PARAMS,
    scale: 240 + (seedN % 160),
    opening: 0.7 + ((seedN % 30) / 30),
    density: 0.8 + ((seedN % 40) / 40),
    petalFreq: 0.7 + ((seedN % 60) / 60),
    petalAmp: 0.8 + ((seedN % 50) / 50),
    hangDown: 0.7 + ((seedN % 60) / 40),
    satShift: ((seedN % 40) - 20),
    briShift: ((seedN % 30) - 15),
  };

  return { flowerType, classicParams, roseParams, bloomParams };
}

export function isBloomType(type: FlowerType) {
  return BLOOM_TYPES.includes(type);
}
