import { describe, it, expect } from 'vitest';
import {
  registerRenderer,
  captureFlowerPng,
  renderToBlob,
  fitWithin,
  frameCameraForBounds,
  frameYaws,
} from './snapshot';

describe('fitWithin', () => {
  it('leaves dimensions already within max untouched', () => {
    expect(fitWithin(400, 300, 512)).toEqual({ width: 400, height: 300 });
  });

  it('downscales the long edge to max, preserving aspect ratio', () => {
    expect(fitWithin(2048, 1024, 512)).toEqual({ width: 512, height: 256 });
  });

  it('downscales portrait canvases by height', () => {
    expect(fitWithin(600, 1200, 512)).toEqual({ width: 256, height: 512 });
  });

  it('never rounds a non-zero edge down to zero', () => {
    expect(fitWithin(1, 10000, 512)).toEqual({ width: 1, height: 512 });
  });

  it('returns zero size for degenerate input', () => {
    expect(fitWithin(0, 300, 512)).toEqual({ width: 0, height: 0 });
  });
});

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

describe('frameCameraForBounds', () => {
  const b = { center: { x: 0, y: -0.4, z: 0 }, radius: 1 } as const;

  it('places the camera so the bounding sphere fits the vertical FOV with margin', () => {
    const r = frameCameraForBounds(b.center, b.radius, 45, 1 /* aspect */, 1.35);
    // distance = radius / sin(fov/2) * margin for a sphere at aspect 1.
    const expected = (1 / Math.sin((45 * Math.PI) / 180 / 2)) * 1.35;
    expect(r.distance).toBeCloseTo(expected, 5);
    expect(r.position.x).toBeCloseTo(b.center.x + expected * 0.5, 5);
    expect(r.target).toEqual(b.center);
  });

  it('widens distance when aspect < 1 so nothing is cropped horizontally', () => {
    const wide = frameCameraForBounds(b.center, b.radius, 45, 1, 1.35).distance;
    const narrow = frameCameraForBounds(b.center, b.radius, 45, 0.5, 1.35).distance;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('never returns a non-finite or zero distance for a degenerate radius', () => {
    const r = frameCameraForBounds(b.center, 0, 45, 1, 1.35);
    expect(Number.isFinite(r.distance)).toBe(true);
    expect(r.distance).toBeGreaterThan(0);
  });
});
