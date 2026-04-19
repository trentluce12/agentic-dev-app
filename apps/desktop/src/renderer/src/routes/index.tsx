import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { AlertCircle, FolderOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore.ts';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const recent = useQuery({
    queryKey: ['projects', 'recent'],
    queryFn: () => window.api.projects.recent(),
  });

  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpenError(null);
    try {
      const project = await window.api.projects.open();
      if (project) {
        useProjectStore.getState().setCurrent(project);
        recent.refetch();
      }
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Open a folder with a <code className="font-mono">.claude/</code> directory to begin.
          </p>
        </div>
        <Button onClick={handleOpen}>
          <FolderOpen className="size-4" />
          Open project
        </Button>
      </header>
      <section className="flex-1 overflow-auto px-8 py-6">
        {openError !== null && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" />
            <AlertTitle>Could not open project</AlertTitle>
            <AlertDescription className="font-mono text-xs">{openError}</AlertDescription>
          </Alert>
        )}
        {recent.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading recent projects…</div>
        ) : recent.data && recent.data.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recent.data.map((p) => (
              <li
                key={p.path}
                className="rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-border hover:bg-card/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {p.path}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{p.agentCount} agents</span>
                      {p.hasClaudeDir ? (
                        <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-primary">
                          .claude
                        </span>
                      ) : (
                        <span className="rounded-sm bg-muted px-1.5 py-0.5">no .claude</span>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/agents"
                      onClick={() => {
                        useProjectStore.getState().setCurrent(p);
                      }}
                    >
                      Open
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-dashed border-border/60 p-8 text-center">
            <Plus className="mx-auto mb-3 size-6 text-muted-foreground" />
            <div className="text-sm font-medium">No projects yet</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a folder that contains a <code className="font-mono">.claude/</code> directory.
            </p>
            <Button className="mt-4" onClick={handleOpen}>
              Open project
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
