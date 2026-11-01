import type { SavedFlower } from "@/stores/flowerStore";
import { familyLabel } from "@/components/flower/paletteUi";

export interface FamilyCount {
  /** Raw family/flowerType key as returned by the SHARED familyLabel(). */
  family: string;
  count: number;
}

/**
 * Count flowers per family (SHARED familyLabel: v2 family, v1 flowerType
 * fallback — do not reimplement), sorted by count desc then family asc for a
 * stable bar order.
 */
export function familyDistribution(savedFlowers: SavedFlower[]): FamilyCount[] {
  const counts = new Map<string, number>();
  for (const flower of savedFlowers) {
    const family = familyLabel(flower.params);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

/**
 * Newest `n` flowers by createdAt ("YYYY-MM-DD" — lexicographic == chronological).
 * Non-mutating; Array.prototype.sort is stable, so same-day flowers keep store order.
 */
export function recentFlowers(savedFlowers: SavedFlower[], n = 4): SavedFlower[] {
  return [...savedFlowers]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}
