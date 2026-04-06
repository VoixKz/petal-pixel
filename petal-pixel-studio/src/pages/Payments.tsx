import { motion } from 'framer-motion';
import { CreditCard, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const transactions = [
  { id: '1', type: 'mint', name: 'Celestial Bloom', amount: '0.05 ETH', date: '2024-01-15' },
  { id: '2', type: 'mint', name: 'Nebula Orchid', amount: '0.05 ETH', date: '2024-03-10' },
];

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

        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Mint: {tx.name}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                </div>
              </div>
              <span className="text-xs font-mono text-foreground">{tx.amount}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
