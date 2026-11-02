import { SPECIES, type Species } from "@/math/blossom/species";

/** One flower visitors can grow in the section on the home page. */
export interface Grower {
  id: string;
  label: string;
  species: Species;
}

const kind = (id: string) => SPECIES.find((s) => s.id === id) as Species;

export const GROWERS: readonly Grower[] = ["rose", "water-lily", "peony", "tiger-lily", "camellia", "hibiscus"].map((id) => ({
  id,
  label: kind(id).label,
  species: kind(id),
}));

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
