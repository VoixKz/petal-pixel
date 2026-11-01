import { describe, it, expect } from "vitest";
import {
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
} from "@/math/flowerTypes";
import type { FlowerParams, SavedFlower } from "@/stores/flowerStore";
import { familyDistribution, recentFlowers } from "./dashboardStats";

function makeParams(overrides: Partial<FlowerParams> = {}): FlowerParams {
  return {
    flowerId: "f-1",
    algoVersion: "v1",
    schemaVersion: "v1",
    seed: "0",
    flowerType: "classic",
    classicParams: { ...DEFAULT_CLASSIC_PARAMS },
    roseParams: { ...DEFAULT_ROSE_PARAMS },
    bloomParams: { ...DEFAULT_BLOOM_PARAMS },
    petalCount: 6,
    petalLength: 1.2,
    petalSharpness: 0.5,
    noiseIntensity: 0.3,
    frequency: 2,
    rotation: 0,
    symmetry: 6,
    colorA: "#10b981",
    colorB: "#2563eb",
    glowIntensity: 0.5,
    material: "metallic",
    idleMotion: true,
    rotationSpeed: 0.5,
    stemEnabled: false,
    ...overrides,
  };
}

let nextId = 0;
function makeFlower(
  overrides: Partial<SavedFlower> = {},
  paramOverrides: Partial<FlowerParams> = {},
): SavedFlower {
  nextId += 1;
  return {
    id: `flower-${nextId}`,
    title: `Flower ${nextId}`,
    generationWord: "word",
    params: makeParams(paramOverrides),
    createdAt: "2026-07-01",
    isMinted: false,
    ...overrides,
  };
}

describe("familyDistribution", () => {
  it("counts a v1/v2 mix: v2 by params.family, v1 by params.flowerType, sorted count desc then key asc", () => {
    const flowers = [
      makeFlower({}, { algoVersion: "v2", family: "sunflower" }),
      makeFlower({}, { algoVersion: "v2", family: "sunflower" }),
      makeFlower({}, { algoVersion: "v2", family: "rhodonea" }),
      makeFlower({}, { flowerType: "rose" }), // v1 — no family
      makeFlower({}, { flowerType: "classic" }), // v1 — no family (would collide with default "classic")
    ];
    expect(familyDistribution(flowers)).toEqual([
      { family: "sunflower", count: 2 },
      { family: "classic", count: 1 },
      { family: "rhodonea", count: 1 },
      { family: "rose", count: 1 },
    ]);
  });

  it("dedups families across v1 and v2 flowers that resolve to the same label", () => {
    const flowers = [
      makeFlower({}, { flowerType: "rose" }),
      makeFlower({}, { algoVersion: "v2", family: "rose" }),
    ];
    expect(familyDistribution(flowers)).toEqual([{ family: "rose", count: 2 }]);
  });

  it("returns [] for an empty garden", () => {
    expect(familyDistribution([])).toEqual([]);
  });
});

describe("recentFlowers", () => {
  it("returns the last 4 by createdAt, newest first", () => {
    const flowers = [
      makeFlower({ id: "a", createdAt: "2026-06-28" }),
      makeFlower({ id: "b", createdAt: "2026-07-03" }),
      makeFlower({ id: "c", createdAt: "2026-07-01" }),
      makeFlower({ id: "d", createdAt: "2026-06-30" }),
      makeFlower({ id: "e", createdAt: "2026-07-02" }),
    ];
    expect(recentFlowers(flowers, 4).map((f) => f.id)).toEqual(["b", "e", "c", "d"]);
  });

  it("defaults to 4 and does not mutate the input array", () => {
    const flowers = [
      makeFlower({ id: "a", createdAt: "2026-06-28" }),
      makeFlower({ id: "b", createdAt: "2026-07-03" }),
    ];
    expect(recentFlowers(flowers).map((f) => f.id)).toEqual(["b", "a"]);
    expect(flowers.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("returns [] for an empty garden", () => {
    expect(recentFlowers([])).toEqual([]);
  });
});
