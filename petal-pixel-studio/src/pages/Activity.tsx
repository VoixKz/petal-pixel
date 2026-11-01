import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity as ActivityIcon, PlusCircle, Gem, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useFlowerStore } from '@/stores/flowerStore';
import { truncateMiddle } from '@/lib/truncate';
import { kindOf, tintOf } from '@/math/blossom/identity';
import { buildActivityTimeline } from './activityUtils';

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Activity() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const days = useMemo(() => buildActivityTimeline(savedFlowers), [savedFlowers]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">A timeline of your flower creations and mints</p>
      </div>

      {days.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ActivityIcon className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No activity yet. Create your first flower!</p>
        </div>
      ) : (
        <div className="space-y-8 max-w-2xl">
          {days.map((day, di) => (
            <motion.section
              key={day.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {formatDay(day.date)}
              </h2>
              <div className="space-y-2 border-l border-border pl-4">
                {day.events.map((event) => (
                  <div
                    key={`${event.kind}-${event.flowerId}`}
                    className="bg-card rounded-xl border border-border p-4 flex items-start gap-3"
                  >
                    {event.kind === 'minted' ? (
                      <Gem className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <PlusCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{event.title}</span>{' '}
                        {event.kind === 'minted' ? 'was minted as an NFT' : 'was created'}
                      </p>

                      {event.kind === 'created' && (
                        <span className="inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full capitalize">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tintOf(event.name) }} />
                          {kindOf(event.name)}
                        </span>
                      )}

                      {event.kind === 'minted' && event.txHash && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-emerald-400 font-semibold shrink-0">TX</span>
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {truncateMiddle(event.txHash, 6)}
                          </span>
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(event.txHash!);
                              toast.success('Tx hash copied');
                            }}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            title="Copy tx hash"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}
