import { describe, it, expect } from "vitest";
import { mapPetalCount, mapPetalDepth } from "./sliderMapping";

describe("top-level slider mapping (Phase 1)", () => {
  it("maps petal-count slider to classicParams.pNum for classic", () => {
    expect(mapPetalCount("classic")).toEqual({
      param: "classic", key: "pNum", min: 1, max: 20, step: 1,
    });
  });

  it("maps petal-count slider to bloomParams.petalFreq for bloom types", () => {
    for (const t of ["zinnia", "camellia", "lotus", "dahlia"] as const) {
      expect(mapPetalCount(t)).toEqual({
        param: "bloom", key: "petalFreq", min: 0.4, max: 2.2, step: 0.05,
      });
    }
  });

  it("returns null for rose (no meaningful count param → slider hidden, not a no-op)", () => {
    expect(mapPetalCount("rose")).toBeNull();
    expect(mapPetalDepth("rose")).toBeNull();
  });

  it("maps petal-depth slider to pSharp (classic) and petalAmp (bloom)", () => {
    expect(mapPetalDepth("classic")).toEqual({
      param: "classic", key: "pSharp", min: 0, max: 1.4, step: 0.01,
    });
    expect(mapPetalDepth("dahlia")).toEqual({
      param: "bloom", key: "petalAmp", min: 0.4, max: 2.2, step: 0.05,
    });
  });
});
