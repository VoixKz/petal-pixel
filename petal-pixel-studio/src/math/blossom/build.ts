import { lifeAtGrowth, LIFE } from "./life";
import { GOLDEN_ANGLE, LEAF, SPECIES, type Colour, type Foliage, type Species, type Whorl } from "./species";
import type { Leaf, Leaflet, StemPlan, Thorn } from "./stem";

export { LIFE };

export const PART_KIND = { petal: 0, sepal: 1, stamen: 2 } as const;

/** One petal, sepal or stamen. All of them are the same shape with other numbers. */
export interface Part {
  kind: (typeof PART_KIND)[keyof typeof PART_KIND];
  azimuth: number;
  /** 0 is the outside of the flower, 1 the heart. */
  depth: number;
  /** When it starts to open, on the plant's 0 to 1 life. */
  birth: number;
  length: number;
  wrap: number;
  lean: number;
  curl: number;
  tipCurl: number;
  rim: number;
  cup: number;
  phase: number;
  notch: number;
  waist: number;
  blunt: number;
  tilt: number;
  /** Height where it joins the stem; zero for everything on the flower head. */
  /** Its place in the closed bud: every layer is the same shell, scaled about the heart. */
  shell: number;
  /** How much of a bud layer stands off at one edge and tucks in at the other. */
  shellTilt: number;
  /** How far the surface may move before it meets a neighbour, near the base and near the tip. */
  room: Room;
  colour: Colour;
}

export interface Room {
  inBase: number;
  inTip: number;
  outBase: number;
  outTip: number;
}

export interface Blossom {
  species: Species;
  colour: Colour;
  petals: Part[];
  /** Sepals and stamens share the head with the petals, but keep their own colours. */
  head: Part[];
  stem: StemPlan;
  leaves: Leaf[];
  thorns: Thorn[];
}

/** A part with nothing around it: it can move as it likes. */
const FREE = 0.6;
const open = (): Room => ({ inBase: FREE, inTip: FREE, outBase: FREE, outTip: FREE });

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

function blend(outer: Whorl, inner: Whorl, t: number): Whorl {
  const mixed = {} as Record<keyof Whorl, number>;
  for (const key of Object.keys(outer) as (keyof Whorl)[]) mixed[key] = lerp(outer[key], inner[key], t);
  return mixed;
}

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

const REACH_SAMPLES = 7;
const MIN_GAP = 0.012;
/** Past this point along a petal it is its tip, the part that usually shows. */
const TIP_BAND = 0.62;
const STAMEN_CURL = 0.2;

/** The lean along the middle of an open petal. The shader's openLean at u = 0. */
export function spineAt(part: Pick<Part, "lean" | "curl" | "tipCurl" | "rim">, v: number): number {
  return part.lean + part.curl * v + part.tipCurl * v ** 3 + part.rim * v ** 4;
}

/** The shortest way round from one angle to another, with its sign. */
function turnBetween(from: number, to: number): number {
  const turn = (to - from) % (Math.PI * 2);
  if (turn > Math.PI) return turn - Math.PI * 2;
  return turn < -Math.PI ? turn + Math.PI * 2 : turn;
}

/** Compares two petals at equal reach, which is where they would touch. */
function gapsBetween(outer: Part, inner: Part): { v: number; gap: number; innerV: number }[] {
  const shorter = Math.min(outer.length, inner.length);
  return Array.from({ length: REACH_SAMPLES }, (_, s) => {
    const reach = (shorter * (s + 1)) / REACH_SAMPLES;
    const v = reach / outer.length;
    const innerV = reach / inner.length;
    return { v, innerV, gap: spineAt(outer, v) - spineAt(inner, innerV) };
  });
}

/**
 * Sets every petal's place in the stack so that no two can cross. An inner petal is laid
 * under each outer one it overlaps, then each petal learns how much room that leaves it,
 * and the shader never bends a petal further than that.
 */
function layerPetals(petals: Part[], species: Species): void {
  const overlaps: { outer: Part; inner: Part; turn: number }[] = [];
  petals.forEach((inner, j) => {
    for (let i = 0; i < j; i += 1) {
      const outer = petals[i];
      const turn = turnBetween(outer.azimuth, inner.azimuth);
      if (Math.abs(turn) > (outer.wrap + inner.wrap) * 1.16) continue;
      overlaps.push({ outer, inner, turn });
      const worst = Math.max(...gapsBetween(outer, inner).map(({ gap }) => MIN_GAP - gap));
      if (worst > 0) inner.lean -= worst;
    }
    if (j > 0) inner.lean = Math.max(Math.min(inner.lean, petals[j - 1].lean - 1e-4), 0.02);
  });

  // Tilting every petal by the same angle moves two neighbours together, so all that
  // changes between them is their spacing around the flower. Only one direction narrows it.
  let tilt = species.tilt;
  let shellTilt = species.tilt;
  for (const { outer, inner, turn } of overlaps) {
    if (turn >= 0) continue;
    const gap = Math.min(...gapsBetween(outer, inner).map((sample) => sample.gap));
    tilt = Math.min(tilt, (0.8 * Math.max(gap, 0)) / -turn);
    shellTilt = Math.min(shellTilt, (0.85 * (outer.shell - inner.shell)) / -turn);
  }

  for (const { outer, inner, turn } of overlaps) {
    for (const { v, innerV, gap } of gapsBetween(outer, inner)) {
      const room = Math.max(gap + tilt * Math.min(turn, 0), 0) / 2;
      if (v < TIP_BAND) outer.room.inBase = Math.min(outer.room.inBase, room);
      else outer.room.inTip = Math.min(outer.room.inTip, room);
      if (innerV < TIP_BAND) inner.room.outBase = Math.min(inner.room.outBase, room);
      else inner.room.outTip = Math.min(inner.room.outTip, room);
    }
  }
  for (const petal of petals) {
    petal.tilt = tilt;
    petal.shellTilt = shellTilt;
    // The base is never given more room than the tip, or a petal would jump between the two.
    petal.room.inBase = Math.min(petal.room.inBase, petal.room.inTip);
    petal.room.outBase = Math.min(petal.room.outBase, petal.room.outTip);
  }
}

/** The most a stamen of this reach can lean and stay inside the given petals. */
function insideOf(petals: Part[], reach: number): number {
  const limit = (at: number) => Math.min(...petals.map((petal) => spineAt(petal, Math.min(at / petal.length, 1))));
  return Math.max(Math.min(limit(reach) - STAMEN_CURL, limit(reach / 2) - STAMEN_CURL / 2) - 0.05, 0);
}

/** The first number of a flower's stream picks its colours, so this reads them without building it. */
export function colourFor(seed: string, species: Species): Colour {
  return species.palettes[Math.floor(seededRandom(`${seed}:${species.id}`)() * species.palettes.length)];
}

export function buildBlossom(seed: string, species: Species = speciesFor(seed)): Blossom {
  const random = seededRandom(`${seed}:${species.id}`);
  const between = (low: number, high: number) => lerp(low, high, random());
  const colour = species.palettes[Math.floor(random() * species.palettes.length)];

  const count = Math.round(between(species.petals[0], species.petals[1]));
  const swing = between(0.96, 1.04);
  const start = random() * Math.PI * 2;
  const petals: Part[] = [];

  for (let i = 0; i < count; i += 1) {
    const ring = species.ring;
    const place = ring === null ? i : Math.floor(i / ring);
    const places = ring === null ? count : Math.ceil(count / ring);
    const depth = places === 1 ? 0 : place / (places - 1);
    const whorl = blend(species.outer, species.inner, depth ** species.taper);
    const azimuth =
      start +
      (ring === null
        ? i * GOLDEN_ANGLE
        : ((i % ring) / ring) * Math.PI * 2 + (place * Math.PI) / ring + between(-0.03, 0.03));
    petals.push({
      kind: PART_KIND.petal,
      azimuth,
      depth,
      // The heart opens almost as one, which keeps its tight layers in step.
      birth: lerp(LIFE.petals[0], LIFE.petals[1], 1 - (1 - depth) ** 1.8),
      length: whorl.length * between(0.97, 1.03) * swing,
      wrap: whorl.wrap * between(0.96, 1.04),
      // Strictly less lean with every petal is what keeps them nested. The small step
      // stands in for the order the petals grew in, inside one ring too.
      lean: whorl.lean - (i / count) * 0.04,
      curl: whorl.curl + between(-0.02, 0.02),
      tipCurl: whorl.tipCurl + between(-0.02, 0.02),
      rim: whorl.rim * between(0.85, 1.15),
      cup: whorl.cup,
      phase: random() * 6.28,
      notch: whorl.notch,
      waist: species.outline[0],
      blunt: species.outline[1],
      tilt: species.tilt,
      shell: 1 - 0.5 * (1 - (1 - i / Math.max(count - 1, 1)) ** 2.2) - (0.08 * i) / Math.max(count - 1, 1),
      shellTilt: 0,
      room: open(),
      colour,
    });
  }

  const head: Part[] = [];
  for (let i = 0; i < species.sepals; i += 1) {
    head.push({
      kind: PART_KIND.sepal,
      azimuth: (i / species.sepals) * Math.PI * 2 + 0.3,
      depth: 0,
      birth: LIFE.sepals,
      length: 0.4,
      wrap: Math.min(0.36, 1.9 / species.sepals),
      lean: 1.75,
      curl: 0.5,
      tipCurl: 0.5,
      rim: 0,
      cup: 0.12,
      phase: 0,
      notch: 0,
      waist: 0.8,
      blunt: 0.9,
      tilt: 0,
      shell: 1.06,
      shellTilt: 0,
      room: open(),
      colour: LEAF,
    });
  }
  layerPetals(petals, species);
  if (species.stamens) {
    const { count: stamens, length, spread, colour: tint } = species.stamens;
    const fence = insideOf(petals.slice(-(species.ring ?? 8)), length * 1.12);
    for (let i = 0; i < stamens; i += 1) {
      head.push({
        kind: PART_KIND.stamen,
        azimuth: i * GOLDEN_ANGLE,
        depth: 1,
        birth: LIFE.stamens,
        length: length * between(0.85, 1.12),
        wrap: 0.018,
        lean: Math.min(Math.sqrt((i + 0.5) / stamens) * spread, fence),
        curl: STAMEN_CURL,
        tipCurl: 0,
        rim: 0,
        cup: 0,
        phase: 0,
        notch: 0,
        waist: 1,
        blunt: 0,
        tilt: 0,
        shell: 0.3,
        shellTilt: 0,
        room: open(),
        colour: tint,
      });
    }
  }

  const stem = planStem(species, between);
  const leaves = planLeaves(species, between);
  const thorns = Array.from({ length: species.stem.thorns }, () => ({
    node: between(0.08, 0.86),
    azimuth: between(0, Math.PI * 2),
    size: between(0.05, 0.08),
  }));

  return { species, colour, petals, head, stem, leaves, thorns };
}
