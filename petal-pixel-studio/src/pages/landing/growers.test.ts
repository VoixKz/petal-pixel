import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIES } from "@/math/blossom/species";
import { GROWERS, STAGES, stageAt } from "./growers";

const inPublic = (path: string) => existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "")));

describe("growers", () => {
  it("has a picture for every flower", () => {
    for (const grower of GROWERS) expect(inPublic(`/flowers/grow/${grower.id}.webp`)).toBe(true);
  });

  it("grows only flowers whose file ships with the site", () => {
    for (const grower of GROWERS) expect(inPublic(grower.species.head.url)).toBe(true);
  });

  it("offers every kind of flower there is", () => {
    expect(new Set(GROWERS.map((g) => g.id))).toEqual(new Set(SPECIES.map((s) => s.id)));
  });
});

describe("stageAt", () => {
  it("names the stage a plant has reached", () => {
    expect(stageAt(0)).toBe("Soil");
    expect(stageAt(0.3)).toBe("Stem");
    expect(stageAt(0.5)).toBe("Bud");
    expect(stageAt(1)).toBe("Bloom");
  });

  it("lists stages in growing order", () => {
    const ats = STAGES.map((stage) => stage.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
  });
});
