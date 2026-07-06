import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { truncateMiddle } from '@/lib/truncate';
import { previewGradient, familyLabel } from '@/components/flower/paletteUi';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Gem, ExternalLink, Copy, ChevronDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';

function DetailRow({
  tag,
  tagClass,
  display,
  copyValue,
  copyLabel,
}: {
  tag: string;
  tagClass: string;
  display: string;
  copyValue?: string;
  copyLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`text-xs font-semibold shrink-0 ${tagClass}`}>{tag}</span>
      <span className="text-xs text-muted-foreground font-mono truncate">{display}</span>
      {copyValue !== undefined && copyLabel && (
        <button
          onClick={() => {
            void navigator.clipboard.writeText(copyValue);
            toast.success(`${copyLabel} copied`);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1.5 -m-1.5 rounded focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          title={`Copy ${copyLabel.toLowerCase()}`}
        >
          <Copy className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function MetaMaskHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="bg-card rounded-xl border border-border max-w-xl"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-xl">
        <span className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" /> How to see it in MetaMask
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
          <li>
            Open MetaMask and switch to the{' '}
            <span className="text-foreground font-medium">NFTs</span> tab.
          </li>
          <li>
            Click <span className="text-foreground font-medium">Import NFT</span>.
          </li>
          <li>
            Paste the <span className="text-foreground font-medium">contract address</span> and{' '}
            <span className="text-foreground font-medium">Token ID</span> from the card above
            (use the copy buttons).
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Token ids start at <span className="font-mono text-foreground">0</span> and increment
          in mint order. Full local-chain walkthrough (Anvil network, dev account, gotchas):{' '}
          <span className="font-mono text-foreground">docs/MINTING.md</span>.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function NftCard({ flower, index }: { flower: SavedFlower; index: number }) {
  const { params } = flower;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      className="bg-card rounded-xl border border-border overflow-hidden group"
    >
      <div
        className="h-40 relative"
        style={{
          background: `radial-gradient(ellipse at center, ${params.colorA}33 0%, transparent 70%), linear-gradient(135deg, hsl(240 10% 6%), hsl(240 10% 3%))`,
        }}
      >
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded-full backdrop-blur-sm">
          <Gem className="w-3 h-3" /> Verified NFT
        </div>
        <div className="absolute top-3 right-3 bg-secondary/60 text-secondary-foreground text-xs px-2 py-1 rounded-full backdrop-blur-sm capitalize">
          {familyLabel(params)}
        </div>
      </div>

      {/* preview band: v2 uses real palette stops; v1 falls back to colorA/colorB gradient */}
      <div
        className="h-2"
        style={{ background: previewGradient(params) }}
        title={params.palette?.id}
      />

      <div className="p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{flower.title}</h3>
        <p className="text-xs text-muted-foreground">
          Word:{' '}
          <span className="font-medium text-foreground font-mono">{flower.generationWord}</span>
        </p>

        <DetailRow
          tag="ID"
          tagClass="text-primary"
          display={params.mintTokenId !== undefined ? `#${params.mintTokenId}` : '—'}
          copyValue={params.mintTokenId !== undefined ? String(params.mintTokenId) : undefined}
          copyLabel="Token ID"
        />

        {params.mintContractAddress && (
          <DetailRow
            tag="CA"
            tagClass="text-sky-400"
            display={truncateMiddle(params.mintContractAddress, 6)}
            copyValue={params.mintContractAddress}
            copyLabel="Contract address"
          />
        )}

        {flower.txHash && (
          <DetailRow
            tag="TX"
            tagClass="text-emerald-400"
            display={truncateMiddle(flower.txHash, 6)}
            copyValue={flower.txHash}
            copyLabel="Tx hash"
          />
        )}

        {flower.tokenUri ? (
          <a
            href={flower.tokenUri}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
          >
            Metadata <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <ExternalLink className="w-3 h-3" /> No metadata URI
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function NftCollection() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const mintedFlowers = useMemo(() => savedFlowers.filter((f) => f.isMinted), [savedFlowers]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {mintedFlowers.map((flower, i) => (
            <NftCard key={flower.id} flower={flower} index={i} />
          ))}
        </div>
      )}

      <MetaMaskHelp />
    </div>
  );
}
