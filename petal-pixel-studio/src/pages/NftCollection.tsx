import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore } from '@/stores/flowerStore';
import { Gem, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function NftCollection() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const mintedFlowers = useMemo(() => savedFlowers.filter(f => f.isMinted), [savedFlowers]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NFT Collection</h1>
        <p className="text-sm text-muted-foreground mt-1">Your minted flower NFTs on the blockchain</p>
      </div>

      {mintedFlowers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gem className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No minted NFTs yet. Create and mint your first flower!</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {mintedFlowers.map((flower, i) => (
            <motion.div
              key={flower.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card rounded-xl border border-border overflow-hidden group"
            >
              <div
                className="h-48 relative"
                style={{
                  background: `radial-gradient(ellipse at center, ${flower.params.colorA}33 0%, transparent 70%), linear-gradient(135deg, hsl(240 10% 6%), hsl(240 10% 3%))`,
                }}
              >
                <div className="absolute inset-0 grid-bg opacity-20" />
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-primary/20 text-primary text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                  <Gem className="w-3 h-3" /> Verified NFT
                </div>
              </div>
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{flower.title}</h3>
                <p className="text-[10px] text-muted-foreground">Word: <span className="font-medium text-foreground font-mono">{flower.generationWord}</span></p>

                {flower.txHash && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-emerald-400 font-semibold shrink-0">TX</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      {flower.txHash.slice(0, 10)}…{flower.txHash.slice(-6)}
                    </span>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(flower.txHash!); toast.success('Tx hash copied'); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy tx hash"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {flower.tokenUri ? (
                  <a
                    href={flower.tokenUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[10px] text-primary hover:underline mt-1"
                  >
                    View metadata <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
                    <ExternalLink className="w-3 h-3" /> No metadata URI
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
