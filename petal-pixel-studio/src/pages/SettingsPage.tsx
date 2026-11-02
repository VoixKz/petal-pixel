import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  Moon,
  Sun,
  KeyRound,
  LogOut,
  Mail,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usesPasswordForm } from '@/integrations/auth';
import { accountSecurityUrl } from '@/integrations/auth/oidc';
import {
  getPrefs,
  setPref,
  type UserPrefKey,
  type UserPrefs,
} from '@/lib/userPrefs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const reduceMotion = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isVerified = user?.emailVerified === true;

  // Notification prefs are device-local. Seed React state from storage once,
  // then keep UI and storage in lockstep: each toggle writes and reads back the
  // merged snapshot returned by setPref.
  const [prefs, setPrefs] = useState<UserPrefs>(getPrefs);
  const toggle = (key: UserPrefKey, value: boolean) => {
    setPrefs(setPref(key, value));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const intro = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Settings</h1>

      <motion.div {...intro} className="max-w-2xl space-y-6">
        {/* Appearance ------------------------------------------------------ */}
        <section
          aria-labelledby="settings-appearance-heading"
          className="bg-card rounded-xl border border-border p-5 space-y-4"
        >
          <div>
            <h2
              id="settings-appearance-heading"
              className="text-sm font-semibold text-foreground"
            >
              Appearance
            </h2>
            <p className="text-xs text-muted-foreground">
              How Petal Pixel looks on this device.
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
              <div>
                <Label
                  htmlFor="dark-mode-switch"
                  className="text-sm font-medium text-foreground"
                >
                  Dark mode
                </Label>
                <p className="text-xs text-muted-foreground">
                  Toggle between dark and light theme. Remembered across visits.
                </p>
              </div>
            </div>
            <Switch
              id="dark-mode-switch"
              aria-label="Dark mode"
              checked={isDark}
              onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
          </div>
        </section>

        {/* Notifications --------------------------------------------------- */}
        <section
          aria-labelledby="settings-notifications-heading"
          className="bg-card rounded-xl border border-border p-5 space-y-4"
        >
          <div>
            <h2
              id="settings-notifications-heading"
              className="text-sm font-semibold text-foreground"
            >
              Notifications
            </h2>
            <p className="text-xs text-muted-foreground">
              Preferences saved on this device. No delivery backend is wired up
              yet.
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label
                  htmlFor="email-notif-switch"
                  className="text-sm font-medium text-foreground"
                >
                  Email notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Remembers your preference on this device. Email delivery is not
                  wired up yet.
                </p>
              </div>
            </div>
            <Switch
              id="email-notif-switch"
              aria-label="Email notifications"
              checked={prefs.emailNotifications}
              onCheckedChange={(v) => toggle('emailNotifications', v)}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label
                  htmlFor="mint-alerts-switch"
                  className="text-sm font-medium text-foreground"
                >
                  Mint activity alerts
                </Label>
                <p className="text-xs text-muted-foreground">
                  Saved locally. In-app only until the backend sends events.
                </p>
              </div>
            </div>
            <Switch
              id="mint-alerts-switch"
              aria-label="Mint activity alerts"
              checked={prefs.mintActivityAlerts}
              onCheckedChange={(v) => toggle('mintActivityAlerts', v)}
            />
          </div>
        </section>

        {/* Account --------------------------------------------------------- */}
        <section
          aria-labelledby="settings-account-heading"
          className="bg-card rounded-xl border border-border p-5 space-y-4"
        >
          <div>
            <h2
              id="settings-account-heading"
              className="text-sm font-semibold text-foreground"
            >
              Account
            </h2>
            <p className="text-xs text-muted-foreground">
              Your sign-in identity and session.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-mono text-sm text-foreground truncate">
                {user?.email ?? '—'}
              </p>
            </div>
            {isVerified ? (
              <span
                aria-label="Email verified"
                className="text-xs font-medium text-emerald-400"
              >
                Verified
              </span>
            ) : (
              <span
                aria-label="Email not verified"
                className="text-xs font-medium text-muted-foreground"
              >
                Unverified
              </span>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline" className="h-10 sm:flex-1">
              {usesPasswordForm ? (
                <Link to="/forgot-password">
                  <KeyRound className="w-4 h-4" />
                  Change password
                </Link>
              ) : (
                <a href={accountSecurityUrl} target="_blank" rel="noreferrer">
                  <KeyRound className="w-4 h-4" />
                  Change password
                </a>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-10 sm:flex-1"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </section>

        {/* Danger zone ----------------------------------------------------- */}
        <section
          aria-labelledby="settings-danger-heading"
          className="bg-card rounded-xl border border-destructive/40 p-5 space-y-4"
        >
          <div>
            <h2
              id="settings-danger-heading"
              className="text-sm font-semibold text-destructive"
            >
              Danger zone
            </h2>
            <p className="text-xs text-muted-foreground">
              Permanently removes your account and all associated data. This
              cannot be undone.
            </p>
          </div>

          <Button
            variant="destructive"
            className="h-10 w-full sm:w-auto"
            disabled
          >
            <Trash2 className="w-4 h-4" />
            Delete account
          </Button>
          <p className="text-xs text-muted-foreground">
            Self-service deletion isn't available yet — contact support to
            remove your account.
          </p>
        </section>
      </motion.div>
    </div>
  );
}
