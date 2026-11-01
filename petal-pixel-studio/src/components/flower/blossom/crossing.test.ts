import { describe, expect, it } from "vitest";
import { buildBlossom, type Blossom } from "@/math/blossom/build";
import { SPECIES } from "@/math/blossom/species";
import { crossings } from "./crossing";

const moments = Array.from({ length: 21 }, (_, i) => 0.4 + i * 0.03);
const everyPart = (blossom: Blossom) => [...blossom.petals, ...blossom.head];

describe("a flower opening", () => {
  it.each(SPECIES.map((species) => [species.id, species] as const))("never passes a %s through itself", (_, species) => {
    for (const seed of ["Anna", "Ben", "sample"]) {
      const blossom = buildBlossom(seed, species);
      for (const life of moments) {
        const found = crossings(blossom, everyPart(blossom), life);
        expect({ seed, life, pairs: found.pairs }).toEqual({ seed, life, pairs: 0 });
      }
    }
  }, 60000);

  it("would notice a petal left free to pass through its neighbours", () => {
    const blossom = buildBlossom("Anna", SPECIES[0]);
    const unlimited = { ...blossom, petals: blossom.petals.map((petal) => ({
      ...petal,
      cup: 0.9,
      room: { inBase: 0.6, inTip: 0.6, outBase: 0.6, outTip: 0.6 },
    })) };
    expect(crossings(unlimited, unlimited.petals, 1).pairs).toBeGreaterThan(0);
  });

  it("would notice an inner petal that opens before the outer ones", () => {
    const blossom = buildBlossom("Anna", SPECIES[0]);
    const reversed = { ...blossom, petals: blossom.petals.map((petal) => ({ ...petal, birth: 1.26 - petal.birth })) };
    const worst = Math.max(...moments.map((life) => crossings(reversed, reversed.petals, life).pairs));
    expect(worst).toBeGreaterThan(0);
  });
});
