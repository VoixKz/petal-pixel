import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  getPrefs,
  getPref,
  setPref,
} from "./userPrefs";

describe("userPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getPrefs() on empty storage deep-equals DEFAULT_PREFS", () => {
    expect(getPrefs()).toEqual(DEFAULT_PREFS);
    // Defaults are honest: nothing is wired to a backend, so everything is off.
    expect(DEFAULT_PREFS).toEqual({
      emailNotifications: false,
      mintActivityAlerts: false,
      reducedMotionPref: false,
    });
  });

  it("setPref persists and getPref reads it back, returning the full merged snapshot", () => {
    const snapshot = setPref("emailNotifications", true);
    expect(snapshot).toEqual({
      emailNotifications: true,
      mintActivityAlerts: false,
      reducedMotionPref: false,
    });
    expect(getPref("emailNotifications")).toBe(true);
    expect(getPref("mintActivityAlerts")).toBe(false);
  });

  it("setPref writes JSON under PREFS_STORAGE_KEY", () => {
    setPref("emailNotifications", true);
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).emailNotifications).toBe(true);
  });

  it("returns DEFAULT_PREFS when the stored value is corrupt JSON (never throws)", () => {
    localStorage.setItem(PREFS_STORAGE_KEY, "{ not json");
    expect(() => getPrefs()).not.toThrow();
    expect(getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("merges a partial stored value over defaults so a new key never reads undefined", () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ mintActivityAlerts: true }),
    );
    expect(getPrefs()).toEqual({
      emailNotifications: false,
      mintActivityAlerts: true,
      reducedMotionPref: false,
    });
  });

  it("getPref for an unknown-shaped store returns the default for that key", () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ somethingElse: "yes" }),
    );
    expect(getPref("emailNotifications")).toBe(false);
    expect(getPref("mintActivityAlerts")).toBe(false);
    expect(getPref("reducedMotionPref")).toBe(false);
  });

  it("ignores non-boolean stored values for known keys (guards a checkbox from a truthy string)", () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ emailNotifications: "true" }),
    );
    // A raw "true" string is not a boolean — fall back to the default rather
    // than coercing a non-boolean into a switch's checked state.
    expect(getPref("emailNotifications")).toBe(false);
  });

  it("setPref preserves other keys already stored", () => {
    setPref("emailNotifications", true);
    setPref("mintActivityAlerts", true);
    expect(getPrefs()).toEqual({
      emailNotifications: true,
      mintActivityAlerts: true,
      reducedMotionPref: false,
    });
  });
});
