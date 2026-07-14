import { describe, it, expect } from 'vitest';
import { flowerImageUrl, flowerImageBaseUrl } from './flowerImage';

describe('flowerImageUrl', () => {
  it('builds the public MinIO preview key images/<id>.png', () => {
    expect(flowerImageUrl('flw_abc', 'http://localhost:9000/flower')).toBe(
      'http://localhost:9000/flower/images/flw_abc.png',
    );
  });

  it('collapses a trailing slash in the base (mirrors buildShareUrl)', () => {
    expect(flowerImageUrl('flw_abc', 'http://localhost:9000/flower/')).toBe(
      'http://localhost:9000/flower/images/flw_abc.png',
    );
  });

  it('encodeURIComponent-escapes the id', () => {
    expect(flowerImageUrl('a/b c', 'http://x')).toBe('http://x/images/a%2Fb%20c.png');
  });

  it('defaults to flowerImageBaseUrl when no base is passed', () => {
    expect(flowerImageUrl('z')).toBe(`${flowerImageBaseUrl}/images/z.png`);
  });
});
