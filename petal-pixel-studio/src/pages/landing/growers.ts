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
