import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Moon, Globe, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
              <Label htmlFor="dark-mode-switch" className="text-sm font-medium text-foreground">Dark mode</Label>
              <p className="text-[10px] text-muted-foreground">Toggle between dark and light theme</p>
            </div>
          </div>
          <Switch
            id="dark-mode-switch"
            aria-label="Dark mode"
            checked={isDark}
            onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label htmlFor="email-notif-switch" className="text-sm font-medium text-foreground">Email notifications</Label>
              <p className="text-[10px] text-muted-foreground">Receive updates about your NFTs</p>
            </div>
          </div>
          <Switch
            id="email-notif-switch"
            aria-label="Email notifications"
            checked={emailNotif}
            onCheckedChange={setEmailNotif}
          />
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
