import { describe, it, expect } from 'vitest';
import { registerSnapshotter, captureFlowerPng, fitWithin } from './snapshot';

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

describe('snapshot registry', () => {
  it('resolves null when no snapshotter is registered', async () => {
    await expect(captureFlowerPng()).resolves.toBeNull();
  });

  it('delegates to the registered snapshotter', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const unregister = registerSnapshotter(async () => blob);
    await expect(captureFlowerPng()).resolves.toBe(blob);
    unregister();
  });

  it('resolves null again after unregister', async () => {
    const unregister = registerSnapshotter(async () => new Blob());
    unregister();
    await expect(captureFlowerPng()).resolves.toBeNull();
  });

  it('a stale unregister does not clobber a newer registration', async () => {
    const staleUnregister = registerSnapshotter(async () => null);
    const blob = new Blob(['newer'], { type: 'image/png' });
    const newerUnregister = registerSnapshotter(async () => blob);
    staleUnregister(); // must be a no-op: it is not the current snapshotter
    await expect(captureFlowerPng()).resolves.toBe(blob);
    newerUnregister();
  });

  it('resolves null instead of rejecting when the snapshotter throws', async () => {
    const unregister = registerSnapshotter(async () => {
      throw new Error('WebGL context lost');
    });
    await expect(captureFlowerPng()).resolves.toBeNull();
    unregister();
  });
});
