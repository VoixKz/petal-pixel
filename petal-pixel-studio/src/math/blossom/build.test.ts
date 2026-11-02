import { describe, expect, it } from "vitest";
import { buildBlossom, seededRandom, speciesFor, tinted } from "./build";
import { SPECIES } from "./species";

describe("seededRandom", () => {
  it("gives the same numbers for the same seed", () => {
    const a = seededRandom("Dana");
    const b = seededRandom("Dana");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives different numbers for different seeds", () => {
    expect(seededRandom("Dana")()).not.toEqual(seededRandom("Dan")());
  });

  it("stays between 0 and 1", () => {
    const next = seededRandom("range");
    for (let i = 0; i < 1000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("buildBlossom", () => {
  it("builds the same plant from the same seed", () => {
    expect(buildBlossom("Anna")).toEqual(buildBlossom("Anna"));
  });

  it("reaches every kind of flower", () => {
    const seen = new Set(Array.from({ length: 400 }, (_, i) => speciesFor(`name-${i}`).id));
    expect(seen.size).toBe(SPECIES.length);
  });

  it("gives every name one of its flower's own tints", () => {
    for (const name of ["Dana", "Maya", "Oleg", "Sara"]) {
      const flower = buildBlossom(name);
      expect(flower.species.tints).toContain(flower.tint);
    }
  });

  it("shows the same kind differently for different names", () => {
    const rose = SPECIES.find((s) => s.id === "rose");
    const plants = Array.from({ length: 40 }, (_, i) => buildBlossom(`name-${i}`, rose));
    expect(new Set(plants.map((p) => p.tint)).size).toBeGreaterThan(2);
    expect(new Set(plants.map((p) => p.turn.toFixed(3))).size).toBe(40);
  });

  it("opens most of the way for every name", () => {
    for (let i = 0; i < 200; i += 1) {
      const { fullness } = buildBlossom(`name-${i}`);
      expect(fullness).toBeGreaterThanOrEqual(0.9);
      expect(fullness).toBeLessThanOrEqual(1);
    }
  });
});

describe("tinted", () => {
  const near = (a: string, b: string) => {
    for (const at of [1, 3, 5]) expect(Math.abs(parseInt(a.slice(at, at + 2), 16) - parseInt(b.slice(at, at + 2), 16))).toBeLessThanOrEqual(2);
  };

  it("leaves a colour alone when the tint is plain", () => {
    near(tinted("#fb764e", { hue: 0, saturation: 1, value: 1 }), "#fb764e");
  });

  it("turns the hue all the way round to where it started", () => {
    near(tinted("#3366cc", { hue: 1, saturation: 1, value: 1 }), "#3366cc");
  });

  it("takes the colour out with saturation 0", () => {
    const grey = tinted("#fb764e", { hue: 0, saturation: 0, value: 1 });
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7));
  });

  it("copes with a negative turn", () => {
    expect(tinted("#fb764e", { hue: -0.08, saturation: 1, value: 1 })).toMatch(/^#[0-9a-f]{6}$/);
  });
});
