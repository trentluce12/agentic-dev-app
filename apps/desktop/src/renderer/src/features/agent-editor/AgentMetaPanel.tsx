import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentFrontmatter, AgentValidationIssue } from '@agentic-dev-app/schemas';
import { rewriteTierInYaml, rewriteToolsInYaml } from './yaml-rewriters.ts';
import type { TierPickerValue } from './types.ts';

export interface AgentMetaPanelProps {
  frontmatter: AgentFrontmatter;
  issues: AgentValidationIssue[];
  yamlText: string;
  onYamlRewrite: (yaml: string) => void;
}

const TIER_NONE = '__none';

function isTier(v: string): v is 'orchestrator' | 'lead' | 'implementer' {
  return v === 'orchestrator' || v === 'lead' || v === 'implementer';
}

function summarizeEffort(effort: AgentFrontmatter['effort']): string | null {
  return effort === undefined ? null : String(effort);
}

function summarizeModel(model: AgentFrontmatter['model']): string | null {
  if (model === undefined) return null;
  return typeof model === 'string' ? model : String(model);
}

export function AgentMetaPanel({
  frontmatter,
  issues,
  yamlText,
  onYamlRewrite,
}: AgentMetaPanelProps) {
  const currentTier: TierPickerValue = frontmatter['x-tier'] ?? null;
  const tools = frontmatter.tools ?? [];
  const description = frontmatter.description ?? '';
  const model = summarizeModel(frontmatter.model);
  const effort = summarizeEffort(frontmatter.effort);

  const tierWarnings = issues.filter(
    (i) =>
      i.level === 'warning' &&
      (i.code === 'tier.lead-missing-agent-tool' ||
        i.code === 'tier.implementer-has-agent-tool'),
  );

  const handleTierChange = (next: string) => {
    const nextTier: TierPickerValue = next === TIER_NONE ? null : isTier(next) ? next : null;
    const rewritten = rewriteTierInYaml(yamlText, nextTier);
    if (rewritten !== yamlText) {
      onYamlRewrite(rewritten);
    }
  };

  const handleFix = (mode: 'add-agent' | 'remove-agent') => {
    const rewritten = rewriteToolsInYaml(yamlText, mode);
    if (rewritten !== yamlText) {
      onYamlRewrite(rewritten);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tier-picker">Tier</Label>
        <Select
          value={currentTier ?? TIER_NONE}
          onValueChange={handleTierChange}
        >
          <SelectTrigger id="tier-picker">
            <SelectValue placeholder="Select tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TIER_NONE}>(no tier)</SelectItem>
            <SelectItem value="orchestrator">Orchestrator</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="implementer">Implementer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tierWarnings.map((warning) => {
        const fixMode: 'add-agent' | 'remove-agent' | null =
          warning.code === 'tier.lead-missing-agent-tool'
            ? 'add-agent'
            : warning.code === 'tier.implementer-has-agent-tool'
              ? 'remove-agent'
              : null;
        const fixLabel = fixMode === 'add-agent' ? 'Fix: add Agent tool' : 'Fix: remove Agent tool';
        return (
          <Alert key={warning.code} variant="destructive" className="border-yellow-500/50 text-yellow-400">
            <AlertDescription className="flex flex-col gap-2">
              <span className="text-xs leading-relaxed">{warning.message}</span>
              {fixMode !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleFix(fixMode)}
                >
                  {fixLabel}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        );
      })}

      <div className="flex flex-col gap-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Description
        </Label>
        <p className="text-xs text-foreground">
          {description.length === 0 ? '(none)' : description}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Tools
        </Label>
        {tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">(none)</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <Badge key={tool} variant="secondary" className="text-[10px]">
                {tool}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {model !== null && (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Model
          </Label>
          <p className="font-mono text-xs text-foreground">{model}</p>
        </div>
      )}

      {effort !== null && (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Effort
          </Label>
          <p className="font-mono text-xs text-foreground">{effort}</p>
        </div>
      )}
    </div>
  );
}
