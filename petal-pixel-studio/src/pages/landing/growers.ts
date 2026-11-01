import type { ScanSource } from "@/components/flower/blossom/Scan";
import { SPECIES, type Species } from "@/math/blossom/species";

/** One flower visitors can grow in the section on the home page. */
export interface Grower {
  id: string;
  label: string;
  /** Sets the stem and leaves, and the petals unless a scan replaces them. */
  species: Species;
  scan?: ScanSource;
  note?: string;
}

const kind = (id: string) => SPECIES.find((s) => s.id === id) as Species;

const LYCASTE: ScanSource = {
  url: "/models/lycaste.glb",
  heart: [0, -0.02, -0.3],
  face: [-Math.PI / 2, 0, 0],
  stalkBelow: [9, -0.34, -0.25],
  nod: 1.16,
};

export const GROWERS: readonly Grower[] = [
  ...["lotus", "rose", "camellia", "dahlia", "peony", "anemone", "magnolia", "tulip"].map((id) => ({
    id,
    label: kind(id).label,
    species: kind(id),
  })),
  {
    id: "orchid",
    label: "Orchid",
    species: kind("magnolia"),
    scan: LYCASTE,
    note: "A real Lycaste orchid, scanned in 3D by the Smithsonian Institution and free for anyone to use.",
  },
];

/** Where each stage falls on the slider, in the plant's 0 to 1 life. */
export const STAGES = [
  { label: "Soil", at: 0 },
  { label: "Stem", at: 0.2 },
  { label: "Bud", at: 0.44 },
  { label: "Bloom", at: 0.78 },
] as const;

export function stageAt(life: number): string {
  let name: string = STAGES[0].label;
  for (const stage of STAGES) if (life >= stage.at) name = stage.label;
  return name;
}
