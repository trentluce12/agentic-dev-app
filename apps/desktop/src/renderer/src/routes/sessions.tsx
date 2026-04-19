import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sessions')({
  component: SessionsPage,
});

function SessionsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-8 py-5">
        <h1 className="text-lg font-semibold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Launch and monitor Claude Code sessions. (Phase 1 — in progress.)
        </p>
      </header>
    </div>
  );
}
