import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// jsdom doesn't expose localStorage without a URL being set. Provide a stub so
// Zustand's persist middleware (which grabs window.localStorage at import time)
// has a working storage object in all test files.
const _localStorageMap: Record<string, string> = {};
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => _localStorageMap[key] ?? null,
    setItem: (key: string, value: string) => { _localStorageMap[key] = value; },
    removeItem: (key: string) => { delete _localStorageMap[key]; },
    clear: () => { Object.keys(_localStorageMap).forEach(k => delete _localStorageMap[k]); },
    length: 0,
    key: (_index: number) => null,
  },
  writable: true,
});

// Isolate tests: clear persisted storage so one test's Zustand-persisted state
// cannot leak into the next (avoids order-dependent flakiness as store tests grow).
beforeEach(() => {
  window.localStorage.clear();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
