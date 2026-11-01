import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { speciesFor } from "@/math/blossom/build";
import { seedOf } from "@/math/blossom/name";
import { LAMPS, lampOf, stillOf, SPECIMENS } from "./specimens";

const inPublic = (path: string) => existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "")));

describe("the names on the page", () => {
  it.each(SPECIMENS.map((s) => [s.name, s.species]))("%s really grows a %s", (name, species) => {
    expect(speciesFor(seedOf(name)).id).toBe(species);
  });

  it("shows a different kind of flower for each name", () => {
    expect(new Set(SPECIMENS.map((s) => s.species)).size).toBe(SPECIMENS.length);
  });

  it("has a day and a night picture for each of them", () => {
    for (const { name } of SPECIMENS) {
      expect(inPublic(stillOf(name, false))).toBe(true);
      expect(inPublic(stillOf(name, true))).toBe(true);
    }
  });

  it("has a picture of every lamp", () => {
    for (const name of LAMPS) expect(inPublic(lampOf(name))).toBe(true);
  });
});
