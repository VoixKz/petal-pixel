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
 * Sample the gradient at t in [0,1]. Clamps t. Linear lerp via THREE.Color.
 * Returns a NEW THREE.Color.
 */
export function samplePalette(stops: PaletteStop[], t: number): THREE.Color {
  return samplePaletteInto(stops, t, new THREE.Color());
}

/**
 * Hot-loop variant: writes the sampled color into `target` and returns it,
 * avoiding a per-vertex allocation.
 */
export function samplePaletteInto(
  stops: PaletteStop[],
  t: number,
  target: THREE.Color,
): THREE.Color {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  // Find the last segment [lo, hi] where lo.pos <= clamped <= hi.pos.
  // Scanning to the last match means that when t lands exactly on a duplicate
  // stop position the zero-width segment [t, t] wins, returning the high stop.
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i].pos && clamped <= stops[i + 1].pos) {
      lo = stops[i];
      hi = stops[i + 1];
      // Do NOT break — keep scanning so a later (zero-width) segment at the
      // same boundary takes precedence.
    }
  }
  const span = hi.pos - lo.pos;
  if (span <= 0) {
    return target.set(hi.hex);
  }
  const local = (clamped - lo.pos) / span;
  target.set(lo.hex);
  return target.lerp(new THREE.Color(hi.hex), local);
}
