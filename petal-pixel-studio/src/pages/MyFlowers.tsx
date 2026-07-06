import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { Gem, Calendar, Flower2, Trash2, AlertTriangle, Pencil, Search, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { previewGradient, familyLabel } from '@/components/flower/paletteUi';
import {
  collectFamilies,
  filterFlowers,
  sortFlowers,
  type MintFilter,
  type SortOrder,
} from './myFlowersUtils';

function DeleteConfirmDialog({ flowerTitle, onConfirm, onCancel }: { flowerTitle: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Delete flower?</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Are you sure you want to delete <span className="font-semibold text-foreground">{flowerTitle}</span>? This action cannot be undone.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-4 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
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
  const deleteFlower = useFlowerStore((s) => s.deleteFlower);
  const updateFlowerTitle = useFlowerStore((s) => s.updateFlowerTitle);
  const navigate = useNavigate();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mintFilter, setMintFilter] = useState<MintFilter>('all');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const families = useMemo(() => collectFamilies(savedFlowers), [savedFlowers]);
  const visible = useMemo(
    () =>
      sortFlowers(
        filterFlowers(savedFlowers, { search, mint: mintFilter, family: familyFilter }),
        sortOrder,
      ),
    [savedFlowers, search, mintFilter, familyFilter, sortOrder],
  );

  const clearFilters = () => {
    setSearch('');
    setMintFilter('all');
    setFamilyFilter('all');
  };

  const handleEdit = (flower: SavedFlower) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  const handleDelete = async (id: string) => {
    await deleteFlower(id);
    setDeleteTarget(null);
    toast.success('Flower deleted');
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
      {deleteTarget && (
        <DeleteConfirmDialog
          flowerTitle={deleteTarget.title}
          onConfirm={() => void handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">My Flowers</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal garden of generated flowers</p>
      </div>

      {savedFlowers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or word…"
              aria-label="Search flowers"
              className="w-56 bg-secondary text-xs text-foreground rounded-lg pl-9 pr-3 py-2 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40"
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
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Sort flowers"
            className={selectClass}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
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

      <div className="grid grid-cols-3 gap-4">
        {visible.map((flower, i) => (
          <motion.div
            key={flower.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.06 }}
            className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-all group cursor-default relative"
            onDoubleClick={() => handleEdit(flower)}
          >
            <div
              className="h-48 relative overflow-hidden"
              style={{
                background: `radial-gradient(ellipse at center, ${flower.params.colorA}33 0%, transparent 70%), linear-gradient(135deg, hsl(240 10% 6%), hsl(240 10% 3%))`,
              }}
            >
              <div className="absolute inset-0 grid-bg opacity-30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Flower2
                  className="w-16 h-16 opacity-40 group-hover:opacity-60 transition-opacity"
                  style={{ color: flower.params.colorA }}
                />
              </div>
              {flower.isMinted && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-accent/20 text-accent-foreground text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                  <Gem className="w-3 h-3" /> NFT
                </div>
              )}
              <div className="absolute bottom-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-white/80 backdrop-blur-sm capitalize">
                {familyLabel(flower.params)}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ id: flower.id, title: flower.title });
                }}
                className="absolute top-3 left-3 w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/30"
                title="Delete flower"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(flower);
                }}
                className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Edit flower"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>

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
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      title="Rename flower"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Word: <span className="text-primary font-mono">{flower.generationWord}</span>
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="w-3 h-3" /> {flower.createdAt}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
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
