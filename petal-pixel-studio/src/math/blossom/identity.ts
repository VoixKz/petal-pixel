// Who a flower is, from its name alone. Every page asks here, so a name can never be
// called a dahlia in one place and something else in another.
import { colourFor, speciesFor } from "./build";
import { cleanName, seedOf } from "./name";
import type { Colour, Species } from "./species";

export interface FlowerIdentity {
  seed: string;
  species: Species;
  colour: Colour;
  /** "dahlia": what the flower is called in a sentence. */
  kind: string;
}

const known = new Map<string, FlowerIdentity>();

export function identityOf(name: string): FlowerIdentity {
  const key = cleanName(name);
  const found = known.get(key);
  if (found) return found;
  const seed = seedOf(key);
  const species = speciesFor(seed);
  const identity = { seed, species, colour: colourFor(seed, species), kind: species.label.toLowerCase() };
  known.set(key, identity);
  return identity;
}

export const kindOf = (name: string) => identityOf(name).kind;

/** The flower's own colours as a CSS background, for small strips and swatches. */
export function tintOf(name: string): string {
  const [base, mid, tip] = identityOf(name).colour;
  return `linear-gradient(90deg, ${base}, ${mid}, ${tip})`;
}
