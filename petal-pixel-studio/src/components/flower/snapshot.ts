// On-demand render registry for the flower canvas.
//
// FlowerCanvas registers a dedicated render function while mounted; consumers
// (Download PNG button, mint flow, GIF export) call renderToBlob()/captureFlowerPng()
// without needing a ref to the WebGL canvas. The registered renderer performs a
// dedicated OFF-SCREEN pass (bright / centered / HD) — it does NOT read the live
// on-screen framebuffer — then restores all mutated on-screen state afterwards.
// preserveDrawingBuffer stays OFF globally: the pass renders into its own
// WebGLRenderTarget in the same synchronous task, so the readback is valid.

/** Options for a dedicated off-screen capture pass. */
export type RenderOpts = {
  /** Square edge in px of the off-screen render target. Defaults to 1024. */
  size?: number;
  /**
   * Background treatment for the capture:
   * - `'transparent'` → alpha PNG (no background)
   * - `'dark'`        → the on-screen `#08080f`
   * - `'studio'`      → a lifted branded neutral so the flower reads bright
   * - any other string → a solid CSS color
   */
  background?: 'transparent' | 'dark' | 'studio' | string;
  /** Temporary world yaw (radians) for the flower group during this one frame. */
  frameYaw?: number;
};

/** A dedicated off-screen renderer. Resolves null on any failure; never throws. */
export type Renderer = (opts?: RenderOpts) => Promise<Blob | null>;

let current: Renderer | null = null;

export function registerRenderer(fn: Renderer): () => void {
  current = fn;
  return () => {
    // Only clear if we are still the active renderer; a stale unmount must not
    // clobber a newer canvas's registration (StrictMode remounts).
    if (current === fn) current = null;
  };
}

/**
 * Public capture wrapper. Runs the registered dedicated render pass with `opts`.
 * NEVER throws: resolves null when no renderer is registered or the pass fails.
 */
export async function renderToBlob(opts?: RenderOpts): Promise<Blob | null> {
  if (!current) return null;
  try {
    return await current(opts);
  } catch {
    return null;
  }
}

/**
 * Frozen preset used by the Download PNG button and the mint flow (both call it
 * with no args). Studio background, 1024px square. Never throws; resolves null
 * when unregistered or on any error.
 */
export function captureFlowerPng(): Promise<Blob | null> {
  return renderToBlob({ size: 1024, background: 'studio' });
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

/** Plain 3-vector so the framing math needs no three import (unit-testable). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Result of {@link frameCameraForBounds}: where to place/aim the capture camera. */
export interface CameraFraming {
  position: Vec3Like;
  target: Vec3Like;
  distance: number;
}

/**
 * Pure camera-framing math for the dedicated capture pass. Places the camera on
 * a fixed 3/4 vector so a bounding sphere of `radius` centered at `center` fits
 * the vertical FOV (or horizontal FOV when the aspect is narrower) with `margin`
 * headroom. Independent of the live OrbitControls camera — this is the
 * load-bearing centering math for the export.
 *
 * @param center  bounding-sphere center in world space
 * @param radius  bounding-sphere radius (guarded against degenerate 0)
 * @param fovDeg  vertical field of view in degrees
 * @param aspect  render-target aspect (width / height); 1 for a square export
 * @param margin  multiplier > 1 leaves breathing room around the flower
 */
export function frameCameraForBounds(
  center: Vec3Like,
  radius: number,
  fovDeg: number,
  aspect: number,
  margin: number,
): CameraFraming {
  const r = Math.max(radius, 0.001);
  const vh = ((fovDeg * Math.PI) / 180) / 2; // vertical half-FOV
  const hh = Math.atan(Math.tan(vh) * Math.max(aspect, 0.001)); // horizontal half-FOV
  // Use the tighter axis so a square/portrait render never crops.
  const halfFov = Math.min(vh, hh);
  const distance = (r / Math.sin(halfFov)) * margin;

  // Fixed 3/4 view direction (mirrors the on-screen AutoFrameCamera feel).
  const dir = { x: 0.5, y: 0.35, z: 0.8 };
  return {
    position: {
      x: center.x + distance * dir.x,
      y: center.y + distance * dir.y,
      z: center.z + distance * dir.z,
    },
    target: { x: center.x, y: center.y, z: center.z },
    distance,
  };
}
