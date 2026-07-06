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

function titleCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

/**
 * Family display label: v2 records carry `family`; v1 records (pre-family
 * rollout) carry only `flowerType`. Falls back to "Classic" when neither is
 * present. Title-Cased for display (e.g. "sunflower" -> "Sunflower").
 */
export function familyLabel(p: { family?: string; flowerType?: string }): string {
  return titleCase(p.family ?? p.flowerType ?? "classic");
}
