import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { useFlowerStore } from '@/stores/flowerStore';

export function DashboardLayout() {
  const loadFromBackend = useFlowerStore((s) => s.loadFromBackend);

  useEffect(() => {
    void loadFromBackend();
  }, [loadFromBackend]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
