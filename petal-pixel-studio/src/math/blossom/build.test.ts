import { describe, expect, it } from "vitest";
import { buildBlossom, LIFE, PART_KIND, seededRandom, speciesFor } from "./build";
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

  it("builds a different plant from another seed", () => {
    const species = SPECIES[0];
    expect(buildBlossom("Anna", species).petals).not.toEqual(buildBlossom("Ben", species).petals);
  });

  it("picks one species per seed", () => {
    expect(speciesFor("Anna").id).toEqual(speciesFor("Anna").id);
  });

  it.each(SPECIES.map((s) => [s.id, s] as const))("%s keeps its petal count in range", (_, species) => {
    for (const seed of ["a", "b", "c", "d"]) {
      const { petals } = buildBlossom(seed, species);
      expect(petals.length).toBeGreaterThanOrEqual(species.petals[0]);
      expect(petals.length).toBeLessThanOrEqual(species.petals[1]);
    }
  });

  // This is what stops petals cutting through each other at every stage of opening.
  it.each(SPECIES.map((s) => [s.id, s] as const))("%s nests every petal inside the one before", (_, species) => {
    const { petals } = buildBlossom("nesting", species);
    for (let i = 1; i < petals.length; i += 1) {
      expect(petals[i].lean).toBeLessThan(petals[i - 1].lean);
    }
  });

  it.each(SPECIES.map((s) => [s.id, s] as const))("%s opens from the outside in", (_, species) => {
    const { petals } = buildBlossom("order", species);
    for (let i = 1; i < petals.length; i += 1) {
      expect(petals[i].birth).toBeGreaterThanOrEqual(petals[i - 1].birth);
    }
    expect(petals[0].birth).toBe(LIFE.petals[0]);
    expect(petals[petals.length - 1].birth).toBe(LIFE.petals[1]);
  });

  it("keeps the sepals opening before the first petal", () => {
    const { head } = buildBlossom("sepals", SPECIES[0]);
    const sepals = head.filter((part) => part.kind === PART_KIND.sepal);
    expect(sepals.length).toBeGreaterThan(0);
    expect(LIFE.sepals).toBeLessThan(LIFE.petals[0]);
  });

  it("gives stamens only to flowers that show them", () => {
    for (const species of SPECIES) {
      const stamens = buildBlossom("stamens", species).head.filter((part) => part.kind === PART_KIND.stamen);
      expect(stamens).toHaveLength(species.stamens?.count ?? 0);
    }
  });
});
