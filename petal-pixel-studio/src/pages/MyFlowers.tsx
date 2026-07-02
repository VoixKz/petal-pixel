import { useState } from 'react';
import { motion } from 'framer-motion';
import { useFlowerStore } from '@/stores/flowerStore';
import { Gem, Calendar, Flower2, Trash2, AlertTriangle, Pencil } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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

export default function MyFlowers() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const loadFlowerForEdit = useFlowerStore((s) => s.loadFlowerForEdit);
  const deleteFlower = useFlowerStore((s) => s.deleteFlower);
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const handleEdit = (flower: typeof savedFlowers[number]) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  const handleDelete = async (id: string) => {
    await deleteFlower(id);
    setDeleteTarget(null);
    toast.success('Flower deleted');
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

      {savedFlowers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Flower2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-1">No flowers yet.</p>
          <p className="text-xs text-muted-foreground/70">Create your first bloom to start your garden.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {savedFlowers.map((flower, i) => (
          <motion.div
            key={flower.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
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

            <div className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{flower.title}</h3>
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
            transition={{ delay: savedFlowers.length * 0.1 }}
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
