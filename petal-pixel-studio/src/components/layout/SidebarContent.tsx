import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { generativeAvatarDataUri } from '@/lib/generativeAvatar';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { NAV_ITEMS } from './navItems';
import { ThemeToggle } from './ThemeToggle';

export function SidebarBody({
  onNavigate,
  showFooterThemeToggle = true,
}: {
  onNavigate?: () => void;
  showFooterThemeToggle?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();

  const handleLogout = async () => {
    onNavigate?.();
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">{BRAND_NAME}</h1>
          <p className="text-xs text-sidebar-foreground">{BRAND_TAGLINE}</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink key={item.path} to={item.path} onClick={() => onNavigate?.()}>
              <motion.div
                whileHover={{ x: 2 }}
                className={`flex min-h-10 items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div layoutId="nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            <img
              src={
                profile?.avatar_url?.trim() ||
                generativeAvatarDataUri(profile?.display_name || user?.email || 'petal', 64)
              }
              alt="Your avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
              {profile?.display_name || user?.email || 'User'}
            </p>
            <p className="text-xs text-sidebar-foreground">Free Plan</p>
          </div>
          {showFooterThemeToggle && <ThemeToggle />}
        </div>
        <button
          onClick={() => void handleLogout()}
          className="flex min-h-10 items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
