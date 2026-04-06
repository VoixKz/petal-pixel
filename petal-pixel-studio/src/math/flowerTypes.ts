export const FLOWER_TYPES = ["classic", "rose", "zinnia", "camellia", "lotus", "dahlia"] as const;
export type FlowerType = (typeof FLOWER_TYPES)[number];

export const BLOOM_TYPES: FlowerType[] = ["zinnia", "camellia", "lotus", "dahlia"];

export interface ClassicParams {
  rows: number;
  cols: number;
  pNum: number;
  fD: number;
  pLen: number;
  pSharp: number;
  fHeight: number;
  curve1: number;
  curve2: number;
  b: number;
  bNum: number;
}

export interface RoseParams {
  opening: number;
  vDensity: number;
  pAlign: number;
  curve1: number;
  curve2: number;
}

export interface BloomParams {
  scale: number;
  opening: number;
  density: number;
  petalFreq: number;
  petalAmp: number;
  hangDown: number;
  fade: number;
  thetaStep: number;
  rStep: number;
  satShift: number;
  briShift: number;
}

export const DEFAULT_CLASSIC_PARAMS: ClassicParams = {
  rows: 84,
  cols: 144,
  pNum: 5,
  fD: 190,
  pLen: 54,
  pSharp: 0.32,
  fHeight: 320,
  curve1: 1.05,
  curve2: 0.24,
  b: 1.15,
  bNum: 7,
};

export const DEFAULT_ROSE_PARAMS: RoseParams = {
  opening: 2.6,
  vDensity: 9.2,
  pAlign: 3.15,
  curve1: 1.7,
  curve2: 1.12,
};

export const DEFAULT_BLOOM_PARAMS: BloomParams = {
  scale: 300,
  opening: 1,
  density: 1,
  petalFreq: 1,
  petalAmp: 1,
  hangDown: 1,
  fade: 1,
  thetaStep: 1,
  rStep: 1,
  satShift: 0,
  briShift: 0,
};
