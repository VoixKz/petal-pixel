import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from './navItems';

describe('NAV_ITEMS', () => {
  it('keeps all 7 nav destinations in order', () => {
    expect(NAV_ITEMS.map((i) => i.path)).toEqual([
      '/', '/my-flowers', '/create', '/nfts', '/activity', '/profile', '/settings',
    ]);
  });
  it('has a non-empty label and an icon component for every item', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeDefined();
    }
  });
  it('has no duplicate paths', () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
