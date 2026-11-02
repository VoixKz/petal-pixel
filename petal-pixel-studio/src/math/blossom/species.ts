// What makes each kind of flower itself: a real flower, the colours a name can turn it, and the
// stem and leaves it grows on. Lengths are relative to a flower of radius 1.

export type Colour = readonly [base: string, mid: string, tip: string];

/** A real flower, stood on its base with its axis up and radius 1. spike/blender/heads.py makes these. */
export interface HeadSource {
  url: string;
  /** How far from upright its petals lean when fully open, in radians. */
  top: number;
  /** How narrow the bud is, as a share of that lean. */
  closed: number;
  /** How far the petals wrap around the bud, in radians. */
  twist: number;
  /** Size of the bud against the open flower. */
  bud: number;
  /** Size of the open flower on its stem. */
  size: number;
  /** How far the bud's base rises off the stem as it closes, to be bridged by the neck. */
  neck: number;
  /** How much of their length long parts keep inside the bud. */
  kept: number;
  /** Whose flower it is. A CC BY flower must name its author wherever it is shown. */
  credit: { by: string; url: string; licence: "CC BY 4.0" | "CC0" };
}

/** What a name does to a flower's own colours. */
export interface Tint {
  /** Turn of the hue, 0 to 1. */
  hue: number;
  saturation: number;
  value: number;
}

/** One set of leaves on the stem. */
export interface Foliage {
  /** Heights of the joints that carry them, as shares of the stem. */
  nodes: readonly number[];
  perNode: number;
  /** The turn around the stem from one joint to the next. */
  turn: number;
  stalk: number;
  blade: number;
  width: number;
  axil: number;
  arch: number;
  droop: number;
  fold: number;
  waist: number;
  blunt: number;
  teeth: number;
  lobes: number;
  leaflets: 1 | 3 | 5;
}

export interface Species {
  id: string;
  label: string;
  head: HeadSource;
  /** Its own colours, heart to tip, for swatches on the page. */
  colours: Colour;
  /** The colours a name can give it. The first is the flower as it was scanned. */
  tints: readonly Tint[];
  /** How far the open flower nods toward the viewer, in radians. */
  nod: number;
  foliage: readonly Foliage[];
  /** The first pair of round leaves. Bulbs and water plants come up without them. */
  seedLeaves: boolean;
  stem: { radius: number; base: string; top: string; thorns: number };
  /** Shadowed, leaf and sunlit green. */
  green: Colour;
  /** How smooth the leaves are: 0 is matt, 1 waxed. */
  gloss: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const SPECIES: readonly Species[] = [
  {
    id: "hibiscus",
    label: "Hibiscus",
    head: {
      url: "/models/heads/hibiscus.glb",
      top: 1.038, closed: 0.46, twist: 0.9, bud: 0.8, size: 1, neck: 0.18, kept: 0.93,
      credit: { by: "ffishAsia and floraZia", url: "https://sketchfab.com/3d-models/none-ab103e63aa5e45d1831cfd7da85ca935", licence: "CC0" },
    },
    colours: ["#c4b65a", "#e8e17d", "#f3efa8"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: -0.05, saturation: 1.15, value: 1 },
      { hue: 0.82, saturation: 0.55, value: 1.05 },
    ],
    nod: 0.8,
    foliage: [{ nodes: [0.46, 0.62, 0.78], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.09, blade: 1.06, width: 0.39, axil: 1.05, arch: 0.1, droop: 0.42, fold: 0.18, waist: 0.82, blunt: 0.68, teeth: 0, lobes: 0, leaflets: 1 }],
    seedLeaves: true,
    stem: { radius: 0.05, base: "#54402e", top: "#7a6a44", thorns: 0 },
    green: ["#24492a", "#3f7238", "#7da65a"],
    gloss: 0.62,
  },
  {
    id: "peony",
    label: "Peony",
    head: {
      url: "/models/heads/peony.glb",
      top: 1.486, closed: 0.46, twist: 0.9, bud: 0.8, size: 0.84, neck: 0.16, kept: 0.93,
      credit: { by: "thesidekick", url: "https://sketchfab.com/3d-models/none-1ce8ca97769a439aa83ee1e13fd75db7", licence: "CC BY 4.0" },
    },
    colours: ["#84373b", "#c62167", "#da338e"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: 0.06, saturation: 1, value: 0.92 },
      { hue: 0.09, saturation: 0.7, value: 1.1 },
      { hue: -0.08, saturation: 0.85, value: 1 },
    ],
    nod: 0.56,
    foliage: [{ nodes: [0.3, 0.46, 0.62, 0.76], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.28, blade: 0.63, width: 0.21, axil: 0.92, arch: 0.3, droop: 0.42, fold: 0.26, waist: 0.82, blunt: 0.78, teeth: 0, lobes: 1, leaflets: 3 }],
    seedLeaves: true,
    stem: { radius: 0.044, base: "#6c3a3a", top: "#6e9140", thorns: 0 },
    green: ["#23502d", "#3c7a3a", "#7cad58"],
    gloss: 0.3,
  },
  {
    id: "camellia",
    label: "Camellia",
    head: {
      url: "/models/heads/camellia.glb",
      top: 1.462, closed: 0.46, twist: 0.9, bud: 0.8, size: 0.95, neck: 0.2, kept: 0.93,
      credit: { by: "ffishAsia and floraZia", url: "https://sketchfab.com/3d-models/none-ec873a576ea74ca5a868393c1d24a7b9", licence: "CC0" },
    },
    colours: ["#e9c14a", "#de372f", "#b3202b"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: -0.06, saturation: 1.05, value: 1 },
      { hue: -0.09, saturation: 0.6, value: 1.15 },
      { hue: -0.03, saturation: 1.1, value: 0.72 },
    ],
    nod: 0.85,
    foliage: [{ nodes: [0.42, 0.56, 0.68, 0.79, 0.88], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.05, blade: 0.83, width: 0.3, axil: 0.95, arch: 0.05, droop: 0.32, fold: 0.22, waist: 0.74, blunt: 0.72, teeth: 0.05, lobes: 0, leaflets: 1 }],
    seedLeaves: true,
    stem: { radius: 0.042, base: "#4e4a2c", top: "#5f8038", thorns: 0 },
    green: ["#17361f", "#2a5a30", "#5d8f4a"],
    gloss: 0.8,
  },
  {
    id: "water-lily",
    label: "Water lily",
    head: {
      url: "/models/heads/water-lily.glb",
      top: 1.13, closed: 0.46, twist: 0.9, bud: 0.8, size: 1, neck: 0.12, kept: 0.93,
      credit: { by: "ffishAsia and floraZia", url: "https://sketchfab.com/3d-models/none-e7830f486a0248b6b894f3e7a63b8c16", licence: "CC0" },
    },
    colours: ["#ebbd5b", "#efdf8a", "#eeeab6"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: 0.82, saturation: 1.6, value: 1 },
      { hue: 0.72, saturation: 1.5, value: 0.98 },
      { hue: 0.9, saturation: 1.3, value: 1.02 },
    ],
    nod: 0.74,
    foliage: [
      { nodes: [0.015], perNode: 1, turn: 2.2, stalk: 1.3, blade: 0.91, width: 0.65, axil: 0.34, arch: 1.25, droop: 0.2, fold: 0.05, waist: 1, blunt: 0.5, teeth: 0, lobes: 0, leaflets: 1 },
      { nodes: [0.012], perNode: 1, turn: 2.2, stalk: 0.82, blade: 0.68, width: 0.49, axil: 0.5, arch: 1.15, droop: 0.2, fold: 0.05, waist: 1, blunt: 0.5, teeth: 0, lobes: 0, leaflets: 1 },
    ],
    seedLeaves: false,
    stem: { radius: 0.036, base: "#55703f", top: "#8aa95a", thorns: 0 },
    green: ["#2c5a44", "#4c8460", "#94bd84"],
    gloss: 0.5,
  },
  {
    id: "rose",
    label: "Rose",
    head: {
      url: "/models/heads/rose.glb",
      top: 1.154, closed: 0.46, twist: 0.9, bud: 0.8, size: 1, neck: 0.2, kept: 0.93,
      credit: { by: "0BNDT", url: "https://sketchfab.com/3d-models/none-48bc8f9448184489807301064d5dd538", licence: "CC BY 4.0" },
    },
    colours: ["#f2c46b", "#fb764e", "#e5425e"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: -0.045, saturation: 1.25, value: 0.78 },
      { hue: -0.08, saturation: 0.85, value: 1.02 },
      { hue: 0.05, saturation: 1.05, value: 1.05 },
      { hue: -0.17, saturation: 0.72, value: 1 },
    ],
    nod: 0.44,
    foliage: [{ nodes: [0.28, 0.44, 0.59, 0.73, 0.85], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.3, blade: 0.4, width: 0.18, axil: 0.98, arch: 0.26, droop: 0.28, fold: 0.34, waist: 0.8, blunt: 0.8, teeth: 0.07, lobes: 0, leaflets: 5 }],
    seedLeaves: true,
    stem: { radius: 0.036, base: "#5c3e2c", top: "#5f8a3c", thorns: 9 },
    green: ["#1d4128", "#35683a", "#7aa050"],
    gloss: 0.56,
  },
  {
    id: "tiger-lily",
    label: "Tiger lily",
    head: {
      url: "/models/heads/tiger-lily.glb",
      top: 1.4, closed: 0.3, twist: 0.9, bud: 0.8, size: 1.3, neck: 0.2, kept: 0.52,
      credit: { by: "ffishAsia and floraZia", url: "https://sketchfab.com/3d-models/none-b11d9f411194426bb16883aed176e4e6", licence: "CC0" },
    },
    colours: ["#c97e39", "#ea8d51", "#c37e52"],
    tints: [
      { hue: 0, saturation: 1, value: 1 },
      { hue: -0.06, saturation: 1.15, value: 0.95 },
      { hue: -0.1, saturation: 1, value: 1 },
      { hue: 0.06, saturation: 1.05, value: 1.05 },
      { hue: 0.85, saturation: 0.8, value: 1 },
    ],
    nod: 0.1,
    foliage: [{ nodes: [0.012, 0.02, 0.05], perNode: 1, turn: 2.4, stalk: 0, blade: 1.84, width: 0.26, axil: 0.32, arch: 0, droop: 1.1, fold: 0.72, waist: 0.56, blunt: 0.82, teeth: 0, lobes: 0, leaflets: 1 }],
    seedLeaves: false,
    stem: { radius: 0.05, base: "#7f9a58", top: "#a3b86c", thorns: 0 },
    green: ["#3a6450", "#5a8a68", "#a2c08e"],
    gloss: 0.42,
  },
];
