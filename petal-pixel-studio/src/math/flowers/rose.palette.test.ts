import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createRoseFlowerGeometry } from "./rose";
import { hsbToThreeColor } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { RoseParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const ROSE_ROWS = 30; // must match rose.ts constant

const baseParams: RoseParams = {
  opening: 2.6,
  vDensity: 9,
  pAlign: 3,
  curve1: 1.7,
  curve2: 1.1,
};

// rose.ts writes the SAME color across a full row; verticesPerRow = cols + 1 = 601.
const VERTS_PER_ROW = 601;

function rowColorFromGeometry(geo: THREE.BufferGeometry, row: number) {
  const color = geo.getAttribute("color");
  const i = row * VERTS_PER_ROW; // first vertex of that row
  return { r: color.getX(i), g: color.getY(i), b: color.getZ(i) };
}

describe("rose color: v1 identity (no palette)", () => {
  it("row color matches the legacy hsbToThreeColor(340,100,-20+rowT*120) ramp", () => {
    const geo = createRoseFlowerGeometry(baseParams);
    const row = 12;
    const rowT = row * (1 / ROSE_ROWS);
    const legacy = hsbToThreeColor(340, 100, -20 + rowT * 120);
    const got = rowColorFromGeometry(geo, row);
    expect(got.r).toBeCloseTo(legacy.r, 6);
    expect(got.g).toBeCloseTo(legacy.g, 6);
    expect(got.b).toBeCloseTo(legacy.b, 6);
  });
});

describe("rose color: v2 palette branch", () => {
  it("row color comes from samplePalette at rowT when palette is present", () => {
    const palette: Palette = {
      id: "test_grad",
      stops: [
        { pos: 0, hex: "#102030" },
        { pos: 1, hex: "#e0d0c0" },
      ],
    };
    const geo = createRoseFlowerGeometry({ ...baseParams, palette });
    const row = 12;
    const rowT = row * (1 / ROSE_ROWS);
    const expected = samplePalette(palette.stops, rowT);
    const got = rowColorFromGeometry(geo, row);
    expect(got.r).toBeCloseTo(expected.r, 6);
    expect(got.g).toBeCloseTo(expected.g, 6);
    expect(got.b).toBeCloseTo(expected.b, 6);
  });
});
