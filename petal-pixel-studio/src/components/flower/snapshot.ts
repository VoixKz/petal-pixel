// On-demand snapshot registry for the flower canvas.
//
// FlowerCanvas registers a capture function while mounted; consumers
// (Download PNG button, mint flow) call captureFlowerPng() without needing
// a ref to the WebGL canvas. preserveDrawingBuffer stays OFF globally: the
// registered snapshotter re-renders the scene and reads the canvas pixels
// in the same synchronous task, so the framebuffer is still valid.

export type Snapshotter = () => Promise<Blob | null>;

let current: Snapshotter | null = null;

export function registerSnapshotter(fn: Snapshotter): () => void {
  current = fn;
  return () => {
    // Only clear if we are still the active snapshotter; a stale unmount
    // must not clobber a newer canvas's registration (StrictMode remounts).
    if (current === fn) current = null;
  };
}

export async function captureFlowerPng(): Promise<Blob | null> {
  if (!current) return null;
  try {
    return await current();
  } catch {
    return null;
  }
}

export const SNAPSHOT_MAX_EDGE = 512;

/** Fit width x height inside a max-by-max box, preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Draw `source` into a 2D canvas capped at maxEdge px on the long edge and
 * encode as PNG. drawImage runs synchronously before the returned promise
 * is created, so callers that gl.render() immediately before calling this
 * read a valid WebGL framebuffer even without preserveDrawingBuffer.
 */
export function downscaleToPng(
  source: HTMLCanvasElement,
  maxEdge: number = SNAPSHOT_MAX_EDGE,
): Promise<Blob | null> {
  const { width, height } = fitWithin(source.width, source.height, maxEdge);
  if (width === 0 || height === 0) return Promise.resolve(null);
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => target.toBlob(resolve, 'image/png'));
}
