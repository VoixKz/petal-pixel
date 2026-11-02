// On-demand render registry for the flower canvas.
//
// BloomView registers a render function while mounted; consumers (Download PNG
// button, mint flow, GIF export) call renderToBlob()/captureFlowerPng() without
// needing a ref to the WebGL canvas. The registered renderer poses the plant for a
// picture and puts everything back in the same task, so nothing shows on screen.

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

/** Options for one picture. */
export type RenderOpts = {
  /** Square edge in px. Defaults to 1024. */
  size?: number;
  /** `'dark'` draws it at night, lit from inside; anything else by day. */
  background?: 'dark' | 'studio';
  /** Which way the plant faces, in radians. */
  frameYaw?: number;
  /** Writes the flower's name on the picture, for one that will travel on its own. */
  caption?: boolean;
};

/** A dedicated off-screen renderer. Resolves null on any failure; never throws. */
export type Renderer = (opts?: RenderOpts) => Promise<Blob | null>;

// Stack of live renderers rather than a single slot: a view that mounts over another
// pushes its own and, on unmount, removes only its own entry. Capture always uses the
// most-recently-registered renderer still present.
const registered: Renderer[] = [];

export function registerRenderer(fn: Renderer): () => void {
  registered.push(fn);
  return () => {
    // Remove THIS registration by identity. A stale/duplicate unregister is a
    // no-op (indexOf === -1), and removing one entry never disturbs the others —
    // so unmounting a transient canvas leaves an earlier canvas still capturable.
    const i = registered.indexOf(fn);
    if (i !== -1) registered.splice(i, 1);
  };
}

/** How long a picture waits for the flower itself before it is taken without it. */
const FLOWER_PATIENCE_MS = 6000;

/** Something a picture has to wait for, though never for ever. */
export function arrival(patience = FLOWER_PATIENCE_MS) {
  let landed = () => {};
  const here = new Promise<void>((resolve) => {
    landed = resolve;
  });
  return {
    landed: () => landed(),
    wait: () => Promise.race([here, new Promise<void>((resolve) => setTimeout(resolve, patience))]),
  };
}

/**
 * Public capture wrapper. Runs the most-recently-registered live render pass with
 * `opts`. NEVER throws: resolves null when the stack is empty or the pass fails.
 */
export async function renderToBlob(opts?: RenderOpts): Promise<Blob | null> {
  const current = registered[registered.length - 1];
  if (!current) return null;
  try {
    return await current(opts);
  } catch {
    return null;
  }
}

/**
 * Frozen preset used by the Download PNG button and the mint flow (both call it
 * with no args): by day, 1024px square, facing front, so a flower's picture comes
 * out the same every time. Never throws; resolves null when unregistered or on any error.
 */
export function captureFlowerPng(opts: { caption?: boolean } = {}): Promise<Blob | null> {
  return renderToBlob({ size: 1024, background: 'studio', frameYaw: 0, ...opts });
}

/** Evenly-spaced yaws over [0, 2π); excludes the 2π endpoint for a seamless loop. */
export function frameYaws(frames: number): number[] {
  if (frames <= 0) return [];
  const step = (Math.PI * 2) / frames;
  return Array.from({ length: frames }, (_, i) => i * step);
}

/** One slow turn of the flower in a GIF. */
const TURN_MS = 4000;

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Decode a PNG (or any image) Blob to RGBA ImageData at size×size, drawing onto a
 * reused offscreen 2D canvas. Resolves null when the 2D context is unavailable.
 */
async function blobToImageData(
  blob: Blob,
  size: number,
  canvas: HTMLCanvasElement,
): Promise<ImageData | null> {
  const bitmap = await createImageBitmap(blob);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close?.();
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Render a spinning animated GIF of the flower. For each of `frames` evenly-spaced
 * yaws, runs the PUBLIC {@link renderToBlob} dedicated capture pass (never reads the
 * live framebuffer), decodes the PNG blob to RGBA via createImageBitmap onto a reused
 * offscreen canvas, quantizes a 256-color palette per frame, and encodes with gifenc.
 * Yields to the event loop between frames so the UI stays responsive.
 *
 * NEVER throws. Resolves null when no renderer is registered, any frame fails to
 * render/decode, or encoding errors.
 *
 * @param opts.frames  number of frames over one full rotation (default 36)
 * @param opts.size    square edge in px of each frame (default 512)
 * @param opts.background  forwarded to renderToBlob (default 'dark')
 */
export async function captureFlowerGif(
  opts: { frames?: number; size?: number; background?: RenderOpts['background']; caption?: boolean } = {},
): Promise<Blob | null> {
  const frames = opts.frames ?? 36;
  const size = opts.size ?? 512;
  const background = opts.background ?? 'dark';
  const yaws = frameYaws(frames);
  if (yaws.length === 0) return null;
  try {
    const gif = GIFEncoder();
    const canvas = document.createElement('canvas');
    const delay = TURN_MS / frames;
    for (const frameYaw of yaws) {
      const blob = await renderToBlob({ frameYaw, size, background, caption: opts.caption });
      if (!blob) return null; // no renderer registered, or the pass failed
      const data = await blobToImageData(blob, size, canvas);
      if (!data) return null;
      const palette = quantize(data.data, 256);
      const indexed = applyPalette(data.data, palette);
      gif.writeFrame(indexed, size, size, { palette, delay });
      await yieldToMain(); // keep the main thread responsive between frames
    }
    gif.finish();
    return new Blob([gif.bytesView()], { type: 'image/gif' });
  } catch {
    return null;
  }
}
