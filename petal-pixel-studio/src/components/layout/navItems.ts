import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Flower2, PlusCircle, Gem, Activity, User, Settings } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'My Flowers', icon: Flower2, path: '/my-flowers' },
  { label: 'Create Flower', icon: PlusCircle, path: '/create' },
  { label: 'NFT Collection', icon: Gem, path: '/nfts' },
  { label: 'Activity', icon: Activity, path: '/activity' },
  { label: 'Profile', icon: User, path: '/profile' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];
