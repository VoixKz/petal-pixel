import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Sparkles } from 'lucide-react';
import { AppSidebar } from './AppSidebar';
import { SidebarBody } from './SidebarContent';
import { ThemeToggle } from './ThemeToggle';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useFlowerStore } from '@/stores/flowerStore';
import { BRAND_NAME } from '@/lib/brand';

export function DashboardLayout() {
  const loadFromBackend = useFlowerStore((s) => s.loadFromBackend);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    void loadFromBackend();
  }, [loadFromBackend]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0 border-sidebar-border [&>button]:hidden">
          <SidebarBody onNavigate={() => setDrawerOpen(false)} showFooterThemeToggle={false} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar/95 px-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">{BRAND_NAME}</span>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
