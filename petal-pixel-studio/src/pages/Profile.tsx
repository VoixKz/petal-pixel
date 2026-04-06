import { motion } from 'framer-motion';
import { User, Mail, Shield, CheckCircle, Gem } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Profile() {
  const { user, profile } = useAuth();
  const isVerified = user?.email_confirmed_at != null;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-6 max-w-lg space-y-5"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-muted-foreground" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{profile?.display_name || 'User'}</h2>
            <p className="text-sm text-muted-foreground">Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">{user?.email || '—'}</span>
            {isVerified && (
              <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">
                <CheckCircle className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">Role</span>
            <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full ml-auto">User</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Gem className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">Owned NFTs</span>
            <span className="text-xs text-muted-foreground ml-auto font-mono">0</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
