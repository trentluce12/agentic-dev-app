import { cn } from '@/lib/utils';
import { diagnosticsToCodeMirror } from '@agentic-dev-app/schemas';
import type { AgentValidationIssue } from '@agentic-dev-app/schemas';
import { AlertCircle, AlertTriangle } from 'lucide-react';

export interface DiagnosticsListProps {
  issues: AgentValidationIssue[];
  rawFrontmatter: string;
  onSelectLine: (line: number) => void;
}

export function DiagnosticsList({ issues, rawFrontmatter, onSelectLine }: DiagnosticsListProps) {
  if (issues.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">No issues.</div>
    );
  }

  const cm = diagnosticsToCodeMirror(issues, rawFrontmatter);

  return (
    <ul className="flex flex-col gap-1 p-2">
      {cm.map((d, idx) => {
        const key = `${d.code}-${d.line}-${idx}`;
        const isError = d.severity === 'error';
        const Icon = isError ? AlertCircle : AlertTriangle;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelectLine(d.line)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                isError ? 'text-destructive' : 'text-yellow-500',
              )}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex-1 text-foreground">
                <span className="block">{d.message}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  (line {d.line})
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
