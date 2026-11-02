import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { speciesFor } from "@/math/blossom/build";
import { seedOf } from "@/math/blossom/name";
import { LAMPS, lampOf, picture, stillOf, SPECIMENS } from "./specimens";

const inPublic = (path: string) => existsSync(resolve(process.cwd(), "public", path.replace(/^\//, "").split("?")[0]));

describe("the names on the page", () => {
  it.each(SPECIMENS.map((s) => [s.name, s.species]))("%s really grows a %s", (name, species) => {
    expect(speciesFor(seedOf(name)).label.toLowerCase()).toBe(species);
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

  it("asks for its pictures at an address a browser has not kept", () => {
    expect(picture("/flowers/first.webp")).toMatch(/^\/flowers\/first\.webp\?v=\d+$/);
    expect(stillOf("Anna", false)).toMatch(/\?v=\d+$/);
    expect(stillOf("Anna", true)).toMatch(/\?v=\d+$/);
    expect(lampOf("Zara")).toMatch(/\?v=\d+$/);
  });

  it.each(["/flowers/(.*)", "/models/(.*)"])("lets a browser keep %s for an hour at most", (source) => {
    const { headers } = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    const rule = headers.find((h: { source: string }) => h.source === source);
    const [value] = rule.headers.filter((h: { key: string }) => h.key === "Cache-Control").map((h: { value: string }) => h.value);
    expect(Number(/max-age=(\d+)/.exec(value)?.[1])).toBeLessThanOrEqual(3600);
  });
});
