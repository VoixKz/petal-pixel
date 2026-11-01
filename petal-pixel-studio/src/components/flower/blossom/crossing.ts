// Runs the real shader's pose in JavaScript and measures where parts of a flower pass
// through one another. A petal is a surface of lean over reach and turn around the heart,
// so two petals cross exactly where the sign of their difference in lean flips.
import { PART_KIND, type Blossom, type Part } from "@/math/blossom/build";
import { POSE_GLSL } from "./material";

type Vec = { x: number; y: number; z: number; w: number };
type Pose = (grid: { x: number; y: number }) => [number, number, number];

const clamp = (x: number, low: number, high: number) => Math.min(Math.max(x, low), high);
const LIBRARY = {
  PI: Math.PI,
  sin: Math.sin,
  cos: Math.cos,
  exp: Math.exp,
  abs: Math.abs,
  sign: Math.sign,
  pow: Math.pow,
  tanh: Math.tanh,
  max: Math.max,
  min: Math.min,
  clamp,
  mix: (a: number, b: number, t: number) => a + (b - a) * t,
  smoothstep: (from: number, to: number, x: number) => {
    const t = clamp((x - from) / (to - from), 0, 1);
    return t * t * (3 - 2 * t);
  },
  atan: (y: number, x: number) => Math.atan2(y, x),
  length: (v: number[]) => Math.hypot(...v),
  vec2: (x: number, y: number) => [x, y],
  vec3: (x: number, y: number, z: number) => [x, y, z],
};

/** Turns the GLSL of the pose into a function, so the numbers are the shader's own. */
function compile(): (attributes: Record<string, Vec>, kind: number, life: number, bud: Vec) => Pose {
  const source = POSE_GLSL.replace(/^(attribute|uniform|varying)[^\n]*$/gm, "")
    .replace(/\b(?:float|vec2|vec3|bool)\s+([A-Za-z_]\w*)\s*\(/g, "function $1(")
    .replace(/\((?:float|vec2)\s+/g, "(")
    .replace(/,\s*(?:float|vec2)\s+/g, ", ")
    .replace(/\b(?:const\s+)?(?:float|bool)\s+/g, "let ");
  const names = Object.keys(LIBRARY);
  const make = new Function(
    ...names,
    "aShape, aBend, aEdge, aForm, aKind, aShell, aRoom, uLife, uBud",
    `${source}\nreturn petalPoint;`,
  );
  return (attributes, kind, life, bud) =>
    make(
      ...names.map((name) => LIBRARY[name as keyof typeof LIBRARY]),
      attributes.aShape,
      attributes.aBend,
      attributes.aEdge,
      attributes.aForm,
      kind,
      attributes.aShell,
      attributes.aRoom,
      life,
      bud,
    );
}

const vec = (x: number, y: number, z = 0, w = 0): Vec => ({ x, y, z, w });

function attributesOf(part: Part): Record<string, Vec> {
  return {
    aShape: vec(part.azimuth, part.depth, part.birth, part.length),
    aBend: vec(part.wrap, part.lean, part.curl, part.tipCurl),
    aEdge: vec(part.cup, part.phase, part.notch),
    aForm: vec(part.waist, part.blunt, part.rim, part.tilt),
    aShell: vec(part.shell, part.shellTilt),
    aRoom: vec(part.room.inBase, part.room.inTip, part.room.outBase, part.room.outTip),
  };
}

const compiled = compile();

/** A part's pose at one moment of the plant's life. */
export function poseOf(part: Part, blossom: Blossom, life: number): Pose {
  const { radius, height, twist } = blossom.species.bud;
  return compiled(attributesOf(part), part.kind, life, vec(radius, height, twist, blossom.species.ruffle));
}

const REACHES = 40;
const TURNS = 240;
const REACH_STEP = 0.03;
const INNER = 3;
const EPSILON = 0.002;

/** Keeps an angle within half a turn of the last, so a line of points never jumps. */
const unwrapped = (turn: number, last: number | undefined) =>
  last === undefined ? turn : turn + Math.round((last - turn) / (Math.PI * 2)) * Math.PI * 2;

export interface Crossing {
  /** Pairs of parts that change sides somewhere in their overlap. */
  pairs: number;
  /** Share of all compared cells that sit on the wrong side. */
  share: number;
  worst: { a: number; b: number; cells: number } | null;
}

/** Counts crossings between the given parts at one moment. */
export function crossings(blossom: Blossom, parts: Part[], life: number): Crossing {
  const lean = new Float32Array(parts.length * REACHES * TURNS).fill(Number.NaN);
  parts.forEach((part, index) => {
    const pose = poseOf(part, blossom, life);
    const lines = part.kind === PART_KIND.stamen ? 1 : 49;
    for (let a = 0; a < lines; a += 1) {
      const u = lines === 1 ? 0 : (a / (lines - 1)) * 2 - 1;
      let last: number[] | null = null;
      for (let b = 0; b <= 72; b += 1) {
        const [x, y, z] = pose({ x: u, y: b / 72 });
        const here = [Math.hypot(x, y, z), Math.atan2(Math.hypot(x, z), y), unwrapped(Math.atan2(z, x), last?.[2])];
        // Two surfaces can only be compared at one exact reach, so read each at the rows' centres.
        if (last && here[0] > last[0]) {
          const first = Math.max(Math.ceil(last[0] / REACH_STEP - 0.5), INNER);
          const end = Math.min(Math.ceil(here[0] / REACH_STEP - 0.5), REACHES);
          for (let row = first; row < end; row += 1) {
            const t = ((row + 0.5) * REACH_STEP - last[0]) / (here[0] - last[0]);
            const turn = last[2] + (here[2] - last[2]) * t;
            const cell = Math.floor((turn / (Math.PI * 2)) * TURNS);
            const wrapped = ((cell % TURNS) + TURNS) % TURNS;
            lean[index * REACHES * TURNS + row * TURNS + wrapped] = last[1] + (here[1] - last[1]) * t;
          }
        }
        last = here;
      }
    }
  });

  const sides = new Int32Array(parts.length * parts.length * 2);
  let compared = 0;
  for (let cell = 0; cell < REACHES * TURNS; cell += 1) {
    const here: number[] = [];
    for (let i = 0; i < parts.length; i += 1) if (!Number.isNaN(lean[i * REACHES * TURNS + cell])) here.push(i);
    for (let m = 0; m < here.length; m += 1) {
      for (let n = m + 1; n < here.length; n += 1) {
        const gap = lean[here[m] * REACHES * TURNS + cell] - lean[here[n] * REACHES * TURNS + cell];
        if (Math.abs(gap) < EPSILON) continue;
        sides[(here[m] * parts.length + here[n]) * 2 + (gap > 0 ? 0 : 1)] += 1;
        compared += 1;
      }
    }
  }

  let pairs = 0;
  let wrong = 0;
  let worst: Crossing["worst"] = null;
  for (let a = 0; a < parts.length; a += 1) {
    for (let b = a + 1; b < parts.length; b += 1) {
      const cells = Math.min(sides[(a * parts.length + b) * 2], sides[(a * parts.length + b) * 2 + 1]);
      if (cells < 4) continue;
      pairs += 1;
      wrong += cells;
      if (!worst || cells > worst.cells) worst = { a, b, cells };
    }
  }
  return { pairs, share: compared ? wrong / compared : 0, worst };
}
