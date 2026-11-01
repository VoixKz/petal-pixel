import type { SavedFlower } from "@/stores/flowerStore";
import type { FlowerFamily, FlowerType } from "@/math/flowerTypes";
import type { Palette } from "@/math/palette";

export interface CreatedEvent {
  kind: "created";
  flowerId: string;
  title: string;
  /** YYYY-MM-DD (SavedFlower.createdAt) */
  date: string;
  /** v2 flowers only; undefined on v1 records — UI falls back to flowerType. */
  family?: FlowerFamily;
  flowerType: FlowerType;
  palette?: Palette;
}

export interface MintedEvent {
  kind: "minted";
  flowerId: string;
  title: string;
  /** Grouped under the flower's createdAt day — no separate mint timestamp exists. */
  date: string;
  txHash?: string;
}

export type ActivityEvent = CreatedEvent | MintedEvent;

export interface ActivityDay {
  date: string;
  events: ActivityEvent[];
}

/**
 * Builds a reverse-chronological timeline from savedFlowers only (no backend).
 * Days sort descending by ISO date string. Within a day, the most recently
 * saved flower appears first; a minted flower's "minted" event precedes its
 * "created" event because minting always happens after creation.
 */
export function buildActivityTimeline(savedFlowers: SavedFlower[]): ActivityDay[] {
  const byDate = new Map<string, ActivityEvent[]>();

  for (let i = savedFlowers.length - 1; i >= 0; i--) {
    const f = savedFlowers[i];
    if (!f.createdAt) continue;

    let bucket = byDate.get(f.createdAt);
    if (!bucket) {
      bucket = [];
      byDate.set(f.createdAt, bucket);
    }

    if (f.isMinted) {
      bucket.push({
        kind: "minted",
        flowerId: f.id,
        title: f.title,
        date: f.createdAt,
        txHash: f.txHash,
      });
    }

    bucket.push({
      kind: "created",
      flowerId: f.id,
      title: f.title,
      date: f.createdAt,
      family: f.params?.family,
      flowerType: f.params?.flowerType ?? "classic",
      palette: f.params?.palette,
    });
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, events]) => ({ date, events }));
}
