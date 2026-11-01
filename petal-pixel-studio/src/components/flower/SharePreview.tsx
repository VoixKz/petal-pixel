import { Sparkles, Gem } from 'lucide-react';
import { FlowerCanvas } from './FlowerCanvas';
import { previewGradient, familyLabel } from './paletteUi';
import type { FlowerParams } from '@/stores/flowerStore';

/**
 * Presentational share/preview block: a big centered flower canvas + the
 * person's name + a palette strip + a family chip + the seed, with two CTAs.
 * Pure presentation — no data fetching. Reused by the public ShareFlower landing
 * and the mint-success dialog.
 *
 * @param compact  when true (e.g. inside the mint dialog's max-w-md), the canvas
 *                 is height-capped and CTAs are omitted so it fits the modal.
 */
export function SharePreview({
  params,
  personName,
  onOpenStudio,
  onMint,
  compact = false,
}: {
  params: FlowerParams;
  personName: string;
  onOpenStudio?: () => void;
  onMint?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      <div
        className={`w-full ${
          compact ? 'aspect-square max-h-64' : 'aspect-square sm:aspect-video'
        } rounded-xl overflow-hidden border border-border bg-canvas`}
      >
        <FlowerCanvas params={params} />
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground capitalize break-words">
          {personName || 'Untitled Flower'}
        </h1>

        <div
          className="h-2 w-full rounded"
          style={{ background: previewGradient(params) }}
          title={params.palette?.id}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary capitalize">
            {familyLabel(params)}
          </span>
          <span className="text-xs text-muted-foreground font-mono">seed {params.seed}</span>
        </div>

        {!compact && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenStudio}
              className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Sparkles className="w-4 h-4" /> Open the studio
            </button>
            <button
              type="button"
              onClick={onMint}
              className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Gem className="w-4 h-4" /> Mint
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
