import type { ReactNode } from 'react';
import type { PaletteStop } from '@/math/palette';
import { previewGradient } from '@/components/flower/paletteUi';
import { flowerImageUrl } from '@/lib/flowerImage';

/** Minimal shape previewGradient needs — structurally matches FlowerParams. */
export interface FlowerThumbParams {
  palette?: { stops: PaletteStop[] };
  colorA?: string;
  colorB?: string;
}

export interface FlowerThumbProps {
  /** Backend flower id used to build the preview PNG URL. Falsy/undefined
   *  (e.g. a flower never synced to the backend) skips the `<img>` entirely
   *  and shows only the gradient band. */
  flowerId?: string;
  /** Supplies the previewGradient fallback band (v1 colorA/colorB or v2 palette). */
  params: FlowerThumbParams;
  /** Classes for the outer band (size/position). */
  className?: string;
  /** Classes for the `<img>` itself. */
  imgClassName?: string;
  /** Override the MinIO base (tests only) — defaults to flowerImageBaseUrl. */
  base?: string;
  /** Rendered above the image inside the band: hover overlays, Minted/Favorite
   *  badges, etc. — kept generic so every card style can supply its own. */
  children?: ReactNode;
}

/**
 * Shared flower-card preview band: `previewGradient(params)` is the
 * always-present background (so a v1 flower with no uploaded PNG still shows
 * its colorA/colorB band), with the real MinIO preview PNG layered on top via
 * `flowerImageUrl`. Self-hides on load failure (missing/404 preview, backend
 * offline) via `onError` so it never shows a broken-image icon — the gradient
 * underneath just shows through.
 *
 * SOLE shared thumbnail component for the studio (dashboard + galleries) per
 * the v3 plan's binding conflict resolutions — do not fork this, import it.
 */
export function FlowerThumb({
  flowerId,
  params,
  className = 'h-20 relative overflow-hidden',
  imgClassName = 'absolute inset-0 w-full h-full object-cover',
  base,
  children,
}: FlowerThumbProps) {
  return (
    <div className={className} style={{ background: previewGradient(params) }}>
      {flowerId && (
        <img
          src={flowerImageUrl(flowerId, base)}
          alt=""
          loading="lazy"
          className={imgClassName}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      {children}
    </div>
  );
}
