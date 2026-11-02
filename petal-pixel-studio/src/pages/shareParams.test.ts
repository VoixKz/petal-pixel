import { describe, it, expect } from 'vitest';
import { buildShareUrl } from '@/integrations/flowerBackend/client';

describe('buildShareUrl', () => {
  it('joins the backend base URL with /share/<id>', () => {
    expect(buildShareUrl('https://petal.app', 'abc123')).toBe('https://petal.app/share/abc123');
  });

  it('collapses a trailing slash on the base URL (no double slash)', () => {
    expect(buildShareUrl('https://petal.app/', 'abc')).toBe('https://petal.app/share/abc');
  });

  it('collapses multiple trailing slashes', () => {
    expect(buildShareUrl('https://petal.app///', 'abc')).toBe('https://petal.app/share/abc');
  });

  it('encodeURIComponent-encodes ids with special characters', () => {
    expect(buildShareUrl('https://petal.app', 'a/b?c')).toBe('https://petal.app/share/a%2Fb%3Fc');
  });

  it('works with the default localhost backend base', () => {
    expect(buildShareUrl('http://localhost:50051', 'flw_0011223344556677')).toBe(
      'http://localhost:50051/share/flw_0011223344556677',
    );
  });
});
