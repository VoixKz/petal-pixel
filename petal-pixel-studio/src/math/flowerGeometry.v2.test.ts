import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { FlowerParams as BackendFlowerParams } from "@/gen/flower/v1/service_pb";
import { toV2Params, buildV2Geometry, createClassicFlowerGeometryV2 } from "@/math/flowerGeometry";
import { DEFAULT_CLASSIC_PARAMS } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const PALETTE: Palette = {
  id: "sunset_coral",
  stops: [
    { pos: 0, hex: "#ff8a5c" },
    { pos: 1, hex: "#c81d54" },
  ],
};

// Minimal builder for the generated connect-es v2 message with a oneof `shape`.
function backendSunflower(): BackendFlowerParams {
  return {
    // scalars 1-9 present but irrelevant to v2 dispatch
    algoVersion: "v2",
    family: "sunflower",
    palette: {
      id: "sunset_coral",
      stops: [
        { position: 0, hex: "#ff8a5c", r: 1, g: 0.541, b: 0.361 },
        { position: 1, hex: "#c81d54", r: 0.784, g: 0.114, b: 0.329 },
      ],
      hueShift: 0,
      satShift: 0,
      briShift: 0,
    },
    shape: {
      case: "sunflower",
      value: {
        scale: 300,
        floretRings: 60,
        floretSpokes: 160,
        domeHeight: 40,
        discRatio: 0.6,
        rayPetals: 34,
        rayLength: 0.5,
        rayWidth: 0.8,
        seedPacking: 1,
        satShift: 0,
        briShift: 0,
      },
    },
  } as unknown as BackendFlowerParams;
}

describe("toV2Params", () => {
  it("maps proto family + palette (position->pos, hex) + the oneof value", () => {
    const out = toV2Params(backendSunflower());
    expect(out.family).toBe("sunflower");
    expect(out.palette.id).toBe("sunset_coral");
    // ColorStop.position -> PaletteStop.pos; hex passthrough
    expect(out.palette.stops).toEqual([
      { pos: 0, hex: "#ff8a5c" },
      { pos: 1, hex: "#c81d54" },
    ]);
    expect(out.sunflowerParams?.floretRings).toBe(60);
    expect(out.sunflowerParams?.rayPetals).toBe(34);
    // wrong-family fields stay undefined
    expect(out.rhodoneaParams).toBeUndefined();
    expect(out.classicParams).toBeUndefined();
  });
});

function nonDegenerate(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const index = geometry.getIndex();
  expect(pos.count).toBeGreaterThan(0);
  expect(color).toBeTruthy();
  expect(color.count).toBe(pos.count);
  expect(index).toBeTruthy();
  expect(index!.count).toBeGreaterThan(0);
  // finite vertices
  for (let i = 0; i < pos.count; i += 1) {
    expect(Number.isFinite(pos.getX(i))).toBe(true);
    expect(Number.isFinite(pos.getY(i))).toBe(true);
    expect(Number.isFinite(pos.getZ(i))).toBe(true);
  }
  // at least one triangle with positive area
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let maxArea = 0;
  for (let i = 0; i < index!.count; i += 3) {
    a.fromBufferAttribute(pos, index!.getX(i));
    b.fromBufferAttribute(pos, index!.getX(i + 1));
    c.fromBufferAttribute(pos, index!.getX(i + 2));
    ab.subVectors(b, a); ac.subVectors(c, a);
    maxArea = Math.max(maxArea, ab.cross(ac).length() * 0.5);
  }
  expect(maxArea).toBeGreaterThan(0);
}

describe("createClassicFlowerGeometryV2", () => {
  it("adds a per-vertex color attribute and keeps v1 position count", () => {
    const geometry = createClassicFlowerGeometryV2(DEFAULT_CLASSIC_PARAMS, PALETTE);
    nonDegenerate(geometry);
  });
});

describe("buildV2Geometry dispatch", () => {
  const base = { palette: PALETTE };
  const cases: Array<{ family: string; params: Record<string, unknown> }> = [
    { family: "classic", params: { classicParams: { ...DEFAULT_CLASSIC_PARAMS, palette: PALETTE } } },
    {
      family: "rose",
      params: { roseParams: { opening: 2.6, vDensity: 9.2, pAlign: 3.15, curve1: 1.7, curve2: 1.12, palette: PALETTE } },
    },
    {
      family: "zinnia",
      params: {
        bloomParams: {
          scale: 300, opening: 1, density: 1, petalFreq: 1, petalAmp: 1, hangDown: 1,
          fade: 1, thetaStep: 1, rStep: 1, satShift: 0, briShift: 0, palette: PALETTE,
        },
      },
    },
    {
      family: "sunflower",
      params: {
        sunflowerParams: {
          scale: 300, floretRings: 60, floretSpokes: 160, domeHeight: 40, discRatio: 0.6,
          rayPetals: 34, rayLength: 0.5, rayWidth: 0.8, seedPacking: 1, satShift: 0, briShift: 0,
        },
      },
    },
    {
      family: "rhodonea",
      params: {
        rhodoneaParams: {
          radius: 260, k: 5, petalSpan: 0.85, widthProfile: 0.42, heightProfile: 60,
          thickness: 8, curl: 0.3, lengthSeg: 24, widthSeg: 16, satShift: 0, briShift: 0,
        },
      },
    },
    {
      family: "superformula",
      params: {
        superformulaParams: {
          scale: 280, m1: 8, n1a: 0.6, n2a: 1, n3a: 1, a1: 1, b1: 1,
          m2: 3, n1b: 1, n2b: 1, n3b: 1, a2: 1, b2: 1, uSeg: 200, vSeg: 120, satShift: 0, briShift: 0,
        },
      },
    },
  ];
  for (const { family, params } of cases) {
    it(`returns non-degenerate geometry for family "${family}"`, () => {
      const geometry = buildV2Geometry({ family, ...base, ...params } as never);
      nonDegenerate(geometry);
    });
  }
});
