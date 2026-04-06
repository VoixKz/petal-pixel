import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Moon, Globe, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const [emailNotif, setEmailNotif] = useState(() => {
    try { return localStorage.getItem('petal-email-notif') === 'true'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('petal-email-notif', String(emailNotif)); } catch { /* noop */ }
  }, [emailNotif]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-5 max-w-lg space-y-4"
      >
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            {isDark ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-amber-400" />}
            <div>
              <p className="text-sm font-medium text-foreground">Dark mode</p>
              <p className="text-[10px] text-muted-foreground">Toggle between dark and light theme</p>
            </div>
          </div>
          <Toggle checked={isDark} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Email notifications</p>
              <p className="text-[10px] text-muted-foreground">Receive updates about your NFTs</p>
            </div>
          </div>
          <Toggle checked={emailNotif} onChange={setEmailNotif} />
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Language</p>
              <p className="text-[10px] text-muted-foreground">English (US)</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">English</span>
        </div>
      </motion.div>
    </div>
  );
}
