import { describe, it, expect } from "vitest";
import { collectFamilies, filterFlowers, sortFlowers } from "./myFlowersUtils";
import type { SavedFlower, FlowerParams } from "@/stores/flowerStore";
import {
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
} from "@/math/flowerTypes";

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
    petalCount: 8,
    petalLength: 1,
    petalSharpness: 0.5,
    noiseIntensity: 0,
    frequency: 1,
    rotation: 0,
    symmetry: 1,
    colorA: "#ff0000",
    colorB: "#0000ff",
    glowIntensity: 0.5,
    material: "matte",
    idleMotion: false,
    rotationSpeed: 0,
    stemEnabled: false,
    ...overrides,
  };
}

let counter = 0;
function makeFlower(
  overrides: Partial<SavedFlower> = {},
  paramOverrides: Partial<FlowerParams> = {},
): SavedFlower {
  counter += 1;
  return {
    id: `id-${counter}`,
    title: "Celestial Bloom",
    generationWord: "rose",
    params: makeParams(paramOverrides),
    createdAt: "2026-07-01",
    isMinted: false,
    ...overrides,
  };
}

describe("collectFamilies", () => {
  it("dedupes and sorts labels, mixing v1 flowerTypes and v2 families", () => {
    const flowers = [
      makeFlower({}, { family: "sunflower" }),
      makeFlower({}, { flowerType: "camellia", family: undefined }), // v1
      makeFlower({}, { family: "sunflower" }),
      makeFlower({}, { family: "rhodonea" }),
    ];
    expect(collectFamilies(flowers)).toEqual(["camellia", "rhodonea", "sunflower"]);
  });

  it("returns empty array for empty collection", () => {
    expect(collectFamilies([])).toEqual([]);
  });
});

describe("filterFlowers", () => {
  const base = { search: "", mint: "all" as const, family: "all" };

  it("matches title case-insensitively", () => {
    const a = makeFlower({ title: "Celestial Rose" });
    const b = makeFlower({ title: "Phantom Dahlia" });
    expect(filterFlowers([a, b], { ...base, search: "celest" })).toEqual([a]);
    expect(filterFlowers([a, b], { ...base, search: "PHANTOM" })).toEqual([b]);
  });

  it("matches generationWord too", () => {
    const a = makeFlower({ title: "Untitled", generationWord: "serenity" });
    const b = makeFlower({ title: "Untitled", generationWord: "chaos" });
    expect(filterFlowers([a, b], { ...base, search: "seren" })).toEqual([a]);
  });

  it("whitespace-only search matches everything", () => {
    const flowers = [makeFlower(), makeFlower()];
    expect(filterFlowers(flowers, { ...base, search: "   " })).toEqual(flowers);
  });

  it("returns empty for a non-matching query", () => {
    expect(filterFlowers([makeFlower()], { ...base, search: "zzz-no-match" })).toEqual([]);
  });

  it("mint filter: minted keeps only minted, drafts keeps only unminted", () => {
    const minted = makeFlower({ isMinted: true });
    const draft = makeFlower({ isMinted: false });
    expect(filterFlowers([minted, draft], { ...base, mint: "minted" })).toEqual([minted]);
    expect(filterFlowers([minted, draft], { ...base, mint: "drafts" })).toEqual([draft]);
    expect(filterFlowers([minted, draft], { ...base, mint: "all" })).toEqual([minted, draft]);
  });

  it("family filter matches v2 family and v1 flowerType fallback", () => {
    const v2 = makeFlower({}, { family: "superformula" });
    const v1 = makeFlower({}, { flowerType: "lotus", family: undefined });
    expect(filterFlowers([v2, v1], { ...base, family: "superformula" })).toEqual([v2]);
    expect(filterFlowers([v2, v1], { ...base, family: "lotus" })).toEqual([v1]);
  });

  it("combines search + mint + family", () => {
    const hit = makeFlower({ title: "Aurora Sunflower", isMinted: true }, { family: "sunflower" });
    const wrongMint = makeFlower({ title: "Aurora Sunflower", isMinted: false }, { family: "sunflower" });
    const wrongFamily = makeFlower({ title: "Aurora Rose", isMinted: true }, { family: "rose" });
    expect(
      filterFlowers([hit, wrongMint, wrongFamily], { search: "aurora", mint: "minted", family: "sunflower" }),
    ).toEqual([hit]);
  });
});

describe("sortFlowers", () => {
  it("newest: descending by createdAt", () => {
    const older = makeFlower({ title: "Beta", createdAt: "2026-06-01" });
    const newer = makeFlower({ title: "alpha", createdAt: "2026-07-05" });
    const middle = makeFlower({ title: "Gamma", createdAt: "2026-06-20" });
    expect(sortFlowers([older, newer, middle], "newest")).toEqual([newer, middle, older]);
  });

  it("oldest: ascending by createdAt", () => {
    const older = makeFlower({ title: "Beta", createdAt: "2026-06-01" });
    const newer = makeFlower({ title: "alpha", createdAt: "2026-07-05" });
    const middle = makeFlower({ title: "Gamma", createdAt: "2026-06-20" });
    expect(sortFlowers([newer, older, middle], "oldest")).toEqual([older, middle, newer]);
  });

  it("name: A-Z case-insensitive", () => {
    const older = makeFlower({ title: "Beta", createdAt: "2026-06-01" });
    const newer = makeFlower({ title: "alpha", createdAt: "2026-07-05" });
    const middle = makeFlower({ title: "Gamma", createdAt: "2026-06-20" });
    expect(sortFlowers([middle, older, newer], "name")).toEqual([newer, older, middle]);
  });

  it("does not mutate the input array", () => {
    const newer = makeFlower({ title: "alpha", createdAt: "2026-07-05" });
    const older = makeFlower({ title: "Beta", createdAt: "2026-06-01" });
    const input = [newer, older];
    sortFlowers(input, "oldest");
    expect(input).toEqual([newer, older]);
  });
});
