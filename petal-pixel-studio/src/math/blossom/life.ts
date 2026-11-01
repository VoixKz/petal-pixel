/** When each stage of the plant's life happens, on a 0 to 1 scale. */
export const LIFE = {
  stem: [0.02, 0.44],
  swell: [0.2, 0.5],
  sepals: 0.44,
  petals: [0.48, 0.76],
  stamens: 0.78,
  pod: [0.62, 0.9],
} as const;

export const smooth = (x: number, from: number, to: number) => {
  const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
};

/** A slower start and finish than smooth, for things that have weight. */
export const settle = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** How much of its full height the stem has reached. */
export const stemGrowth = (life: number) => smooth(life, LIFE.stem[0], LIFE.stem[1]);

/** The moment the stem reaches a share of its height, which is when a leaf there starts. */
export function lifeAtGrowth(share: number): number {
  let low: number = LIFE.stem[0];
  let high: number = LIFE.stem[1];
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (stemGrowth(middle) < share) low = middle;
    else high = middle;
  }
  return high;
}
