export type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';

/**
 * Defect #11: the regenerate warning must fire not only when the generation
 * word changed, but also when the user made manual parameter (slider) tweaks
 * while the word stayed the same — otherwise Generate silently discards them.
 *
 * Cluster B1 extension: the warning must ALSO fire in CREATE mode once a flower
 * has been generated (`flowerId` set) but not yet saved (`flowerId` absent from
 * `savedIds`) — regenerating would otherwise silently discard unsaved work. The
 * two trailing args are OPTIONAL (default `""` / `[]`) so the existing 4-arg
 * caller keeps compiling and behaving identically (create mode → false) until
 * the create page wires them. Delegates to the tested `hasUnsavedWork`.
 */
export function shouldWarnRegenerate(
  isEditMode: boolean,
  word: string,
  generationWord: string,
  paramsDirty: boolean,
  flowerId: string = "",
  savedIds: ReadonlySet<string> | readonly string[] = [],
): boolean {
  return hasUnsavedWork(isEditMode, paramsDirty, word !== generationWord, flowerId, savedIds);
}

/** Defect #13: used to disable the Backend button and short-circuit re-entry. */
export function isCheckingBackend(status: HealthStatus): boolean {
  return status === 'checking';
}

/**
 * Cluster B1: create-mode unsaved-work detector.
 *
 * In edit mode, "dirty" already means "differs from the saved snapshot"
 * (word/title/params changed) — that's the existing hasUnsavedChanges logic
 * in CreateFlower.tsx. In CREATE mode there is no snapshot to diff against:
 * the moment a flower has been generated (params.flowerId is set) and it
 * has not yet been saved (its id isn't in savedFlowers), it is unsaved work
 * that navigation/reload/clearEditMode must not silently destroy.
 *
 * `wordChanged`/`paramsDirty` are accepted for symmetry with the edit-mode
 * predicate but are intentionally NOT part of the create-mode condition:
 * generating a flower already sets params.flowerId, and any slider tweak
 * after that keeps the same (unsaved) flowerId, so the id-not-in-savedFlowers
 * check alone captures "work exists that would be lost."
 */
export function hasUnsavedWork(
  isEditMode: boolean,
  paramsDirty: boolean,
  wordChanged: boolean,
  flowerId: string,
  savedIds: ReadonlySet<string> | readonly string[],
): boolean {
  if (isEditMode) {
    return paramsDirty || wordChanged;
  }
  if (!flowerId) return false;
  const ids = savedIds instanceof Set ? savedIds : new Set(savedIds);
  return !ids.has(flowerId);
}
