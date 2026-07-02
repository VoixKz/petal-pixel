import { describe, it, expect } from "vitest";
import { getBloomProfile } from "./bloomProfiles";
import { hsbToThreeColor } from "@/math/supplement";
import { samplePalette } from "@/math/palette";
import type { BloomParams } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

const baseParams: BloomParams = {
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

const R = 0.37; // arbitrary interior radial sample

describe("bloomProfiles color: v1 identity (no palette)", () => {
  it("zinnia matches the legacy hsbToThreeColor ramp for a sample r", () => {
    const c = getBloomProfile("zinnia").color(R, baseParams);
    const legacy = hsbToThreeColor(335, -R * 40 + 100 + 0, R * 50 + 50 + 0);
    expect(c.r).toBeCloseTo(legacy.r, 12);
    expect(c.g).toBeCloseTo(legacy.g, 12);
    expect(c.b).toBeCloseTo(legacy.b, 12);
  });

  it("dahlia (default) matches the legacy ramp for a sample r", () => {
    const c = getBloomProfile("dahlia").color(R, baseParams);
    const legacy = hsbToThreeColor(20 - R * 20, 80 - R * 40 + 0, 60 + R * 40 + 0);
    expect(c.r).toBeCloseTo(legacy.r, 12);
    expect(c.g).toBeCloseTo(legacy.g, 12);
    expect(c.b).toBeCloseTo(legacy.b, 12);
  });
});

describe("bloomProfiles color: v2 palette branch", () => {
  const palette: Palette = {
    id: "test_grad",
    stops: [
      { pos: 0, hex: "#000000" },
      { pos: 1, hex: "#ffffff" },
    ],
  };

  it("zinnia samples the palette at r when palette is present", () => {
    const params: BloomParams = { ...baseParams, palette };
    const c = getBloomProfile("zinnia").color(R, params);
    const expected = samplePalette(palette.stops, R);
    expect(c.r).toBeCloseTo(expected.r, 12);
    expect(c.g).toBeCloseTo(expected.g, 12);
    expect(c.b).toBeCloseTo(expected.b, 12);
  });

  it("all four families route through the palette when present", () => {
    const params: BloomParams = { ...baseParams, palette };
    const expected = samplePalette(palette.stops, R);
    for (const type of ["zinnia", "camellia", "lotus", "dahlia"] as const) {
      const c = getBloomProfile(type).color(R, params);
      expect(c.r).toBeCloseTo(expected.r, 12);
      expect(c.g).toBeCloseTo(expected.g, 12);
      expect(c.b).toBeCloseTo(expected.b, 12);
    }
  });
});
