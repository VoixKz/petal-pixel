import { describe, it, expect } from 'vitest';
import { buildTweetUrl, buildTelegramUrl, shareCardText, shareCardFilename } from './shareCard';

describe('buildTweetUrl', () => {
  it('encodes text then url as intent query params', () => {
    expect(buildTweetUrl('https://petal.app/share/abc', 'My flower "Ada" 🌸')).toBe(
      'https://twitter.com/intent/tweet?text=My%20flower%20%22Ada%22%20%F0%9F%8C%B8&url=https%3A%2F%2Fpetal.app%2Fshare%2Fabc',
    );
  });
});

describe('buildTelegramUrl', () => {
  it('encodes url then text for the t.me share intent', () => {
    expect(buildTelegramUrl('https://petal.app/share/abc', 'Bloomed for Ada')).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Fpetal.app%2Fshare%2Fabc&text=Bloomed%20for%20Ada',
    );
  });
});

describe('shareCardText', () => {
  it('names the person', () => {
    expect(shareCardText('Ada')).toContain('Ada');
  });
  it('falls back when empty', () => {
    expect(shareCardText('').length).toBeGreaterThan(0);
  });
});

describe('shareCardFilename', () => {
  it('sanitizes path-hostile characters and appends the brand suffix', () => {
    expect(shareCardFilename('a/b:c')).toBe('a_b_c-petal-pixel.png');
  });
  it('falls back to "flower" when the name is blank', () => {
    expect(shareCardFilename('   ')).toBe('flower-petal-pixel.png');
  });
});
