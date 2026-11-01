// Real output of the generator for nine names, one per flower family.
export interface Specimen {
  name: string;
  family: string;
  stops: [string, string, string];
}

/** Everyday names for the families whose code names are mathematical terms. */
const PLAIN_NAMES: Record<string, string> = {
  classic: "trumpet flower",
  rhodonea: "star flower",
  superformula: "shell flower",
};

export const plainFamily = (family: string) => PLAIN_NAMES[family] ?? family;

export const SPECIMENS: Specimen[] = [
  { name: "Anna", family: "camellia", stops: ["#f3ddb2", "#f1a759", "#da672d"] },
  { name: "Ben", family: "rose", stops: ["#ffeff7", "#ffb9e0", "#e36bbe"] },
  { name: "Zara", family: "lotus", stops: ["#e1ddee", "#b1a6de", "#7363bd"] },
  { name: "Dana", family: "dahlia", stops: ["#ecff86", "#ffec2e", "#fbb914"] },
  { name: "Oleg", family: "zinnia", stops: ["#ffecf4", "#ffaed5", "#ea5ab3"] },
  { name: "Maria", family: "trumpet flower", stops: ["#ffeec0", "#fec26b", "#e7853f"] },
  { name: "Sofia", family: "sunflower", stops: ["#e9dbdf", "#dfb1bf", "#c87f96"] },
  { name: "Omar", family: "star flower", stops: ["#f9ffa8", "#fff652", "#ccb71c"] },
  { name: "Alina", family: "shell flower", stops: ["#d89fcb", "#984b8a", "#582054"] },
];

/** Lower-case key of each still in /public/flowers. */
export const stillOf = (s: Specimen) => `/flowers/${s.name.toLowerCase()}.webp`;

/** Black or white, whichever reads better on a colour. */
export function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#141412" : "#ffffff";
}
