export type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';

/**
 * Defect #11: the regenerate warning must fire not only when the generation
 * word changed, but also when the user made manual parameter (slider) tweaks
 * while the word stayed the same — otherwise Generate silently discards them.
 */
export function shouldWarnRegenerate(
  isEditMode: boolean,
  word: string,
  generationWord: string,
  paramsDirty: boolean,
): boolean {
  return isEditMode && (paramsDirty || word !== generationWord);
}

/** Defect #13: used to disable the Backend button and short-circuit re-entry. */
export function isCheckingBackend(status: HealthStatus): boolean {
  return status === 'checking';
}
