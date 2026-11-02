// Real output of the blossom engine for the names shown on the page. The numbers in
// specimens.test.ts hold them to what the engine really grows for each name.
export interface Specimen {
  name: string;
  species: string;
}

/** The flower a visitor has just grown, carried down the page. */
export interface GrownFlower {
  name: string;
  seed: string;
  species: string;
}

export const FIRST_NAME = "Dana";
/** The real SHA-256 of "dana", which is also the seed of the page's first flower. */
export const FIRST_SEED = "2c9e0a2585dc7406589a3724f0027811506e0f133726303a15d6779d532a2573";

export const SPECIMENS: Specimen[] = [
  { name: "Iris", species: "rose" },
  { name: "Oleg", species: "water lily" },
  { name: "Aisha", species: "peony" },
  { name: "Maya", species: "tiger lily" },
  { name: "Ayan", species: "camellia" },
  { name: "Anna", species: "hibiscus" },
];

/** A flower lit from inside, stood in a row at night. */
export const LAMPS = ["Dana", "Oleg", "Aisha", "Maya", "Ayan"];

/** Pictures were once kept by browsers for a month. A new address is the only way past those copies. */
export const picture = (path: string) => `${path}?v=2`;

export const stillOf = (name: string, night: boolean) => picture(`/flowers/names/${name.toLowerCase()}${night ? "-night" : ""}.webp`);
export const lampOf = (name: string) => picture(`/flowers/lamps/${name.toLowerCase()}.webp`);

/** Whether this browser can draw the plant at all. */
export function hasWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/** Black or white, whichever reads better on a colour. */
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#141412" : "#ffffff";
}
