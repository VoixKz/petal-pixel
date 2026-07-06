import { useFlowerStore } from '@/stores/flowerStore';
import { paletteGradient, familyLabel } from '@/components/flower/paletteUi';

/**
 * Small overlay chips over the 3D canvas: the flower family/type label
 * (v1 records have neither `family` nor `palette` — familyLabel falls back
 * to `flowerType`), and, when a v2 palette exists, its id with a CSS-gradient
 * swatch strip built from the SHARED paletteGradient helper.
 * pointer-events-none so OrbitControls drag/zoom is never blocked.
 */
export function FlowerBadges() {
  const params = useFlowerStore((s) => s.params);
  const palette = params.palette;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 pointer-events-none">
      <span className="glass-panel rounded-full px-2.5 py-1 text-[10px] font-mono text-foreground capitalize">
        {familyLabel(params)}
      </span>
      {palette && palette.stops.length > 0 && (
        <span className="glass-panel rounded-full pl-2.5 pr-1.5 py-1 text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
          {palette.id}
          <span
            aria-hidden
            className="inline-block w-12 h-2 rounded-full border border-border/60"
            style={{ background: paletteGradient(palette.stops) }}
          />
        </span>
      )}
    </div>
  );
}
