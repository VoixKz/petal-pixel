import { SidebarBody } from './SidebarContent';

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex w-64 h-screen flex-col border-r border-sidebar-border shrink-0">
      <SidebarBody />
    </aside>
  );
}
