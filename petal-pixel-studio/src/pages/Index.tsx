import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Flower2, Gem, FileEdit, PlusCircle, ArrowRight, BarChart3, Clock } from 'lucide-react';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import { paletteGradient, previewGradient, familyLabel } from '@/components/flower/paletteUi';
import { FlowerThumb } from '@/components/flower/FlowerThumb';
import { familyDistribution, recentFlowers } from './dashboardStats';

export default function Index() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const loadFlowerForEdit = useFlowerStore((s) => s.loadFlowerForEdit);
  const navigate = useNavigate();

  const totalFlowers = savedFlowers.length;
  const mintedCount = useMemo(() => savedFlowers.filter((f) => f.isMinted).length, [savedFlowers]);
  const draftCount = useMemo(() => savedFlowers.filter((f) => !f.isMinted).length, [savedFlowers]);

  const distribution = useMemo(() => familyDistribution(savedFlowers).slice(0, 6), [savedFlowers]);
  const maxCount = distribution[0]?.count ?? 1;
  // First flower carrying each family label supplies that family's bar tint.
  const familyGradients = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of savedFlowers) {
      const family = familyLabel(f.params);
      if (!map.has(family)) map.set(family, paletteGradient(f.params.palette?.stops ?? []));
    }
    return map;
  }, [savedFlowers]);
  const recent = useMemo(() => recentFlowers(savedFlowers, 4), [savedFlowers]);

  // Same edit pattern as MyFlowers.handleEdit
  const handleEdit = (flower: SavedFlower) => {
    loadFlowerForEdit(flower);
    navigate('/create', { state: { isEditing: true } });
  };

  const stats = [
    { label: 'Total Flowers', value: String(totalFlowers), icon: Flower2, color: 'text-primary' },
    { label: 'Minted NFTs', value: String(mintedCount), icon: Gem, color: 'text-accent' },
    { label: 'Drafts', value: String(draftCount), icon: FileEdit, color: 'text-primary' },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's your garden overview.</p>
        </div>
        <Link
          to="/create"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 h-10 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <PlusCircle className="w-4 h-4" /> Create Flower
        </Link>
      </motion.div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card rounded-xl p-4 sm:p-5 border border-border hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex flex-wrap items-center gap-3"
      >
        <button
          onClick={() => navigate('/create')}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <PlusCircle className="w-4 h-4" /> Create new
        </button>
        <button
          onClick={() => navigate('/my-flowers')}
          className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <FileEdit className="w-4 h-4" /> Continue drafts
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
            {draftCount}
          </span>
        </button>
      </motion.div>

      {/* Recent flowers */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Recent flowers
          </h2>
          <Link to="/my-flowers" className="flex items-center gap-1 text-xs text-primary hover:underline">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No flowers yet — create your first bloom to start your garden.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recent.map((flower) => {
              const imgId = flower.backendFlowerId ?? flower.params.flowerId;
              return (
                <button
                  key={flower.id}
                  onClick={() => handleEdit(flower)}
                  className="bg-card rounded-xl border border-border overflow-hidden text-left hover:border-primary/30 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={`Edit ${flower.title}`}
                >
                  <FlowerThumb
                    flowerId={imgId}
                    params={flower.params}
                    className="h-20 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                    {flower.isMinted && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
                        <Gem className="w-3 h-3" /> Minted
                      </span>
                    )}
                  </FlowerThumb>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-foreground truncate">{flower.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {familyLabel(flower.params)} · {flower.createdAt}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Family distribution */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-card rounded-xl p-4 sm:p-6 border border-border"
      >
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-muted-foreground" /> Family distribution
        </h2>
        {distribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to chart yet — generate a flower to see your garden's families.</p>
        ) : (
          <div className="space-y-3">
            {distribution.map(({ family, count }) => (
              <div key={family} className="flex items-center gap-3">
                <span className="w-20 sm:w-24 shrink-0 text-xs text-muted-foreground capitalize truncate">{family}</span>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((count / maxCount) * 100)}%`,
                      background: familyGradients.get(family) ?? '#808080',
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-mono text-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
