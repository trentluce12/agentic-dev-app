import { z } from 'zod';

export const hookEventNameSchema = z.enum([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'Notification',
]);

export type HookEventName = z.infer<typeof hookEventNameSchema>;

export const hookKindSchema = z.enum(['command', 'http', 'prompt', 'agent']);

const baseHookFields = {
  matcher: z.string().optional(),
  timeout: z.number().int().positive().optional(),
};

export const commandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  ...baseHookFields,
});

export const httpHookSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT']).optional(),
  headers: z.record(z.string()).optional(),
  ...baseHookFields,
});

export const promptHookSchema = z.object({
  type: z.literal('prompt'),
  prompt: z.string().min(1),
  ...baseHookFields,
});

export const agentHookSchema = z.object({
  type: z.literal('agent'),
  agent: z.string().min(1),
  ...baseHookFields,
});

export const hookSchema = z.discriminatedUnion('type', [
  commandHookSchema,
  httpHookSchema,
  promptHookSchema,
  agentHookSchema,
]);

export type Hook = z.infer<typeof hookSchema>;

export const hooksMapSchema = z.record(hookEventNameSchema, z.array(hookSchema));
export type HooksMap = z.infer<typeof hooksMapSchema>;

/**
 * Payload envelope every hook receives. Common fields across all events.
 */
export const hookPayloadBaseSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: hookEventNameSchema,
});
export type HookPayloadBase = z.infer<typeof hookPayloadBaseSchema>;
