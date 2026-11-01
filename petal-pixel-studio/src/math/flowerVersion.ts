/**
 * Conjunctive v2 guard: a record renders via the v2 path only when the backend
 * bumped algoVersion to "v2" AND supplied a family selector. v1 records (and any
 * partial/legacy record missing family) fall through to the untouched v1 path.
 *
 * NOTE: `FlowerParams` in flowerStore does not yet carry `family`; this module
 * uses an inline structural type so it compiles until the store task lands.
 * Once `family?: FlowerFamily` is added to FlowerParams the Pick<> form is valid.
 */
export function isV2(p: { algoVersion: string; family?: string | null }): boolean {
  // `!!p.family` also rejects an empty-string family, so a malformed backend
  // response can never misroute a record onto the v2 render path.
  return p.algoVersion === "v2" && !!p.family;
}
