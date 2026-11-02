import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIES } from "@/math/blossom/species";
import { STAGES, stageAt } from "./growers";

const inPublic = (path: string) => existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "")));

describe("the flowers", () => {
  it("has a picture of every kind, for a browser that cannot draw it", () => {
    for (const species of SPECIES) expect(inPublic(`/flowers/grow/${species.id}.webp`)).toBe(true);
  });

  it("ships every flower it can grow", () => {
    for (const species of SPECIES) expect(inPublic(species.head.url)).toBe(true);
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
