import { z } from 'zod';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.ts';

export const commandFrontmatterSchema = z
  .object({
    description: z.string().optional(),
    argumentHint: z.string().optional(),
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
  })
  .passthrough();

export type CommandFrontmatter = z.infer<typeof commandFrontmatterSchema>;

export function parseCommandFile(raw: string): { frontmatter: CommandFrontmatter; body: string } {
  const { frontmatter, body } = parseFrontmatter(raw);
  const result = commandFrontmatterSchema.safeParse(frontmatter ?? {});
  return {
    frontmatter: result.success ? result.data : ({} as CommandFrontmatter),
    body,
  };
}

export function serializeCommandFile(frontmatter: CommandFrontmatter, body: string): string {
  return serializeFrontmatter(frontmatter, body);
}
