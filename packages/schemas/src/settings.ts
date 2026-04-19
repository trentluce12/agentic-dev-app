import { z } from 'zod';
import { hooksMapSchema } from './hooks.ts';

export const mcpServerStdioSchema = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export const mcpServerHttpSchema = z.object({
  type: z.enum(['http', 'sse']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const mcpServerSchema = z.union([mcpServerStdioSchema, mcpServerHttpSchema]);
export type McpServer = z.infer<typeof mcpServerSchema>;

export const settingsPermissionsSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  ask: z.array(z.string()).optional(),
});

export const settingsSchema = z
  .object({
    model: z.string().optional(),
    agent: z.string().optional(),
    permissionMode: z.string().optional(),
    permissions: settingsPermissionsSchema.optional(),
    hooks: hooksMapSchema.optional(),
    mcpServers: z.record(mcpServerSchema).optional(),
    env: z.record(z.string()).optional(),
    statusLine: z
      .object({
        type: z.enum(['command']).optional(),
        command: z.string().optional(),
      })
      .optional(),
    includeCoAuthoredBy: z.boolean().optional(),
    cleanupPeriodDays: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type Settings = z.infer<typeof settingsSchema>;
