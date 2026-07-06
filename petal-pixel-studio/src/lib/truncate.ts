/**
 * Truncate the middle of a long identifier (tx hash, address) keeping
 * `keep` characters on each side, joined by a single "…" (U+2026).
 * Strings already short enough (or non-positive `keep`) pass through unchanged.
 */
export function truncateMiddle(str: string, keep = 6): string {
  if (keep <= 0 || str.length <= keep * 2 + 1) return str;
  return `${str.slice(0, keep)}…${str.slice(-keep)}`;
}
