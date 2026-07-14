import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  samplePalette,
  samplePaletteInto,
  prepareStops,
  sampleStopsInto,
  liftValueFloor,
  EDGE_VALUE_FLOOR,
  type PaletteStop,
} from "@/math/palette";

const STOPS: PaletteStop[] = [
  { pos: 0, hex: "#ff0000" },
  { pos: 0.5, hex: "#00ff00" },
  { pos: 1, hex: "#0000ff" },
];

describe("samplePalette", () => {
  it("returns the first stop color at t=0", () => {
    const c = samplePalette(STOPS, 0);
    expect(c.getHexString()).toBe("ff0000");
  });

  it("returns the last stop color at t=1", () => {
    const c = samplePalette(STOPS, 1);
    expect(c.getHexString()).toBe("0000ff");
  });

  it("returns an exact interior stop color when t lands on it", () => {
    const c = samplePalette(STOPS, 0.5);
    expect(c.getHexString()).toBe("00ff00");
  });

  it("linearly interpolates within a segment (midpoint of stop 0 and 1)", () => {
    // t=0.25 is the midpoint of segment [0, 0.5]; local = 0.5.
    // #ff0000 -> #00ff00 lerp at 0.5 in THREE linear space => r=0.5,g=0.5,b=0.
    const c = samplePalette(STOPS, 0.25);
    expect(c.r).toBeCloseTo(0.5, 5);
    expect(c.g).toBeCloseTo(0.5, 5);
    expect(c.b).toBeCloseTo(0, 5);
  });

  it("clamps t below 0 to the first stop", () => {
    const c = samplePalette(STOPS, -3);
    expect(c.getHexString()).toBe("ff0000");
  });

  it("clamps t above 1 to the last stop", () => {
    const c = samplePalette(STOPS, 2.5);
    expect(c.getHexString()).toBe("0000ff");
  });

  it("returns a NEW color instance each call (no shared mutation)", () => {
    const a = samplePalette(STOPS, 0.2);
    const b = samplePalette(STOPS, 0.8);
    expect(a).not.toBe(b);
    expect(a.getHexString()).not.toBe(b.getHexString());
  });

  it("handles a two-stop palette across the full range", () => {
    const two: PaletteStop[] = [
      { pos: 0, hex: "#000000" },
      { pos: 1, hex: "#ffffff" },
    ];
    expect(samplePalette(two, 0).getHexString()).toBe("000000");
    expect(samplePalette(two, 1).getHexString()).toBe("ffffff");
    const mid = samplePalette(two, 0.5);
    expect(mid.r).toBeCloseTo(0.5, 5);
  });

  it("returns the high-stop color for a zero-width segment (duplicate pos)", () => {
    const dup: PaletteStop[] = [
      { pos: 0, hex: "#ff0000" },
      { pos: 0.5, hex: "#111111" },
      { pos: 0.5, hex: "#00ff00" },
      { pos: 1, hex: "#0000ff" },
    ];
    // At exactly the duplicate boundary the segment [0.5,0.5] has zero width;
    // implementation returns the high stop's color.
    expect(samplePalette(dup, 0.5).getHexString()).toBe("00ff00");
  });
});

describe("samplePaletteInto", () => {
  it("writes into the provided target and returns it (no allocation)", () => {
    const target = new THREE.Color();
    const ret = samplePaletteInto(STOPS, 1, target);
    expect(ret).toBe(target);
    expect(target.getHexString()).toBe("0000ff");
  });

  it("produces the same result as samplePalette for an interior t", () => {
    const target = new THREE.Color();
    samplePaletteInto(STOPS, 0.25, target);
    const expected = samplePalette(STOPS, 0.25);
    expect(target.r).toBeCloseTo(expected.r, 6);
    expect(target.g).toBeCloseTo(expected.g, 6);
    expect(target.b).toBeCloseTo(expected.b, 6);
  });
});

describe("prepared-stop sampling is identical to samplePaletteInto", () => {
  it("sampleStopsInto(prepareStops(STOPS), t) === samplePaletteInto(STOPS, t)", () => {
    const prepared = prepareStops(STOPS);
    for (let t = 0; t <= 1.0000001; t += 0.03) {
      const viaPrepared = sampleStopsInto(prepared, t, new THREE.Color());
      const viaDirect = samplePaletteInto(STOPS, t, new THREE.Color());
      expect(viaPrepared.r).toBeCloseTo(viaDirect.r, 6);
      expect(viaPrepared.g).toBeCloseTo(viaDirect.g, 6);
      expect(viaPrepared.b).toBeCloseTo(viaDirect.b, 6);
    }
  });

  it("matches for the fixed sample grid [0,0.07,0.13,...,1]", () => {
    const prepared = prepareStops(STOPS);
    const ts = [0, 0.07, 0.13, 0.25, 0.4, 0.5, 0.66, 0.73, 0.87, 0.93, 1];
    for (const t of ts) {
      const a = sampleStopsInto(prepared, t, new THREE.Color());
      const b = samplePaletteInto(STOPS, t, new THREE.Color());
      expect(a.r).toBeCloseTo(b.r, 6);
      expect(a.g).toBeCloseTo(b.g, 6);
      expect(a.b).toBeCloseTo(b.b, 6);
    }
  });

  it("degenerate guards match (empty -> neutral, single -> that stop)", () => {
    expect(sampleStopsInto(prepareStops([]), 0.5, new THREE.Color()).getHexString()).toBe(
      samplePaletteInto([], 0.5, new THREE.Color()).getHexString(),
    );
    const one: PaletteStop[] = [{ pos: 0, hex: "#123456" }];
    expect(sampleStopsInto(prepareStops(one), 0.7, new THREE.Color()).getHexString()).toBe(
      samplePaletteInto(one, 0.7, new THREE.Color()).getHexString(),
    );
  });
});

describe("liftValueFloor", () => {
  it("lifts a sub-floor color uniformly, preserving hue/sat", () => {
    const c = liftValueFloor(new THREE.Color(0.1, 0, 0), EDGE_VALUE_FLOOR);
    expect(c.r).toBeCloseTo(0.55, 6);
    expect(c.g).toBeCloseTo(0, 6);
    expect(c.b).toBeCloseTo(0, 6);
  });

  it("is a no-op when the value is already at/above the floor", () => {
    const c = liftValueFloor(new THREE.Color(0.9, 0.2, 0.2), EDGE_VALUE_FLOOR);
    expect(c.r).toBeCloseTo(0.9, 6);
    expect(c.g).toBeCloseTo(0.2, 6);
    expect(c.b).toBeCloseTo(0.2, 6);
  });

  it("scales a mixed sub-floor color so max channel hits the floor", () => {
    const c = liftValueFloor(new THREE.Color(0.2, 0.1, 0.05), 0.55);
    expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(0.55, 6);
    // channel ratios preserved (hue/sat unchanged)
    expect(c.g / c.r).toBeCloseTo(0.5, 6);
    expect(c.b / c.r).toBeCloseTo(0.25, 6);
  });

  it("leaves fully-black untouched (no divide-by-zero)", () => {
    const c = liftValueFloor(new THREE.Color(0, 0, 0), 0.55);
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });
});

describe("samplePalette degenerate-palette guards", () => {
  it("returns a neutral color instead of throwing on empty stops", () => {
    expect(() => samplePalette([], 0.5)).not.toThrow();
    expect(samplePalette([], 0.5).getHexString()).toBe("808080");
  });

  it("returns the single stop's color when only one stop is present", () => {
    const one: PaletteStop[] = [{ pos: 0, hex: "#123456" }];
    expect(samplePalette(one, 0.7).getHexString()).toBe("123456");
  });
});
