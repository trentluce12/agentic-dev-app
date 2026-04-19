import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agents')({
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-8 py-5">
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Edit agents with schema validation and live filesystem sync. (Phase 1 — in progress.)
        </p>
      </header>
      <section className="flex-1 overflow-auto px-8 py-6 text-sm text-muted-foreground">
        Select a project from Home to load its <code className="font-mono">.claude/agents</code>.
      </section>
    </div>
  );
}
