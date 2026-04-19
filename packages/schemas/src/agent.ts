import { z } from 'zod';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.ts';

export const claudeBuiltinTools = [
  'Agent',
  'Bash',
  'Edit',
  'Glob',
  'Grep',
  'Read',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'ExitPlanMode',
  'AskUserQuestion',
] as const;

export type ClaudeBuiltinTool = (typeof claudeBuiltinTools)[number];

export const permissionModeSchema = z.enum([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
]);

export const agentModelSchema = z.union([
  z.enum(['sonnet', 'opus', 'haiku', 'inherit']),
  z.string().min(1),
]);

export const agentMemoryScopeSchema = z.enum(['user', 'project', 'local']);
export const agentIsolationSchema = z.enum(['worktree']);
export const agentEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * App-specific tier annotation. Claude Code ignores unknown frontmatter keys,
 * so this is safe to persist. Drives UI validation + visualizer edge styling.
 */
export const agentTierSchema = z.enum(['orchestrator', 'lead', 'implementer']);
export type AgentTier = z.infer<typeof agentTierSchema>;

const toolListSchema = z.union([z.string(), z.array(z.string())]).transform((value) =>
  Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
);

export const agentFrontmatterSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'name must be lowercase letters, digits, and hyphens'),
    description: z.string().min(1, 'description is required'),
    tools: toolListSchema.optional(),
    disallowedTools: toolListSchema.optional(),
    model: agentModelSchema.optional(),
    maxTurns: z.number().int().positive().optional(),
    permissionMode: permissionModeSchema.optional(),
    mcpServers: z.array(z.string()).optional(),
    memory: agentMemoryScopeSchema.optional(),
    isolation: agentIsolationSchema.optional(),
    effort: agentEffortSchema.optional(),
    color: z.string().optional(),
    initialPrompt: z.string().optional(),
    skills: z.array(z.string()).optional(),
    'x-tier': agentTierSchema.optional(),
  })
  .passthrough();

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

export interface AgentFile {
  path: string;
  frontmatter: AgentFrontmatter;
  body: string;
}

export interface AgentValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export function parseAgentFile(raw: string): {
  frontmatter: AgentFrontmatter;
  body: string;
  issues: AgentValidationIssue[];
} {
  const { frontmatter, body } = parseFrontmatter(raw);
  const result = agentFrontmatterSchema.safeParse(frontmatter);
  const issues: AgentValidationIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        level: 'error',
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      });
    }
    return {
      frontmatter: (frontmatter ?? {}) as AgentFrontmatter,
      body,
      issues,
    };
  }

  issues.push(...validateTierConsistency(result.data));
  return { frontmatter: result.data, body, issues };
}

/**
 * Warn when x-tier declared role doesn't match tool grant pattern.
 * Rationale: Claude Code subagents can't natively spawn further subagents.
 * Buster-style 3-tier works only if Leads have the Agent tool; Implementers
 * should not (accidental deep nesting).
 */
export function validateTierConsistency(fm: AgentFrontmatter): AgentValidationIssue[] {
  const tier = fm['x-tier'];
  if (!tier) return [];
  const tools = fm.tools ?? [];
  const hasAgentTool = tools.includes('Agent');
  const issues: AgentValidationIssue[] = [];

  if (tier === 'lead' && !hasAgentTool) {
    issues.push({
      level: 'warning',
      code: 'tier.lead-missing-agent-tool',
      message:
        'Lead agents should include the Agent tool so they can invoke implementers. Without it, orchestration will silently run flat.',
      path: 'tools',
    });
  }
  if (tier === 'implementer' && hasAgentTool) {
    issues.push({
      level: 'warning',
      code: 'tier.implementer-has-agent-tool',
      message:
        'Implementer agents typically should not have the Agent tool. Granting it enables deep nesting that breaks the 3-tier contract.',
      path: 'tools',
    });
  }
  return issues;
}

export function serializeAgentFile(frontmatter: AgentFrontmatter, body: string): string {
  return serializeFrontmatter(frontmatter, body);
}
