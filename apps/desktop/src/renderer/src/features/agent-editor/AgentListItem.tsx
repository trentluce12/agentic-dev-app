import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import type { AgentSummary } from '../../../../shared/ipc.ts';

export interface AgentListItemProps {
  agent: AgentSummary;
  selected: boolean;
  onSelect: () => void;
}

const tierColorClass: Record<'orchestrator' | 'lead' | 'implementer', string> = {
  orchestrator: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  lead: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  implementer: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
};

function TierBadge({ tier }: { tier: AgentSummary['tier'] | null }) {
  if (tier === undefined || tier === null) {
    return (
      <span className="inline-flex items-center rounded-sm border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        no tier
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tierColorClass[tier],
      )}
    >
      {tier}
    </span>
  );
}

export function AgentListItem({ agent, selected, onSelect }: AgentListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors',
        'hover:bg-accent/60',
        selected && 'bg-accent text-accent-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{agent.name}</span>
        <span className="ml-auto shrink-0">
          <TierBadge tier={agent.tier ?? null} />
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {agent.description || 'No description.'}
      </div>
      {agent.hasIssues && (
        <div className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-sm bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive-foreground">
          <AlertTriangle className="size-3" />
          <span>issues</span>
        </div>
      )}
    </button>
  );
}
