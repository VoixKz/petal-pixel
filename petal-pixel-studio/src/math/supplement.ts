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
