import { z } from 'zod';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.ts';

/**
 * Agent filename slug regex. Single source of truth for the agent-name shape.
 * Reused by `agentFrontmatterSchema.name` and by IPC request schemas
 * (`agents:read`, `agents:write`, `agents:create`, `agents:delete`).
 */
export const agentNameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'agent name must be lowercase letters, digits, and hyphens, starting alphanumeric',
  );

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
    name: agentNameSchema,
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
  /** 1-indexed line within rawFrontmatter. Optional; omitted when unknown. */
  line?: number;
  /** 1-indexed column within rawFrontmatter. Optional; omitted when unknown. */
  col?: number;
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

/**
 * Framework-free diagnostic shape. The renderer wraps this with CodeMirror's
 * document model to compute `from`/`to` character offsets for its linter.
 */
export interface CodeMirrorDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-indexed line within the rawFrontmatter (excluding the leading `---` fence). */
  line: number;
  /** 1-indexed column; omitted when unknown. */
  col?: number;
  /** Zod issue code or tier-consistency code (`tier.lead-missing-agent-tool` etc.). */
  code: string;
}

/**
 * Map `AgentValidationIssue[]` to line-anchored `CodeMirrorDiagnostic[]` using
 * only string operations on the YAML text. Pure: no CM6 imports, no Node
 * imports, no yaml re-parsing.
 *
 * Line numbering: 1-indexed within `rawFrontmatter`, so line 1 is the first
 * YAML key line — the `---` fences are NOT part of `rawFrontmatter`.
 */
export function diagnosticsToCodeMirror(
  issues: AgentValidationIssue[],
  rawFrontmatter: string,
): CodeMirrorDiagnostic[] {
  const lines = rawFrontmatter.split(/\r?\n/);
  return issues.map((issue) => toDiagnostic(issue, lines));
}

function toDiagnostic(
  issue: AgentValidationIssue,
  lines: string[],
): CodeMirrorDiagnostic {
  const severity = mapSeverity(issue.level);
  const located = locateIssue(issue.path, lines);
  const base = {
    severity,
    message: issue.message,
    line: located.line,
    code: issue.code,
  };
  return located.col === undefined ? base : { ...base, col: located.col };
}

function mapSeverity(level: AgentValidationIssue['level']): CodeMirrorDiagnostic['severity'] {
  // Severity mapping per Schema Contract section:
  //   'error' -> 'error', 'warning' -> 'warning'. 'info' is reserved.
  return level === 'error' ? 'error' : 'warning';
}

interface LocatedIssue {
  line: number;
  col?: number;
}

function locateIssue(path: string | undefined, lines: string[]): LocatedIssue {
  if (path === undefined || path === '') {
    return { line: 1 };
  }

  const segments = path.split('.');
  const topKey = segments[0];
  if (topKey === undefined || topKey === '') {
    return { line: 1 };
  }

  const topLineIdx = findTopLevelKeyLine(topKey, lines);
  if (topLineIdx === -1) {
    return { line: 1 };
  }

  if (segments.length === 1) {
    return withKeyColumn(topKey, lines, topLineIdx);
  }

  const childSegment = segments[1];
  if (childSegment === undefined) {
    return withKeyColumn(topKey, lines, topLineIdx);
  }
  const childIndex = toNonNegativeInt(childSegment);
  if (childIndex === undefined) {
    // Dotted but non-numeric (e.g., nested map key) — fall back to parent line.
    return withKeyColumn(topKey, lines, topLineIdx);
  }

  const listItemLine = findNthListItemLine(lines, topLineIdx, childIndex);
  if (listItemLine === -1) {
    return withKeyColumn(topKey, lines, topLineIdx);
  }

  const listLine = lines[listItemLine];
  if (listLine === undefined) {
    return { line: listItemLine + 1 };
  }
  const dashIdx = listLine.indexOf('-');
  if (dashIdx === -1) {
    return { line: listItemLine + 1 };
  }
  return { line: listItemLine + 1, col: dashIdx + 1 };
}

function withKeyColumn(key: string, lines: string[], lineIdx: number): LocatedIssue {
  const line = lines[lineIdx];
  if (line === undefined) {
    return { line: lineIdx + 1 };
  }
  const keyStart = line.indexOf(key);
  if (keyStart === -1) {
    return { line: lineIdx + 1 };
  }
  return { line: lineIdx + 1, col: keyStart + 1 };
}

/**
 * Find the 0-indexed line of a top-level YAML key (no leading indent).
 * Returns -1 when not found. Matches `^<key>\s*:` on a non-indented line.
 */
function findTopLevelKeyLine(key: string, lines: string[]): number {
  const escaped = escapeForRegex(key);
  const pattern = new RegExp(`^${escaped}\\s*:`);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    // Top-level means no leading whitespace.
    if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) continue;
    if (pattern.test(line)) return i;
  }
  return -1;
}

/**
 * Starting from the line AFTER `parentLineIdx`, find the 0-indexed line of the
 * Nth (0-based `index`) list item. List items are lines whose first
 * non-whitespace character is `-`. Stops when a new top-level key is
 * encountered. Returns -1 when the Nth item cannot be resolved.
 */
function findNthListItemLine(lines: string[], parentLineIdx: number, index: number): number {
  let seen = 0;
  for (let i = parentLineIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.length === 0) continue;
    const firstChar = line[0];
    // A new top-level key (non-indented, not a list item) ends the child scope.
    if (firstChar !== ' ' && firstChar !== '\t' && firstChar !== '-') {
      return -1;
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith('-')) {
      if (seen === index) return i;
      seen += 1;
    }
  }
  return -1;
}

function toNonNegativeInt(segment: string): number | undefined {
  if (segment.length === 0) return undefined;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment.charCodeAt(i);
    if (ch < 48 || ch > 57) return undefined;
  }
  const n = Number(segment);
  return Number.isFinite(n) ? n : undefined;
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
