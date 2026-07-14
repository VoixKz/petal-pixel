import { describe, expect, it, vi } from "vitest";

// Keep this pure-helper test isolated from the R3F runtime under jsdom.
vi.mock("@react-three/fiber", () => ({ useFrame: () => {}, useThree: () => 0 }));

import { paletteHighlightHex, seedToUnit } from "./Flower3D";

describe("paletteHighlightHex", () => {
  it("returns the brightest palette stop by luminance", () => {
    expect(
      paletteHighlightHex(
        { id: "x", stops: [{ pos: 0, hex: "#2b0a3d" }, { pos: 1, hex: "#ffd76a" }] },
        "#000",
      ),
    ).toBe("#ffd76a");
  });

  it("falls back to the provided hex when there is no palette", () => {
    expect(paletteHighlightHex(undefined, "#123456")).toBe("#123456");
  });
});

describe("seedToUnit", () => {
  it("is deterministic for the same seed", () => {
    expect(seedToUnit("42")).toBe(seedToUnit("42"));
  });

  it("returns a value in [0, 1)", () => {
    const u = seedToUnit("42");
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  });

  it("differs for different seeds", () => {
    expect(seedToUnit("42")).not.toBe(seedToUnit("43"));
  });
});
