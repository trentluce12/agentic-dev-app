import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/tickets')({
  component: TicketsPage,
});

function TicketsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-8 py-5">
        <h1 className="text-lg font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Scrum-style task tracking linked to Claude sessions. (Phase 3.)
        </p>
      </header>
    </div>
  );
}
