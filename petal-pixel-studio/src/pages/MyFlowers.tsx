import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, DELETE_GRACE_MS, type SavedFlower } from '@/stores/flowerStore';
import { Gem, Calendar, Flower2, Trash2, Pencil, Search, SearchX, Share2, Star } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { previewGradient, familyLabel } from '@/components/flower/paletteUi';
import { FlowerThumb } from '@/components/flower/FlowerThumb';
import { shareFlowerLink } from './shareParams';
import {
  collectFamilies,
  filterFlowers,
  sortFlowers,
  type MintFilter,
  type SortOrder,
} from './myFlowersUtils';

// myFlowersUtils.ts's SortOrder doesn't include "favorites" (out of scope for
// this task's owned files) — extend it locally and handle the extra case
// in-component instead of forking/duplicating the shared sort helper.
type GallerySortOrder = SortOrder | 'favorites';

function sortByFavoritesFirst(flowers: SavedFlower[]): SavedFlower[] {
  return [...flowers].sort((a, b) => {
    const d = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
  });
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  // Guards double-commit: Enter/Escape unmount the input, which also fires blur.
  const doneRef = useRef(false);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          doneRef.current = true;
          onCommit(value);
        } else if (e.key === 'Escape') {
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!doneRef.current) onCommit(value);
      }}
      aria-label="Rename flower"
      className="w-full bg-secondary text-sm font-semibold text-foreground rounded px-2 py-1 outline-none ring-1 ring-primary/40"
    />
  );
}

const selectClass =
  'bg-secondary text-xs text-foreground rounded-lg px-3 py-2 outline-none border border-border focus:ring-1 focus:ring-primary/40 cursor-pointer';

export default function MyFlowers() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const loadFlowerForEdit = useFlowerStore((s) => s.loadFlowerForEdit);
  const scheduleDelete = useFlowerStore((s) => s.scheduleDelete);
  const undoDelete = useFlowerStore((s) => s.undoDelete);
  const pendingDeleteIds = useFlowerStore((s) => s.pendingDeleteIds);
  const updateFlowerTitle = useFlowerStore((s) => s.updateFlowerTitle);
  const toggleFavorite = useFlowerStore((s) => s.toggleFavorite);
  const navigate = useNavigate();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mintFilter, setMintFilter] = useState<MintFilter>('all');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<GallerySortOrder>('newest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const families = useMemo(() => collectFamilies(savedFlowers), [savedFlowers]);
  const visible = useMemo(() => {
    const filtered = filterFlowers(savedFlowers, { search, mint: mintFilter, family: familyFilter });
    const byFavorite = favoritesOnly ? filtered.filter((f) => f.isFavorite) : filtered;
    const sorted =
      sortOrder === 'favorites' ? sortByFavoritesFirst(byFavorite) : sortFlowers(byFavorite, sortOrder);
    return sorted.filter((f) => !pendingDeleteIds.includes(f.id));
  }, [savedFlowers, search, mintFilter, familyFilter, favoritesOnly, sortOrder, pendingDeleteIds]);

  const clearFilters = () => {
    setSearch('');
    setMintFilter('all');
    setFamilyFilter('all');
    setFavoritesOnly(false);
  };

  const handleEdit = (flower: SavedFlower) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  const handleShare = (flower: SavedFlower) =>
    void shareFlowerLink(
      flower.backendFlowerId ?? flower.id,
      flower.title,
      (m) => toast.success(m),
      (m) => toast.error(m),
    );

  const requestDelete = (flower: SavedFlower) => {
    // The pending-delete lifecycle lives in the store (module-scoped timer), so
    // it survives navigating away from /my-flowers: the delete still commits
    // after the grace, and the globally-mounted toast's Undo can cancel it from
    // any page — no premature commit, no orphaned no-op Undo.
    scheduleDelete(flower.id);
    toast('Flower deleted', {
      duration: DELETE_GRACE_MS,
      action: {
        label: 'Undo',
        onClick: () => undoDelete(flower.id),
      },
    });
  };

  const handleRenameCommit = async (id: string, raw: string) => {
    setRenamingId(null);
    const next = raw.trim();
    const current = savedFlowers.find((f) => f.id === id);
    if (!current || !next || next === current.title) return;
    await updateFlowerTitle(id, next);
    toast.success('Flower renamed');
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Flowers</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal garden of generated flowers</p>
      </div>

      {savedFlowers.length > 0 && (
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

          <div className="flex items-center gap-1" role="group" aria-label="Mint status filter">
            {(['all', 'minted', 'drafts'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMintFilter(m)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors capitalize ${
                  mintFilter === m
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {m}
              </button>
            ))}
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

      {savedFlowers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Flower2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-1">No flowers yet.</p>
          <p className="text-xs text-muted-foreground/70">Create your first bloom to start your garden.</p>
        </div>
      )}

      {savedFlowers.length > 0 && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchX className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-3">No flowers match your filters.</p>
          <button
            onClick={clearFilters}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((flower, i) => (
          <motion.div
            key={flower.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.06 }}
            className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-all group cursor-default relative"
            onDoubleClick={() => handleEdit(flower)}
          >
            <FlowerThumb
              flowerId={flower.backendFlowerId ?? flower.params.flowerId}
              params={flower.params}
              className="h-48 relative overflow-hidden"
            >
              <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

              <div className="absolute top-3 right-3 flex items-center gap-2">
                {flower.isMinted && (
                  <div className="flex items-center gap-1 bg-accent/20 text-accent-foreground text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                    <Gem className="w-3 h-3" /> NFT
                  </div>
                )}
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

              <div className="absolute bottom-3 left-3 text-xs px-2 py-0.5 rounded-full bg-black/40 text-white/80 backdrop-blur-sm capitalize">
                {familyLabel(flower.params)}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  requestDelete(flower);
                }}
                className="absolute top-3 left-3 w-9 h-9 rounded-full bg-rose-500/10 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity hover:bg-rose-500/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                title="Delete flower"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleShare(flower);
                }}
                className="absolute top-3 left-14 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                title="Share flower"
              >
                <Share2 className="w-4 h-4 text-primary" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(flower);
                }}
                className="absolute bottom-3 right-3 flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                title="Edit flower"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </FlowerThumb>

            <div className="h-1.5 w-full" style={{ background: previewGradient(flower.params) }} />

            <div className="p-4 space-y-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {renamingId === flower.id ? (
                  <RenameInput
                    initial={flower.title}
                    onCommit={(v) => void handleRenameCommit(flower.id, v)}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-foreground truncate">{flower.title}</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(flower.id);
                      }}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0 p-1.5 -m-1.5 rounded focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      title="Rename flower"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Word: <span className="text-primary font-mono">{flower.generationWord}</span>
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" /> {flower.createdAt}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    flower.isMinted
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {flower.isMinted ? 'Minted' : 'Draft'}
                </span>
              </div>
            </div>
          </motion.div>
        ))}

        <Link to="/create">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(visible.length, 8) * 0.06 }}
            className="bg-card rounded-xl border border-dashed border-border h-full min-h-[280px] flex flex-col items-center justify-center gap-3 hover:border-primary/30 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Flower2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Create New Flower</span>
          </motion.div>
        </Link>
      </div>
    </div>
  );
}
