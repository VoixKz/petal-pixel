import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';

export default function Payments() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Payments</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-5 max-w-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Transaction History</h2>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CreditCard className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">Demo — coming soon</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            Payment history isn't available in this demo. Your real mint transactions will appear here once payments go live.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
