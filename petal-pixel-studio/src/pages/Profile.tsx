import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Shield, CheckCircle, Gem } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useFlowerStore } from '@/stores/flowerStore';
import { supabase } from '@/integrations/supabase/client';
import { generativeAvatarDataUri } from '@/lib/generativeAvatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function Profile() {
  const { user, profile } = useAuth();
  const isVerified = user?.email_confirmed_at != null;

  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const ownedNfts = useMemo(
    () => savedFlowers.filter((f) => f.isMinted).length,
    [savedFlowers],
  );

  // Local edit state seeded from the context profile. AuthContext exposes no
  // refetch, so after a successful save we update these local values directly
  // (also re-syncing whenever the context profile changes).
  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [savedName, setSavedName] = useState(profile?.display_name ?? '');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
    setSavedName(profile?.display_name ?? '');
    setSavedAvatarUrl(profile?.avatar_url ?? '');
  }, [profile]);

  const avatarSeed = savedName || user?.email || 'petal';
  const avatarSrc = savedAvatarUrl.trim() || generativeAvatarDataUri(avatarSeed, 128);

  const dirty =
    name.trim() !== savedName.trim() || avatarUrl.trim() !== savedAvatarUrl.trim();

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const nextName = name.trim();
    const nextAvatar = avatarUrl.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: nextName || null, avatar_url: nextAvatar || null })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save profile', { description: error.message });
      return;
    }
    // No refetch in AuthContext — reflect the saved values locally so the page
    // (avatar, name, dirty-state) updates immediately.
    setSavedName(nextName);
    setSavedAvatarUrl(nextAvatar);
    toast.success('Profile updated');
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Profile</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-4 sm:p-6 max-w-lg space-y-5"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
            <img src={avatarSrc} alt="Your avatar" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {savedName || 'User'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Member since{' '}
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-foreground truncate">{user?.email || '—'}</span>
            {isVerified && (
              <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto shrink-0">
                <CheckCircle className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-foreground">Role</span>
            <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full ml-auto">
              User
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Gem className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-foreground">Owned NFTs</span>
            <span className="text-xs text-muted-foreground ml-auto font-mono">{ownedNfts}</span>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar-url">Avatar URL</Label>
            <Input
              id="avatar-url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="Paste an image URL, or leave blank for a generated avatar"
              inputMode="url"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
