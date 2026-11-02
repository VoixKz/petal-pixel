// What makes each kind of flower itself. Lengths are relative to a flower of radius 1.
//
// A petal is described in spherical coordinates around the flower's heart: how far it
// reaches, and how far it leans from the upright axis. Giving every petal its own lean
// keeps them nested like shells, so they can overlap at every moment of opening without
// ever cutting through one another.

export type Colour = readonly [base: string, mid: string, tip: string];

export interface Whorl {
  length: number;
  /** Half the width of the petal, as an angle around the flower. */
  wrap: number;
  /** Lean from upright at the base: 0 points up, PI/2 lies flat, more hangs back. */
  lean: number;
  /** Change of lean along the petal: positive falls outward, negative makes a bowl. */
  curl: number;
  /** Extra change of lean gathered at the tip. */
  tipCurl: number;
  /** How far the rim rolls back, the lip of a rose. */
  rim: number;
  /** How far the edges rise above the middle, like a spoon. */
  cup: number;
  /** 0 is a smooth tip, higher cuts a heart-shaped notch. */
  notch: number;
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
  /** Outermost petal first; the seed-picked petals between are blended. */
  outer: Whorl;
  inner: Whorl;
  /** How many petals, as a range the seed picks from. */
  petals: readonly [number, number];
  /** Petals in each ring. Null grows them in one spiral at the golden angle. */
  ring: number | null;
  /** Above 1 the outer shape holds longer before giving way to the heart. */
  taper: number;
  /** Outline: where the petal is widest (lower is nearer the tip) and how blunt its tip is. */
  outline: readonly [waist: number, blunt: number];
  bud: { radius: number; height: number; twist: number };
  /** Green leaves around the bud. Tulips and anemones have none, and open straight from the stem. */
  sepals: number;
  /** Tilt across the width that tucks each petal under its neighbour. */
  tilt: number;
  /** Waves in the surface of the whole flower. Every petal rides the same waves, so they never cross. */
  ruffle: number;
  /** How far the open flower nods toward the viewer, in radians. */
  nod: number;
  stamens: { count: number; length: number; spread: number; colour: Colour } | null;
  /** The seed head at the centre, if the flower shows one. */
  pod: { radius: number; height: number; colour: string } | null;
  palettes: readonly Colour[];
  foliage: readonly Foliage[];
  /** The first pair of round leaves. Bulbs and water plants come up without them. */
  seedLeaves: boolean;
  stem: { radius: number; base: string; top: string; thorns: number };
  /** Shadowed, leaf and sunlit green. */
  green: Colour;
  /** How smooth the leaves are: 0 is matt, 1 waxed. */
  gloss: number;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const SPECIES: readonly Species[] = [
  {
    id: "camellia",
    ruffle: 0,
    label: "Camellia",
    outer: { length: 1.02, wrap: 0.56, lean: 1.46, curl: 0.06, tipCurl: 0.16, rim: 0.05, cup: 0.34, notch: 0.05 },
    inner: { length: 0.34, wrap: 0.74, lean: 0.14, curl: 0.05, tipCurl: -0.04, rim: 0, cup: 0.16, notch: 0 },
    petals: [40, 48],
    ring: null,
    taper: 0.9,
    outline: [0.78, 0.36],
    bud: { radius: 0.302, height: 0.689, twist: 1.2 },
    sepals: 6,
    tilt: 0.1,
    nod: 0.62,
    stamens: null,
    pod: null,
    palettes: [
      ["#8e1234", "#d22f58", "#f27a94"],
      ["#e8b8bc", "#f9e4e2", "#fffaf6"],
      ["#b42a54", "#ec7e9a", "#fcd2dc"],
      ["#9c141f", "#d9302f", "#f4665e"],
    ],
    foliage: [{ nodes: [0.42, 0.56, 0.68, 0.79, 0.88], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.05, blade: 0.83, width: 0.3, axil: 0.95, arch: 0.05, droop: 0.32, fold: 0.22, waist: 0.74, blunt: 0.72, teeth: 0.05, lobes: 0, leaflets: 1 }],
    seedLeaves: true,
    stem: { radius: 0.042, base: "#4e4a2c", top: "#5f8038", thorns: 0 },
    green: ["#17361f", "#2a5a30", "#5d8f4a"],
    gloss: 0.8,
  },
  {
    id: "magnolia",
    ruffle: 0,
    label: "Magnolia",
    outer: { length: 1.12, wrap: 0.56, lean: 1.26, curl: -0.62, tipCurl: 0.66, rim: 0.05, cup: 0.5, notch: 0 },
    inner: { length: 0.98, wrap: 0.86, lean: 0.86, curl: -0.66, tipCurl: 0.12, rim: 0, cup: 0.34, notch: 0 },
    petals: [9, 9],
    ring: 3,
    taper: 1,
    outline: [0.82, 0.62],
    bud: { radius: 0.252, height: 1.008, twist: 0.4 },
    sepals: 3,
    tilt: 0.05,
    nod: 0.3,
    stamens: { count: 26, length: 0.24, spread: 0.3, colour: ["#7c1d3a", "#c44a5c", "#f2d27a"] },
    pod: { radius: 0.1, height: 0.24, colour: "#b89a58" },
    palettes: [
      ["#b84c82", "#f0c2d0", "#fff4f0"],
      ["#e4d0a8", "#fbf1de", "#fffdf6"],
      ["#6e1f64", "#bd4f96", "#f4d0e2"],
    ],
    foliage: [{ nodes: [0.46, 0.62, 0.78], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.09, blade: 1.06, width: 0.39, axil: 1.05, arch: 0.1, droop: 0.42, fold: 0.18, waist: 0.82, blunt: 0.68, teeth: 0, lobes: 0, leaflets: 1 }],
    seedLeaves: true,
    stem: { radius: 0.05, base: "#54402e", top: "#7a6a44", thorns: 0 },
    green: ["#24492a", "#3f7238", "#7da65a"],
    gloss: 0.62,
  },
  {
    id: "lotus",
    ruffle: 0,
    label: "Lotus",
    outer: { length: 1.08, wrap: 0.34, lean: 1.56, curl: -0.26, tipCurl: -0.2, rim: 0, cup: 0.36, notch: 0 },
    inner: { length: 0.78, wrap: 0.42, lean: 0.72, curl: -0.36, tipCurl: -0.12, rim: 0, cup: 0.4, notch: 0 },
    petals: [26, 32],
    ring: null,
    taper: 1,
    outline: [0.84, 0.86],
    bud: { radius: 0.286, height: 0.924, twist: 0.2 },
    sepals: 4,
    tilt: 0.04,
    nod: 0.74,
    stamens: { count: 70, length: 0.34, spread: 0.74, colour: ["#d9a92e", "#f0c94a", "#fbe58a"] },
    pod: { radius: 0.16, height: 0.2, colour: "#c6d06a" },
    palettes: [
      ["#fff4df", "#fcc8d4", "#e8467c"],
      ["#fff6e4", "#fff0d6", "#fbdeea"],
      ["#fdf0d0", "#e7c6f0", "#9a5ad6"],
    ],
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
    id: "peony",
    ruffle: 0.05,
    label: "Peony",
    outer: { length: 1.02, wrap: 0.62, lean: 1.5, curl: 0.04, tipCurl: 0.1, rim: 0.1, cup: 0.3, notch: 0.12 },
    inner: { length: 0.54, wrap: 0.6, lean: 0.44, curl: -0.36, tipCurl: -0.04, rim: 0.02, cup: 0.16, notch: 0.14 },
    petals: [64, 76],
    ring: null,
    taper: 0.8,
    outline: [0.72, 0.3],
    bud: { radius: 0.353, height: 0.655, twist: 0.7 },
    sepals: 5,
    tilt: 0.08,
    nod: 0.56,
    stamens: null,
    pod: null,
    palettes: [
      ["#c8386c", "#f28cac", "#fddbe2"],
      ["#f4bda2", "#fbdfcc", "#fff4ea"],
      ["#7c1038", "#bd2456", "#e65c86"],
    ],
    foliage: [{ nodes: [0.3, 0.46, 0.62, 0.76], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.28, blade: 0.63, width: 0.21, axil: 0.92, arch: 0.3, droop: 0.42, fold: 0.26, waist: 0.82, blunt: 0.78, teeth: 0, lobes: 1, leaflets: 3 }],
    seedLeaves: true,
    stem: { radius: 0.044, base: "#6c3a3a", top: "#6e9140", thorns: 0 },
    green: ["#23502d", "#3c7a3a", "#7cad58"],
    gloss: 0.3,
  },
  {
    id: "rose",
    ruffle: 0.012,
    label: "Rose",
    outer: { length: 0.88, wrap: 0.76, lean: 1.14, curl: 0.06, tipCurl: 0.3, rim: 0.26, cup: 0.18, notch: 0.03 },
    inner: { length: 0.5, wrap: 1.1, lean: 0.18, curl: 0, tipCurl: 0.2, rim: 0.03, cup: 0.08, notch: 0 },
    petals: [28, 34],
    ring: null,
    taper: 0.62,
    outline: [0.74, 0.3],
    bud: { radius: 0.269, height: 0.806, twist: 1.7 },
    sepals: 5,
    tilt: 0.22,
    nod: 0.44,
    stamens: null,
    pod: null,
    palettes: [
      ["#5a0a1e", "#a0162f", "#de3a50"],
      ["#e07c52", "#f6b488", "#fde0bc"],
      ["#bc3a60", "#ee92aa", "#fcdce4"],
      ["#e6bc6c", "#f8e2a4", "#fff6d8"],
    ],
    foliage: [{ nodes: [0.28, 0.44, 0.59, 0.73, 0.85], perNode: 1, turn: GOLDEN_ANGLE, stalk: 0.3, blade: 0.4, width: 0.18, axil: 0.98, arch: 0.26, droop: 0.28, fold: 0.34, waist: 0.8, blunt: 0.8, teeth: 0.07, lobes: 0, leaflets: 5 }],
    seedLeaves: true,
    stem: { radius: 0.036, base: "#5c3e2c", top: "#5f8a3c", thorns: 9 },
    green: ["#1d4128", "#35683a", "#7aa050"],
    gloss: 0.56,
  },
  {
    id: "anemone",
    ruffle: 0.03,
    label: "Anemone",
    outer: { length: 1.02, wrap: 0.47, lean: 1.42, curl: 0.03, tipCurl: 0.12, rim: 0.04, cup: 0.32, notch: 0.02 },
    inner: { length: 0.88, wrap: 0.44, lean: 1.14, curl: 0.02, tipCurl: 0.1, rim: 0.03, cup: 0.34, notch: 0.02 },
    petals: [12, 14],
    ring: 6,
    taper: 1,
    outline: [0.72, 0.5],
    bud: { radius: 0.252, height: 0.672, twist: 0.8 },
    sepals: 0,
    tilt: 0.05,
    nod: 0.72,
    stamens: { count: 90, length: 0.26, spread: 0.92, colour: ["#17121f", "#2a2233", "#0e0a14"] },
    pod: { radius: 0.15, height: 0.13, colour: "#17121f" },
    palettes: [
      ["#1c1646", "#4a3aa6", "#8672e6"],
      ["#6a0a26", "#c81c40", "#f24c5a"],
      ["#d8cfe2", "#f6f2f6", "#ffffff"],
    ],
    foliage: [
      { nodes: [0.02, 0.025, 0.03], perNode: 1, turn: 2.1, stalk: 0.46, blade: 0.58, width: 0.39, axil: 0.82, arch: 0.8, droop: 0.34, fold: 0.1, waist: 0.92, blunt: 0.62, teeth: 0.06, lobes: 1.6, leaflets: 1 },
      { nodes: [0.72], perNode: 3, turn: 0, stalk: 0.02, blade: 0.53, width: 0.26, axil: 1.02, arch: 0, droop: 0.5, fold: 0.16, waist: 0.86, blunt: 0.7, teeth: 0.06, lobes: 1.5, leaflets: 1 },
    ],
    seedLeaves: true,
    stem: { radius: 0.03, base: "#5a5230", top: "#6f8a3e", thorns: 0 },
    green: ["#1f4a2c", "#3a7238", "#78a454"],
    gloss: 0.28,
  },
  {
    id: "dahlia",
    ruffle: 0,
    label: "Dahlia",
    outer: { length: 1.04, wrap: 0.2, lean: 1.72, curl: -0.1, tipCurl: -0.08, rim: 0, cup: 0.42, notch: 0 },
    inner: { length: 0.3, wrap: 0.42, lean: 0.14, curl: 0.03, tipCurl: -0.01, rim: 0, cup: 0.3, notch: 0 },
    petals: [96, 118],
    ring: null,
    taper: 0.82,
    outline: [0.84, 1.1],
    bud: { radius: 0.302, height: 0.605, twist: 1 },
    sepals: 8,
    tilt: 0.03,
    nod: 0.62,
    stamens: null,
    pod: null,
    palettes: [
      ["#8c0e30", "#de2a52", "#f66c80"],
      ["#c85c14", "#f49a30", "#fcd070"],
      ["#4e1248", "#962a82", "#de70b8"],
    ],
    foliage: [{ nodes: [0.28, 0.5, 0.72], perNode: 2, turn: Math.PI / 2, stalk: 0.22, blade: 0.63, width: 0.23, axil: 1, arch: 0.24, droop: 0.42, fold: 0.26, waist: 0.76, blunt: 0.74, teeth: 0.09, lobes: 0, leaflets: 3 }],
    seedLeaves: true,
    stem: { radius: 0.046, base: "#5e4230", top: "#62893e", thorns: 0 },
    green: ["#204a2b", "#3a7338", "#74a44e"],
    gloss: 0.34,
  },
  {
    id: "tulip",
    ruffle: 0,
    label: "Tulip",
    outer: { length: 1.16, wrap: 0.92, lean: 1.14, curl: -0.94, tipCurl: 0.2, rim: 0.02, cup: 0.34, notch: 0 },
    inner: { length: 1.08, wrap: 0.9, lean: 0.92, curl: -0.82, tipCurl: 0.1, rim: 0.01, cup: 0.3, notch: 0 },
    petals: [6, 6],
    ring: 3,
    taper: 1,
    outline: [0.86, 0.74],
    bud: { radius: 0.286, height: 0.89, twist: 0.16 },
    sepals: 0,
    tilt: 0.04,
    nod: 0.1,
    stamens: { count: 6, length: 0.42, spread: 0.2, colour: ["#2a1a12", "#4a2c18", "#1c1208"] },
    pod: { radius: 0.06, height: 0.3, colour: "#a8b45e" },
    palettes: [
      ["#d8b42e", "#e8332e", "#bc1626"],
      ["#fff0c8", "#fcb6c8", "#ec5a88"],
      ["#2e0f3a", "#5a1a6a", "#8a3a9a"],
    ],
    foliage: [{ nodes: [0.012, 0.02, 0.05], perNode: 1, turn: 2.4, stalk: 0, blade: 1.84, width: 0.26, axil: 0.32, arch: 0, droop: 1.1, fold: 0.72, waist: 0.56, blunt: 0.82, teeth: 0, lobes: 0, leaflets: 1 }],
    seedLeaves: false,
    stem: { radius: 0.05, base: "#7f9a58", top: "#a3b86c", thorns: 0 },
    green: ["#3a6450", "#5a8a68", "#a2c08e"],
    gloss: 0.42,
  },
];

/** Greens for sepals: shadowed, leaf, sunlit. */
export const LEAF: Colour = ["#3c6230", "#5f8f40", "#96b85a"];
