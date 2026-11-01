import { describe, it, expect } from 'vitest';
import { flowerImageUrl, flowerImageBaseUrl } from './flowerImage';

describe('flowerImageUrl', () => {
  it('builds the public preview key previews/<id>.png', () => {
    expect(flowerImageUrl('flw_abc', 'http://localhost:9000/flower')).toBe(
      'http://localhost:9000/flower/previews/flw_abc.png',
    );
  });

  it('collapses a trailing slash in the base (mirrors buildShareUrl)', () => {
    expect(flowerImageUrl('flw_abc', 'http://localhost:9000/flower/')).toBe(
      'http://localhost:9000/flower/previews/flw_abc.png',
    );
  });

  it('encodeURIComponent-escapes the id', () => {
    expect(flowerImageUrl('a/b c', 'http://x')).toBe('http://x/previews/a%2Fb%20c.png');
  });

  it('defaults to flowerImageBaseUrl when no base is passed', () => {
    expect(flowerImageUrl('z')).toBe(`${flowerImageBaseUrl}/previews/z.png`);
  });
});
