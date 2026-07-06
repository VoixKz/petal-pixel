// Design token registry — single source of truth for the shared class/token names.
// Pure and testable; imported by downstream UI tasks so names stay stable.
// The corresponding CSS lives in `@layer components` of src/index.css and the
// Tailwind `fontSize` keys (text-meta/body/title/page) in tailwind.config.ts.

// Typography helper classes (map to @layer components rules in index.css).
export const typeScale = {
  pageTitle: "type-page-title", // text-xl sm:text-2xl, font-semibold, tracking-tight
  sectionTitle: "type-section-title", // text-base sm:text-lg, font-medium
  body: "type-body", // text-sm leading-relaxed
  meta: "type-meta", // text-xs text-muted-foreground
} as const;

// JetBrains-Mono metadata (seed / token id / hex / wallet / contract address).
export const monoMeta = "mono-meta"; // font-mono text-xs tracking-tight tabular-nums

// Chip/badge base + tone variants (>=12px text, adequate padding, capitalize-safe).
export const chip = {
  base: "chip",
  primary: "chip-primary",
  accent: "chip-accent",
  muted: "chip-muted",
} as const;

// Focus ring class for elements that don't inherit the global focus-visible rule
// (e.g. custom non-<button> interactive divs). Global rule covers native controls.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export type TypeScaleKey = keyof typeof typeScale;
export type ChipTone = keyof typeof chip;
