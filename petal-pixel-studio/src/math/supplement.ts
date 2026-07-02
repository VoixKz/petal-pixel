import * as THREE from "three";

export function vShape(A: number, r: number, a: number, b: number, c: number) {
  return A * Math.exp(-b * Math.pow(Math.abs(r), c)) * Math.pow(Math.abs(r), a);
}

export function bumpiness(A: number, r: number, f: number, angle: number) {
  return 1 + A * (r * r) * Math.sin(f * angle);
}

export function hsbToThreeColor(h: number, s: number, b: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = THREE.MathUtils.clamp(s / 100, 0, 1);
  const brightness = THREE.MathUtils.clamp(b / 100, 0, 1);
  const color = new THREE.Color();
  color.setHSL(hue / 360, saturation, brightness);
  return color;
}

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function sinDeg(deg: number) {
  return Math.sin(degToRad(deg));
}

export function cosDeg(deg: number) {
  return Math.cos(degToRad(deg));
}

export function asinDeg(value: number) {
  return THREE.MathUtils.radToDeg(Math.asin(value));
}

/**
 * Gielis superformula — returns the polar radius r(θ) for a given angle.
 * r = (|cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3)^(-1/n1)
 *
 * Guards:
 *  - n1 clamped to ≥ 1e-3 (avoids divide-by-zero in the exponent)
 *  - a, b clamped to ≥ 1e-3 (avoids divide-by-zero inside the terms)
 *  - inner ≤ 1e-9 or non-finite → return 0 (collapsed point, not Infinity)
 *  - final result non-finite → return 0
 */
export function superShape(
  angle: number,
  m: number,
  n1: number,
  n2: number,
  n3: number,
  a: number,
  b: number,
): number {
  const n1c = Math.max(1e-3, n1);
  const ac = Math.max(1e-3, Math.abs(a));
  const bc = Math.max(1e-3, Math.abs(b));
  const t = (m * angle) / 4;
  const t1 = Math.abs(Math.cos(t) / ac);
  const t2 = Math.abs(Math.sin(t) / bc);
  const inner = Math.pow(t1, n2) + Math.pow(t2, n3);
  if (inner <= 1e-9 || !Number.isFinite(inner)) return 0;
  const r = Math.pow(inner, -1 / n1c);
  if (!Number.isFinite(r)) return 0;
  return r;
}
