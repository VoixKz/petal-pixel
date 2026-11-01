import { describe, it, expect } from 'vitest';
import {
  registerRenderer,
  captureFlowerPng,
  renderToBlob,
  frameYaws,
} from './snapshot';

describe('renderer registry', () => {
  it('resolves null when no renderer is registered', async () => {
    await expect(renderToBlob()).resolves.toBeNull();
  });

  it('passes opts through to the registered renderer', async () => {
    const seen: unknown[] = [];
    const blob = new Blob(['x'], { type: 'image/png' });
    const off = registerRenderer(async (opts) => {
      seen.push(opts);
      return blob;
    });
    await expect(renderToBlob({ size: 1024, background: 'studio' })).resolves.toBe(blob);
    expect(seen[0]).toEqual({ size: 1024, background: 'studio' });
    off();
  });

  it('captureFlowerPng requests the studio 1024 preset', async () => {
    const seen: unknown[] = [];
    const off = registerRenderer(async (opts) => {
      seen.push(opts);
      return new Blob();
    });
    await captureFlowerPng();
    expect(seen[0]).toEqual({ size: 1024, background: 'studio', frameYaw: 0 });
    off();
  });

  it('resolves null again after unregister', async () => {
    const off = registerRenderer(async () => new Blob());
    off();
    await expect(renderToBlob()).resolves.toBeNull();
  });

  it('a stale unregister does not clobber a newer registration', async () => {
    const stale = registerRenderer(async () => null);
    const blob = new Blob(['newer'], { type: 'image/png' });
    const newer = registerRenderer(async () => blob);
    stale(); // must be a no-op: it is not the current renderer
    await expect(renderToBlob()).resolves.toBe(blob);
    newer();
  });

  it('unregistering a transient second canvas keeps the first capturable', async () => {
    // Simulates the create-page main canvas (A) still mounted while the mint
    // dialog's SharePreview canvas (B) mounts and then closes. Before the stack
    // fix this nulled the single slot and broke every subsequent capture.
    const blobA = new Blob(['A'], { type: 'image/png' });
    const offA = registerRenderer(async () => blobA);
    const offB = registerRenderer(async () => new Blob(['B'], { type: 'image/png' }));
    offB(); // dialog closes; A is still mounted and never re-registers
    await expect(renderToBlob()).resolves.toBe(blobA);
    offA();
  });

  it('out-of-order unregister of the first leaves the second active', async () => {
    const offA = registerRenderer(async () => new Blob(['A'], { type: 'image/png' }));
    const blobB = new Blob(['B'], { type: 'image/png' });
    const offB = registerRenderer(async () => blobB);
    offA(); // remove the earlier entry out of order
    await expect(renderToBlob()).resolves.toBe(blobB);
    offB();
  });

  it('returns null once the whole stack has been unregistered', async () => {
    const offA = registerRenderer(async () => new Blob(['A'], { type: 'image/png' }));
    const offB = registerRenderer(async () => new Blob(['B'], { type: 'image/png' }));
    offB();
    offA();
    await expect(renderToBlob()).resolves.toBeNull();
  });

  it('an already-removed unregister called twice is a harmless no-op', async () => {
    const blobA = new Blob(['A'], { type: 'image/png' });
    const offA = registerRenderer(async () => blobA);
    const offB = registerRenderer(async () => new Blob(['B'], { type: 'image/png' }));
    offB();
    offB(); // second call must not remove A's entry
    await expect(renderToBlob()).resolves.toBe(blobA);
    offA();
  });

  it('resolves null instead of rejecting when the renderer throws', async () => {
    const off = registerRenderer(async () => {
      throw new Error('WebGL context lost');
    });
    await expect(renderToBlob()).resolves.toBeNull();
    await expect(captureFlowerPng()).resolves.toBeNull();
    off();
  });
});

describe('frameYaws', () => {
  it('returns `frames` evenly spaced yaws starting at 0', () => {
    const ys = frameYaws(4);
    expect(ys).toHaveLength(4);
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeCloseTo(Math.PI / 2, 10);
    expect(ys[2]).toBeCloseTo(Math.PI, 10);
    expect(ys[3]).toBeCloseTo((3 * Math.PI) / 2, 10);
  });

  it('excludes the 2π endpoint so the loop is seamless', () => {
    expect(frameYaws(36).some((y) => y >= 2 * Math.PI)).toBe(false);
  });

  it('is strictly increasing', () => {
    const ys = frameYaws(12);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it('returns an empty array for non-positive frame counts', () => {
    expect(frameYaws(0)).toEqual([]);
    expect(frameYaws(-5)).toEqual([]);
  });
});
