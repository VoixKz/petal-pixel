// Pure persisted user-preferences module — the single source of truth for
// device-local toggles surfaced on the Settings page. Every function is
// try/catch-guarded so a throwing or absent localStorage (SSR, private mode,
// corrupt data) degrades gracefully to DEFAULT_PREFS and never throws.
//
// Defaults are deliberately all `false`: nothing here is wired to a backend
// yet, so the honest starting state is "off". The Settings UI labels each
// toggle for what it actually does (remembers a preference on this device).

export type UserPrefKey =
  | "emailNotifications"
  | "mintActivityAlerts"
  | "reducedMotionPref";

export type UserPrefs = Record<UserPrefKey, boolean>;

export const PREFS_STORAGE_KEY = "petal-user-prefs";

export const DEFAULT_PREFS: UserPrefs = {
  emailNotifications: false,
  mintActivityAlerts: false,
  reducedMotionPref: false,
};

// The known keys, used to filter arbitrary stored JSON down to our shape.
const PREF_KEYS = Object.keys(DEFAULT_PREFS) as UserPrefKey[];

/**
 * Safe read: merges any stored booleans over DEFAULT_PREFS. Tolerates a
 * missing key, corrupt JSON, a non-object payload, and non-boolean values for
 * known keys (those fall back to the default so a switch never renders from an
 * `undefined`/truthy-string value). Never throws.
 */
export function getPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    const source = parsed as Record<string, unknown>;
    const merged: UserPrefs = { ...DEFAULT_PREFS };
    for (const key of PREF_KEYS) {
      const value = source[key];
      if (typeof value === "boolean") merged[key] = value;
    }
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Read a single preference, falling back to its default. */
export function getPref(key: UserPrefKey): boolean {
  return getPrefs()[key];
}

/**
 * Write one preference and persist the merged object. Returns the new snapshot
 * so callers can keep React state in lockstep with storage. Swallows write
 * errors (quota, private mode) — the return value is still correct in-memory.
 */
export function setPref(key: UserPrefKey, value: boolean): UserPrefs {
  const next: UserPrefs = { ...getPrefs(), [key]: value };
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best-effort persistence; the returned snapshot is authoritative */
  }
  return next;
}
