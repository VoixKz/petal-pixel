import { lifeAtGrowth, LIFE } from "./life";
import { SPECIES, type Colour, type Foliage, type Species, type Tint } from "./species";
import type { Leaf, Leaflet, StemPlan, Thorn } from "./stem";

export { LIFE };

export interface Blossom {
  species: Species;
  /** What the name does to the flower's own colours. */
  tint: Tint;
  /** The flower's colours after the tint, for swatches and the light around it. */
  colour: Colour;
  /** How far it opens at the end of its life. */
  fullness: number;
  /** Which way it faces around its stem. */
  turn: number;
  stem: StemPlan;
  leaves: Leaf[];
  thorns: Thorn[];
}

/** The same seed always gives the same numbers, on every device. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2716044179);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function speciesFor(seed: string): Species {
  return SPECIES[Math.floor(seededRandom(`${seed}:species`)() * SPECIES.length)];
}

const rgb = (hex: string): number[] => {
  const channel = (at: number) => (parseInt(hex.slice(at, at + 2), 16) / 255) ** 2.2;
  return [channel(1), channel(3), channel(5)];
};

function planStem(species: Species, between: (low: number, high: number) => number): StemPlan {
  const nodes = species.foliage.flatMap((set) => set.nodes).filter((node) => node > 0.1);
  return {
    height: 2.4,
    radius: species.stem.radius,
    sideBend: between(0.07, 0.13) * (between(0, 1) > 0.5 ? 1 : -1),
    frontBend: between(0.03, 0.07),
    phase: between(0, Math.PI * 2),
    hookTurn: between(-0.6, 0.6) + (between(0, 1) > 0.5 ? 0 : Math.PI),
    nod: species.nod,
    nodes,
    colour: { base: rgb(species.stem.base), top: rgb(species.stem.top) },
  };
}

function leafletsOf(set: Foliage, between: (low: number, high: number) => number): Leaflet[] {
  const pair = (along: number, scale: number): Leaflet[] =>
    ([-1, 1] as const).map((side) => ({ along, side, splay: between(0.82, 1.02), scale: scale * between(0.94, 1.06) }));
  if (set.leaflets === 5) return [...pair(0.56, 0.82), ...pair(0.86, 0.94)];
  return set.leaflets === 3 ? pair(0.9, 0.86) : [];
}

function planLeaves(species: Species, between: (low: number, high: number) => number): Leaf[] {
  const leaves: Leaf[] = [];
  if (species.seedLeaves) {
    const turn = between(0, Math.PI * 2);
    for (const side of [0, Math.PI]) {
      leaves.push({
        node: 0.085,
        azimuth: turn + side,
        birth: lifeAtGrowth(0.12),
        axil: 1.2,
        stalk: 0.015,
        blade: 0.17,
        width: 0.075,
        arch: 0,
        droop: 0.3,
        fold: 0.1,
        waist: 0.86,
        blunt: 0.5,
        teeth: 0,
        lobes: 0,
        leaflets: [],
      });
    }
  }
  for (const set of species.foliage) {
    const start = between(0, Math.PI * 2);
    set.nodes.forEach((node, n) => {
      const turn = start + n * set.turn + between(-0.18, 0.18);
      const smaller = 1 - 0.34 * node * node;
      for (let i = 0; i < set.perNode; i += 1) {
        const size = smaller * between(0.92, 1.06);
        leaves.push({
          node,
          azimuth: turn + (i / set.perNode) * Math.PI * 2,
          birth: lifeAtGrowth(Math.max(node, 0.06) + 0.02),
          axil: set.axil * between(0.94, 1.06),
          stalk: set.stalk * size,
          blade: set.blade * size,
          width: set.width * size,
          arch: set.arch * between(0.9, 1.1),
          droop: set.droop * between(0.85, 1.15),
          fold: set.fold,
          waist: set.waist,
          blunt: set.blunt,
          teeth: set.teeth,
          lobes: set.lobes,
          leaflets: leafletsOf(set, between),
        });
      }
    });
  }
  return leaves;
}

/** Moves a colour by a tint in the same way the flower's shader does. */
export function tinted(hex: string, { hue, saturation, value }: Tint): string {
  const [r, g, b] = rgb(hex);
  const high = Math.max(r, g, b);
  const span = high - Math.min(r, g, b);
  const h = span === 0 ? 0 : high === r ? ((g - b) / span + 6) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  const v = Math.min(high * value, 1);
  const s = Math.min((high === 0 ? 0 : span / high) * saturation, 1);
  const turned = ((h / 6 + hue + 1) % 1) * 6;
  const channel = (n: number) => {
    const k = (n + turned) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const hexOf = (x: number) => Math.round(x ** (1 / 2.2) * 255).toString(16).padStart(2, "0");
  return `#${hexOf(channel(5))}${hexOf(channel(3))}${hexOf(channel(1))}`;
}

export function tintFor(seed: string, species: Species): Tint {
  return species.tints[Math.floor(seededRandom(`${seed}:${species.id}`)() * species.tints.length)];
}

export function colourFor(seed: string, species: Species): Colour {
  const tint = tintFor(seed, species);
  const [base, mid, tip] = species.colours;
  return [tinted(base, tint), tinted(mid, tint), tinted(tip, tint)];
}

export function buildBlossom(seed: string, species: Species = speciesFor(seed)): Blossom {
  const random = seededRandom(`${seed}:${species.id}`);
  const between = (low: number, high: number) => lerp(low, high, random());
  random();
  const fullness = between(0.9, 1);
  const turn = between(0, Math.PI * 2);
  const stem = planStem(species, between);
  const leaves = planLeaves(species, between);
  const thorns = Array.from({ length: species.stem.thorns }, () => ({
    node: between(0.08, 0.86),
    azimuth: between(0, Math.PI * 2),
    size: between(0.05, 0.08),
  }));

  return { species, tint: tintFor(seed, species), colour: colourFor(seed, species), fullness, turn, stem, leaves, thorns };
}
