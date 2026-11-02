import { describe, expect, it } from "vitest";
import { OPENING_GLSL } from "./opening";

const clamp = (x: number, low: number, high: number) => Math.min(Math.max(x, low), high);

interface Opening {
  reachAt(reach: number, lean: number, t: number, top: number, kept: number): number;
  leanAt(reach: number, lean: number, t: number, top: number, closed: number): number;
}

/** Turns the shader's own words into JavaScript, so this tests what the page really runs. */
function compile(): Opening {
  const source = OPENING_GLSL.replace(/^uniform[^\n]*$/gm, "")
    .replace(/\bfloat\s+([A-Za-z_]\w*)\s*\(/g, "function $1(")
    .replace(/\(float\s+/g, "(")
    .replace(/,\s*float\s+/g, ", ")
    .replace(/\bvec3\s+([A-Za-z_]\w*)\s*\([\s\S]*?\n}\n/g, "")
    .replace(/\b(?:const\s+)?float\s+/g, "let ");
  return new Function("clamp, min, max", `${source}\nreturn { reachAt: openReach, leanAt: openLean };`)(clamp, Math.min, Math.max);
}

/** The smallest stretch of space anywhere at moment t. Below zero, space folded and two points met. */
function smallestStretch({ reachAt, leanAt }: Opening, t: number, top: number, closed: number, kept: number): number {
  const REACH = 200;
  const LEAN = 400;
  const dr = 1.2 / REACH;
  const dl = (Math.PI - 0.02) / LEAN;
  let smallest = Infinity;
  for (let i = 1; i < REACH; i += 1) {
    for (let j = 1; j < LEAN; j += 1) {
      const r = 0.02 + i * dr;
      const l = 0.01 + j * dl;
      const rr = (reachAt(r + dr, l, t, top, kept) - reachAt(r - dr, l, t, top, kept)) / (2 * dr);
      const rl = (reachAt(r, l + dl, t, top, kept) - reachAt(r, l - dl, t, top, kept)) / (2 * dl);
      const lr = (leanAt(r + dr, l, t, top, closed) - leanAt(r - dr, l, t, top, closed)) / (2 * dr);
      const ll = (leanAt(r, l + dl, t, top, closed) - leanAt(r, l - dl, t, top, closed)) / (2 * dl);
      smallest = Math.min(smallest, rr * ll - rl * lr);
    }
  }
  return smallest;
}

describe("a real flower opening", () => {
  const opening = compile();

  it.each([
    [1.3, 0.46, 0.93],
    [0.9, 0.4, 0.93],
    [1.9, 0.5, 0.93],
    [1.4, 0.46, 0.5],
    [1.4, 0.3, 0.52],
  ])("never folds space, so no petal can pass through another (lean %f, closed %f, kept %f)", (top, closed, kept) => {
    for (let t = 0; t <= 1.0001; t += 0.05) expect(smallestStretch(opening, t, top, closed, kept)).toBeGreaterThan(0);
  });

  it("leaves the open flower exactly as it was scanned", () => {
    for (const [reach, lean] of [[0.4, 0.3], [1, 1.2], [0.8, 1.9], [0.3, 3]]) {
      expect(opening.reachAt(reach, lean, 1, 1.3, 0.5)).toBeCloseTo(reach, 5);
      expect(opening.leanAt(reach, lean, 1, 1.3, 0.46)).toBeCloseTo(lean, 5);
    }
  });

  it("closes a petal toward the axis in the bud", () => {
    expect(opening.leanAt(1, 1.2, 0, 1.3, 0.46)).toBeLessThan(0.45);
  });

  it("keeps long stamens drawn in until the petals have opened", () => {
    const lean = 0.2;
    expect(opening.reachAt(1, lean, 0, 1.4, 0.5)).toBeCloseTo(0.5, 5);
    expect(opening.reachAt(1, lean, 0.45, 1.4, 0.5)).toBeLessThan(0.6);
    expect(opening.reachAt(1, 1.3, 0.45, 1.4, 0.5)).toBeGreaterThan(0.9);
  });

  it("opens the outer petals before the inner ones", () => {
    const share = (lean: number) => opening.leanAt(0.9, lean, 0.4, 1.3, 0.46) / lean;
    expect(share(1.2)).toBeGreaterThan(share(0.3));
  });
});
