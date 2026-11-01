import { describe, it, expect } from 'vitest';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';

describe('brand constants', () => {
  it('exposes the single app name', () => {
    expect(BRAND_NAME).toBe('Petal Pixel');
  });
  it('exposes a non-empty tagline', () => {
    expect(typeof BRAND_TAGLINE).toBe('string');
    expect(BRAND_TAGLINE.length).toBeGreaterThan(0);
  });
  it('never reads as the old product name', () => {
    expect(`${BRAND_NAME} ${BRAND_TAGLINE}`).not.toMatch(/FlowerNFT/i);
  });
});
