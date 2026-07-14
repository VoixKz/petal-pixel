import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { truncateMiddle } from '@/lib/truncate';
import { previewGradient, familyLabel } from '@/components/flower/paletteUi';
import { FlowerThumb } from '@/components/flower/FlowerThumb';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Gem, ExternalLink, Copy, ChevronDown, Wallet, Share2, Search, SearchX, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { shareFlowerLink } from './shareParams';
import { collectFamilies, filterFlowers, sortFlowers, type SortOrder } from './myFlowersUtils';

// myFlowersUtils.ts's SortOrder doesn't include "favorites" (out of scope for
// this task's owned files) — extend it locally and handle the extra case
// in-component, matching MyFlowers.tsx's approach, instead of forking the
// shared sort helper.
type GallerySortOrder = SortOrder | 'favorites';

function sortByFavoritesFirst(flowers: SavedFlower[]): SavedFlower[] {
  return [...flowers].sort((a, b) => {
    const d = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
  });
}

const selectClass =
  'bg-secondary text-xs text-foreground rounded-lg px-3 py-2 outline-none border border-border focus:ring-1 focus:ring-primary/40 cursor-pointer';

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
  const toggleFavorite = useFlowerStore((s) => s.toggleFavorite);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      className="bg-card rounded-xl border border-border overflow-hidden group"
    >
      <FlowerThumb
        flowerId={flower.backendFlowerId ?? params.flowerId}
        params={params}
        className="h-40 relative overflow-hidden"
      >
        <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded-full backdrop-blur-sm">
          <Gem className="w-3 h-3" /> Verified NFT
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className="bg-secondary/60 text-secondary-foreground text-xs px-2 py-1 rounded-full backdrop-blur-sm capitalize">
            {familyLabel(params)}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void toggleFavorite(flower.id);
            }}
            aria-pressed={!!flower.isFavorite}
            aria-label={flower.isFavorite ? 'Unfavorite' : 'Favorite'}
            title={flower.isFavorite ? 'Unfavorite' : 'Favorite'}
            className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-black/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <Star
              className={`w-4 h-4 ${flower.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-white/80'}`}
            />
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void shareFlowerLink(
              flower.backendFlowerId ?? flower.id,
              flower.title,
              (m) => toast.success(m),
              (m) => toast.error(m),
            );
          }}
          className="absolute bottom-3 right-3 flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          title="Share flower"
        >
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
      </FlowerThumb>

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

  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<GallerySortOrder>('newest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const families = useMemo(() => collectFamilies(mintedFlowers), [mintedFlowers]);
  const visible = useMemo(() => {
    // Every card here is already minted, so mint: 'all' just means "don't
    // filter by mint status again" — parity with MyFlowers' filter shape.
    const filtered = filterFlowers(mintedFlowers, { search, mint: 'all', family: familyFilter });
    const byFavorite = favoritesOnly ? filtered.filter((f) => f.isFavorite) : filtered;
    return sortOrder === 'favorites' ? sortByFavoritesFirst(byFavorite) : sortFlowers(byFavorite, sortOrder);
  }, [mintedFlowers, search, familyFilter, favoritesOnly, sortOrder]);

  const clearFilters = () => {
    setSearch('');
    setFamilyFilter('all');
    setFavoritesOnly(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">NFT Collection</h1>
        <p className="text-sm text-muted-foreground mt-1">Your minted flower NFTs on the blockchain</p>
      </div>

      {mintedFlowers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or word…"
              aria-label="Search flowers"
              className="w-full sm:w-56 bg-secondary text-xs text-foreground rounded-lg pl-9 pr-3 py-2 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40"
            />
          </div>

          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              favoritesOnly
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-primary' : ''}`} /> Favorites
          </button>

          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            aria-label="Filter by family"
            className={`${selectClass} capitalize`}
          >
            <option value="all">All families</option>
            {families.map((f) => (
              <option key={f} value={f} className="capitalize">
                {f}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as GallerySortOrder)}
            aria-label="Sort flowers"
            className={selectClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="favorites">Favorites first</option>
          </select>
        </div>
      )}

      {mintedFlowers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gem className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">No minted NFTs yet. Create and mint your first flower!</p>
          <Link
            to="/create"
            className="text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            Create a flower
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchX className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-3">No NFTs match your filters.</p>
          <button
            onClick={clearFilters}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((flower, i) => (
            <NftCard key={flower.id} flower={flower} index={i} />
          ))}
        </div>
      )}

      <MetaMaskHelp />
    </div>
  );
}
