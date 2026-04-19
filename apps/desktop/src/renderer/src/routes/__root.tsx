import { cn } from '@/lib/utils';
import type { QueryClient } from '@tanstack/react-query';
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Bot, Boxes, KanbanSquare, Network, Settings2, Terminal } from 'lucide-react';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const navItems = [
  { to: '/', label: 'Home', icon: Boxes },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/sessions', label: 'Sessions', icon: Terminal },
  { to: '/visualizer', label: 'Visualizer', icon: Network },
  { to: '/tickets', label: 'Tickets', icon: KanbanSquare },
  { to: '/settings', label: 'Settings', icon: Settings2 },
] as const;

function RootLayout() {
  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-56 flex-col border-r border-border/60 bg-card/30">
        <div className="px-5 py-5">
          <div className="text-sm font-semibold tracking-tight">Agentic Dev</div>
          <div className="text-xs text-muted-foreground">Claude Code cockpit</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
              )}
              activeProps={{ className: 'bg-accent text-foreground' }}
              activeOptions={{ exact: to === '/' }}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-4 text-[10px] text-muted-foreground/60">
          v0.0.1 · dev build
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
