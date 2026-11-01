import { useEffect, useState, type ReactNode } from 'react';
import { identityOf } from '@/math/blossom/identity';
import { thumbnailFor } from './blossom/thumbnailCache';

export interface FlowerThumbProps {
  /** The name the flower grew from. */
  name: string;
  /** Classes for the outer band (size/position). */
  className?: string;
  /** Classes for the `<img>` itself. */
  imgClassName?: string;
  /** Rendered above the picture: hover overlays, badges and so on. */
  children?: ReactNode;
}

/** Asked once: every context a page opens stays open, and browsers allow only a few. */
let drawable: boolean | null = null;
const canDraw = () => {
  try {
    drawable ??= Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    drawable = false;
  }
  return drawable;
};

/**
 * The one thumbnail of the console. The picture is drawn on this device from the
 * name, so it needs nothing stored anywhere. Without WebGL the band stays plain.
 */
export function FlowerThumb({
  name,
  className = 'h-20 relative overflow-hidden',
  imgClassName = 'absolute inset-0 w-full h-full object-contain',
  children,
}: FlowerThumbProps) {
  const { seed } = identityOf(name);
  const [picture, setPicture] = useState(() => thumbnailFor(seed));

  useEffect(() => {
    const known = thumbnailFor(seed);
    setPicture(known);
    if (known || !canDraw()) return;
    let wanted = true;
    void import('./blossom/thumbnail')
      .then(({ drawThumbnail }) => drawThumbnail(seed))
      .then((drawn) => {
        if (wanted) setPicture(drawn);
      })
      .catch(() => undefined);
    return () => {
      wanted = false;
    };
  }, [seed]);

  return (
    <div className={`${className} bg-secondary`}>
      {picture && <img src={picture} alt="" loading="lazy" className={imgClassName} />}
      {children}
    </div>
  );
}
