import { motion } from 'framer-motion';
import { useFlowerStore } from '@/stores/flowerStore';
import { Sparkles } from 'lucide-react';

export function FlowerInfo() {
  const title = useFlowerStore((s) => s.title);
  const generationWord = useFlowerStore((s) => s.generationWord);
  const params = useFlowerStore((s) => s.params);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-4 left-4 glass-panel rounded-lg p-3 max-w-[220px] z-10 pointer-events-auto"
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        <h3 className="text-xs font-semibold text-foreground truncate">{title}</h3>
      </div>
      {generationWord && (
        <p className="text-[10px] text-muted-foreground mb-3">
          Word: <span className="text-primary font-mono">{generationWord}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Stat label="Petals" value={Math.round(params.petalCount)} />
        <Stat label="Curve" value={params.petalSharpness.toFixed(2)} />
        <Stat label="Type" value={params.flowerType} />
        <Stat label="Seed" value={params.seed.length > 8 ? params.seed.slice(0, 8) + '…' : params.seed} />
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className="text-[10px] font-mono text-foreground">{value}</span>
    </div>
  );
}
