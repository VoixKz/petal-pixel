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
  { name: "Anna", species: "camellia" },
  { name: "Maria", species: "lotus" },
  { name: "Aisha", species: "magnolia" },
  { name: "Oleg", species: "rose" },
  { name: "Sara", species: "peony" },
  { name: "Iris", species: "anemone" },
];

/** A flower lit from inside, stood in a row at night. */
export const LAMPS = ["Zara", "Maria", "Dana", "Omar", "Anna"];

export const stillOf = (name: string, night: boolean) => `/flowers/names/${name.toLowerCase()}${night ? "-night" : ""}.webp`;
export const lampOf = (name: string) => `/flowers/lamps/${name.toLowerCase()}.webp`;

/** Black or white, whichever reads better on a colour. */
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#141412" : "#ffffff";
}
