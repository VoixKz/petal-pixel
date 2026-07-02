import * as THREE from "three";
import type { FlowerParams as BackendFlowerParams } from "@/gen/flower/v1/service_pb";
import {
  BLOOM_TYPES,
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  FLOWER_TYPES,
  type BloomParams,
  type ClassicParams,
  type FlowerFamily,
  type FlowerType,
  type RhodoneaParams,
  type RoseParams,
  type SunflowerParams,
  type SuperformulaParams,
} from "@/math/flowerTypes";
import { createClassicFlowerGeometry } from "@/math/flowers/classic";
import { createParametricBloomGeometry } from "@/math/flowers/bloom";
import { createRoseFlowerGeometry } from "@/math/flowers/rose";
import { createSunflowerGeometry } from "@/math/flowers/sunflower";
import { createRhodoneaGeometry } from "@/math/flowers/rhodonea";
import { createSuperformulaGeometry } from "@/math/flowers/superformula";
import type { Palette, PaletteStop } from "@/math/palette";
import { samplePalette } from "@/math/palette";
import { bumpiness, vShape } from "@/math/supplement";

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

// ─── v2 render contract ───────────────────────────────────────────────────────

/** Shape of the v2 param bundle that toV2Params returns and buildV2Geometry consumes. */
export interface V2Params {
  family: FlowerFamily;
  palette: Palette;
  classicParams?: ClassicParams;
  roseParams?: RoseParams;
  bloomParams?: BloomParams;
  sunflowerParams?: SunflowerParams;
  rhodoneaParams?: RhodoneaParams;
  superformulaParams?: SuperformulaParams;
}

/** Map a backend PaletteSpec (proto ColorStop.position/hex) to the render-side Palette. */
function toPalette(backendPalette: BackendFlowerParams["palette"]): Palette {
  const stops: PaletteStop[] = (backendPalette?.stops ?? []).map((s) => ({
    pos: s.position,
    hex: s.hex,
  }));
  return { id: backendPalette?.id ?? "", stops };
}

/**
 * Read the backend v2 render contract (proto oneof `shape` + `palette`) into the
 * render-side param bundle. Peer of toTechniqueParams (the v1 fallback), which is
 * left UNTOUCHED. Maps ColorStop.position -> PaletteStop.pos and passes hex through.
 */
export function toV2Params(backend: BackendFlowerParams): V2Params {
  const palette = toPalette(backend.palette);
  const out: V2Params = { family: backend.family as FlowerFamily, palette };
  // Guard: a FlowerParams created without a shape set can surface `shape` as
  // undefined (rather than `{ case: undefined }`) depending on the codegen; the
  // nullish default keeps the switch from throwing on `.case`.
  const shape = backend.shape ?? ({ case: undefined } as const);
  switch (shape.case) {
    case "classic":
      out.classicParams = { ...shape.value, palette };
      break;
    case "rose":
      out.roseParams = { ...shape.value, palette };
      break;
    case "bloom":
      out.bloomParams = { ...shape.value, palette };
      break;
    case "sunflower":
      out.sunflowerParams = { ...shape.value };
      break;
    case "rhodonea":
      out.rhodoneaParams = { ...shape.value };
      break;
    case "superformula":
      out.superformulaParams = { ...shape.value };
      break;
    default:
      break;
  }
  return out;
}

/**
 * v2 dispatch: build the right BufferGeometry for params.family. The 6 existing
 * families reuse the v1 builders (classic gains a palette color attribute via the
 * V2 wrapper); the 3 new families use the family-math builders. All v2 geometry
 * carries a vertex "color" attribute (Flower3D sets vertexColors:true for v2).
 */
function required<T>(value: T | undefined, family: string, name: string): T {
  if (value == null) {
    throw new Error(`buildV2Geometry: family="${family}" but ${name} is missing`);
  }
  return value;
}

export function buildV2Geometry(params: V2Params): THREE.BufferGeometry {
  const palette = params.palette;
  switch (params.family) {
    case "rose":
      return createRoseFlowerGeometry({ ...required(params.roseParams, "rose", "roseParams"), palette });
    case "zinnia":
    case "camellia":
    case "lotus":
    case "dahlia":
      return createParametricBloomGeometry(params.family, { ...required(params.bloomParams, params.family, "bloomParams"), palette });
    case "sunflower":
      return createSunflowerGeometry(required(params.sunflowerParams, "sunflower", "sunflowerParams"), palette);
    case "rhodonea":
      return createRhodoneaGeometry(required(params.rhodoneaParams, "rhodonea", "rhodoneaParams"), palette);
    case "superformula":
      return createSuperformulaGeometry(required(params.superformulaParams, "superformula", "superformulaParams"), palette);
    case "classic":
    default:
      // classic tolerates a missing param set (falls back to defaults).
      return createClassicFlowerGeometryV2(params.classicParams ?? DEFAULT_CLASSIC_PARAMS, palette);
  }
}

/**
 * v2 classic: reruns the v1 createClassicFlowerGeometry position/index math
 * verbatim and adds a per-vertex color attribute sampled from the palette at the
 * radial parameter t = theta/rows. v1 createClassicFlowerGeometry stays untouched.
 */
export function createClassicFlowerGeometryV2(params: ClassicParams, palette: Palette): THREE.BufferGeometry {
  const { rows, cols, pNum, fD, pLen, pSharp, fHeight, curve1, curve2, b, bNum } = params;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let theta = 1; theta < rows; theta += 1) {
    const t = theta / rows; // radial 0..1
    const color = samplePalette(palette.stops, t);
    for (let phi = 0; phi < cols; phi += 1) {
      const angle = (phi * Math.PI * 2) / cols;
      const r = ((pLen * Math.pow(Math.abs(Math.sin((pNum / 2) * angle)), pSharp) + fD) * theta) / rows;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      const z = vShape(fHeight, r / 100, curve1, curve2, 1.5) - 200 + bumpiness(b, r / 100, bNum, angle);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let theta = 0; theta < rows - 2; theta += 1) {
    for (let phi = 0; phi < cols; phi += 1) {
      const nextPhi = (phi + 1) % cols;
      const a = theta * cols + phi;
      const bIndex = (theta + 1) * cols + phi;
      const c = (theta + 1) * cols + nextPhi;
      const d = theta * cols + nextPhi;
      indices.push(a, bIndex, c);
      indices.push(a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
