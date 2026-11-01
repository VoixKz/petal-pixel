import type { PaletteStop } from "@/math/palette";

/**
 * SHARED palette-UI helper (owned by studio-pack per the Studio+ plan's
 * binding resolutions #3/#5). Tasks 5-8 (My Flowers, Dashboard, NFT
 * Collection, Activity) import these instead of reimplementing them —
 * do not fork this logic, and never drop stop positions.
 */

/**
 * Convert palette stops into a CSS background value for badge/preview swatch
 * strips. Degenerate guards mirror samplePaletteInto (src/math/palette.ts):
 * an empty list yields flat neutral gray, a single stop yields that flat
 * color, so a malformed persisted palette can never produce an invalid CSS
 * gradient. Stop order/positions are always honored (position-aware) —
 * never collapse to an evenly-spaced fallback.
 */
export function paletteGradient(stops: PaletteStop[]): string {
  if (!stops || stops.length === 0) return "#808080";
  if (stops.length === 1) return stops[0].hex;
  const parts = stops.map((s) => `${s.hex} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/**
 * Per-flower CARD PREVIEW BAND helper: prefers the real v2 palette gradient,
 * falls back to a two-color gradient built from v1's always-present
 * colorA/colorB fields, and only degrades to flat gray when neither is
 * available. This is what keeps v1 flowers (no palette) from showing a flat
 * #808080 band across the studio (My Flowers / NFT Collection / recent
 * flowers thumb) — do not use this for the v2-only palette-id swatch chip
 * (FlowerBadges.tsx), which should keep calling paletteGradient directly.
 */
export function previewGradient(p: {
  palette?: { stops: PaletteStop[] };
  colorA?: string;
  colorB?: string;
}): string {
  if (p.palette && p.palette.stops.length > 0) return paletteGradient(p.palette.stops);
  if (p.colorA) return `linear-gradient(90deg, ${p.colorA}, ${p.colorB ?? p.colorA})`;
  return "#808080";
}

/**
 * Family label: v2 records carry `family`; v1 records (pre-family rollout)
 * carry only `flowerType`. Falls back to "classic" when neither is present.
 *
 * Returns the RAW lowercase value (the canonical family/flowerType key) so it
 * can be used directly in string-equality filters and grouping (My Flowers).
 * Apply display casing at the render site with the CSS `capitalize` class.
 */
export function familyLabel(p: { family?: string; flowerType?: string }): string {
  return p.family ?? p.flowerType ?? "classic";
}
