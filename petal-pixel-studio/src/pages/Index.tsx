import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Flower2, Gem, FileEdit, Activity, PlusCircle, ArrowRight } from 'lucide-react';
import { useFlowerStore } from '@/stores/flowerStore';
import { checkFlowerBackendHealth } from '@/integrations/flowerBackend/client';

export default function Index() {
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const totalFlowers = savedFlowers.length;
  const mintedCount = useMemo(() => savedFlowers.filter((f) => f.isMinted).length, [savedFlowers]);
  const draftCount = useMemo(() => savedFlowers.filter((f) => !f.isMinted).length, [savedFlowers]);

  useEffect(() => {
    checkFlowerBackendHealth()
      .then((ok) => setBackendOnline(ok))
      .catch(() => setBackendOnline(false));
  }, []);

  const stats = [
    { label: 'Total Flowers', value: String(totalFlowers), icon: Flower2, color: 'text-primary' },
    { label: 'Minted NFTs', value: String(mintedCount), icon: Gem, color: 'text-accent' },
    { label: 'Drafts', value: String(draftCount), icon: FileEdit, color: 'text-primary' },
    {
      label: 'Backend',
      value: backendOnline === null ? '...' : backendOnline ? 'Online' : 'Offline',
      icon: Activity,
      color: backendOnline ? 'text-emerald-400' : backendOnline === false ? 'text-rose-400' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's your garden overview.</p>
        </div>
        <Link
          to="/create"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <PlusCircle className="w-4 h-4" /> Create Flower
        </Link>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card rounded-xl p-5 border border-border hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card rounded-xl p-6 border border-border"
        >
          <h2 className="text-lg font-semibold text-foreground mb-2">Create a New Flower</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Generate a unique 3D flower from your name using mathematical formulas. Customize and mint as an NFT.
          </p>
          <Link
            to="/create"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            Get started <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card rounded-xl p-6 border border-border"
        >
          <h2 className="text-lg font-semibold text-foreground mb-2">Your Collection</h2>
          <p className="text-sm text-muted-foreground mb-4">
            View your saved flowers and manage your NFT collection. Each flower is unique and verifiable on-chain.
          </p>
          <Link
            to="/my-flowers"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            View flowers <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
