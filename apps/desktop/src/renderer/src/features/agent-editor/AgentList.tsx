import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AgentListItem } from './AgentListItem.tsx';
import { NewAgentDialog } from './NewAgentDialog.tsx';
import { useAgentList } from './hooks/useAgentList.ts';

export interface AgentListProps {
  projectPath: string;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function AgentList({ projectPath, selectedName, onSelect }: AgentListProps) {
  const { data, isLoading, error } = useAgentList(projectPath);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agents
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setNewDialogOpen(true)}
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading agents…</div>
        )}
        {error !== null && error !== undefined && (
          <div className="px-3 py-4 text-xs text-destructive">
            Failed to load agents: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        {data !== undefined && data.length === 0 && (
          <div className="mx-3 mt-4 rounded-md border border-dashed border-border/60 p-4 text-center">
            <div className="text-xs font-medium">No agents yet</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Create your first agent to get started.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => setNewDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              Create your first agent
            </Button>
          </div>
        )}
        {data !== undefined && data.length > 0 && (
          <ul className="flex flex-col gap-0.5 p-2">
            {data.map((agent) => (
              <li key={agent.path}>
                <AgentListItem
                  agent={agent}
                  selected={agent.name === selectedName}
                  onSelect={() => onSelect(agent.name)}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <NewAgentDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        projectPath={projectPath}
      />
    </div>
  );
}
