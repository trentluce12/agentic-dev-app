import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/visualizer')({
  component: VisualizerPage,
});

function VisualizerPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-8 py-5">
        <h1 className="text-lg font-semibold">Agent Hierarchy Visualizer</h1>
        <p className="text-sm text-muted-foreground">
          Live graph of orchestrator → lead → implementer runs. (Phase 2.)
        </p>
      </header>
      <section className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Visualizer canvas will render here once Phase 2 lands.
      </section>
    </div>
  );
}
