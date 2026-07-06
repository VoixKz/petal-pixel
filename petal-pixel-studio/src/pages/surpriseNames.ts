/**
 * Curated seed names for the "Surprise me" dice on CreateFlower.
 * Contract: every entry is pre-sanitized for the word input — trimmed,
 * single internal spaces, <= 64 chars — because the dice path calls
 * setWordInput() directly, bypassing handleWordInputChange's sanitizer.
 */
export const SURPRISE_NAMES: readonly string[] = [
  // Human names — Latin
  "Amelie",
  "Sofia",
  "Marcus",
  "Yuki",
  "Leilani",
  "Ravi",
  "Ingrid",
  "Mateo",
  "Zara",
  "Kenji",
  // Human names — Cyrillic
  "Аружан",
  "Айгерім",
  "Данияр",
  "Светлана",
  "Тимур",
  "Алия",
  "Мирослава",
  "Ержан",
  "Катя",
  "Богдан",
  // Evocative phrases
  "midnight aurora",
  "ember and frost",
  "quiet supernova",
  "salt of the cosmos",
  "velvet thunder",
  "paper lantern moon",
  "glass garden",
  "the last summer rain",
  "neon chrysalis",
  "wandering comet",
  "honey and iron",
  "tidal bloom",
  "borealis whisper",
  "saffron dusk",
  "electric marigold",
  "fossil light",
  "cinder song",
  "opaline drift",
  "gravity's lullaby",
  "winter peony",
] as const;

/** Pick a random entry. `random` is injectable for deterministic tests. */
export function pickSurpriseName(random: () => number = Math.random): string {
  const index = Math.min(
    SURPRISE_NAMES.length - 1,
    Math.floor(random() * SURPRISE_NAMES.length),
  );
  return SURPRISE_NAMES[index];
}
