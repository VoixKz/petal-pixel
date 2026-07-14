import * as THREE from "three";

export interface PaletteStop {
  /** 0..1 (proto ColorStop.position); backend guarantees ascending, first=0 last=1. */
  pos: number;
  /** "#rrggbb" (proto ColorStop.hex); already HSB-shift-baked by the backend. */
  hex: string;
}

export interface Palette {
  /** proto PaletteSpec.id */
  id: string;
  /** proto PaletteSpec.stops (>= 2) */
  stops: PaletteStop[];
}

/**
 * A palette stop with its hex pre-parsed into working-space (linear) RGB.
 * Produced once by `prepareStops` so the hot per-vertex path can numeric-lerp
 * without re-parsing a hex string / allocating a THREE.Color per sample.
 */
export interface RgbStop {
  pos: number;
  r: number;
  g: number;
  b: number;
}

/** Shared edge-brightness floor (HSB "value") for petal silhouettes. */
export const EDGE_VALUE_FLOOR = 0.55;

/**
 * Parse each stop's hex ONCE via THREE.Color (identical sRGB→working-space
 * conversion) and read its channels, so a later numeric lerp in `sampleStopsInto`
 * reproduces `target.set(hex).lerp(...)` exactly. Call this once outside a
 * per-vertex loop; pass the result to `sampleStopsInto`.
 */
export function prepareStops(stops: PaletteStop[]): RgbStop[] {
  const c = new THREE.Color();
  return (stops ?? []).map((s) => {
    c.set(s.hex);
    return { pos: s.pos, r: c.r, g: c.g, b: c.b };
  });
}

/**
 * Hot-loop sampler over pre-parsed stops: writes the sampled color into `target`
 * via a pure numeric lerp (no hex parse, no allocation) and returns it. Behaves
 * identically to `samplePaletteInto` for the same stops (verified in palette.test).
 */
export function sampleStopsInto(
  stops: RgbStop[],
  t: number,
  target: THREE.Color,
): THREE.Color {
  // Degenerate-palette guards mirror samplePaletteInto: never throw on an
  // empty/short list — degrade to neutral or the single color.
  if (!stops || stops.length === 0) {
    return target.set("#808080");
  }
  if (stops.length === 1) {
    return target.setRGB(stops[0].r, stops[0].g, stops[0].b);
  }
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  // Find the last segment [lo, hi] where lo.pos <= clamped <= hi.pos; scanning
  // to the last match lets a zero-width segment at a duplicate boundary win
  // (returns the high stop), matching samplePaletteInto.
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i].pos && clamped <= stops[i + 1].pos) {
      lo = stops[i];
      hi = stops[i + 1];
    }
  }
  const span = hi.pos - lo.pos;
  if (span <= 0) {
    return target.setRGB(hi.r, hi.g, hi.b);
  }
  const k = (clamped - lo.pos) / span;
  return target.setRGB(
    lo.r + (hi.r - lo.r) * k,
    lo.g + (hi.g - lo.g) * k,
    lo.b + (hi.b - lo.b) * k,
  );
}

/**
 * Lift a color's HSB "value" (= max channel) up to `floor` if it is below it,
 * scaling all channels uniformly so hue + saturation are preserved. No-op when
 * already at/above the floor (or fully black). Used to keep petal tips/edges
 * bright enough to separate from the near-black scene background.
 */
export function liftValueFloor(target: THREE.Color, floor: number): THREE.Color {
  const v = Math.max(target.r, target.g, target.b);
  if (v > 1e-6 && v < floor) {
    const k = floor / v;
    target.setRGB(target.r * k, target.g * k, target.b * k);
  }
  return target;
}

/**
 * Sample the gradient at t in [0,1]. Clamps t. Linear lerp via THREE.Color.
 * Returns a NEW THREE.Color.
 */
export function samplePalette(stops: PaletteStop[], t: number): THREE.Color {
  return samplePaletteInto(stops, t, new THREE.Color());
}

/**
 * Hot-loop variant: writes the sampled color into `target` and returns it,
 * avoiding a per-vertex allocation. Delegates to the shared segment logic in
 * `sampleStopsInto` (parses the stops each call — callers in a tight per-vertex
 * loop should `prepareStops` once and call `sampleStopsInto` directly instead).
 *
 * Degenerate-palette guards: never throw on an empty/short stop list (a
 * malformed or unpopulated palette from a persisted/legacy record). Callers
 * that unconditionally sample (classic/rose/bloom v2 arms) degrade to a
 * neutral or single color instead of crashing the render.
 */
export function samplePaletteInto(
  stops: PaletteStop[],
  t: number,
  target: THREE.Color,
): THREE.Color {
  return sampleStopsInto(prepareStops(stops), t, target);
}
