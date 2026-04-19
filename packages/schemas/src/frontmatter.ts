import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_DELIM = '---';

export interface ParsedFrontmatter<T = unknown> {
  frontmatter: T;
  body: string;
  rawFrontmatter: string;
}

export class FrontmatterParseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FrontmatterParseError';
  }
}

export function parseFrontmatter<T = unknown>(source: string): ParsedFrontmatter<T> {
  const normalized = source.replace(/^\uFEFF/, '');
  if (
    !normalized.startsWith(`${FRONTMATTER_DELIM}\n`) &&
    !normalized.startsWith(`${FRONTMATTER_DELIM}\r\n`)
  ) {
    throw new FrontmatterParseError('File does not start with YAML frontmatter delimiter "---"');
  }

  const afterOpen = normalized.slice(FRONTMATTER_DELIM.length).replace(/^\r?\n/, '');
  const closeMatch = afterOpen.match(/\r?\n---\r?\n?/);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new FrontmatterParseError('Closing frontmatter delimiter "---" not found');
  }

  const rawFrontmatter = afterOpen.slice(0, closeMatch.index);
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length);

  let frontmatter: T;
  try {
    frontmatter = (parseYaml(rawFrontmatter) ?? {}) as T;
  } catch (err) {
    throw new FrontmatterParseError('Invalid YAML in frontmatter', err);
  }

  return { frontmatter, body, rawFrontmatter };
}

export function serializeFrontmatter(frontmatter: unknown, body: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const trimmedBody = body.startsWith('\n') ? body : `\n${body}`;
  return `${FRONTMATTER_DELIM}\n${yaml}\n${FRONTMATTER_DELIM}${trimmedBody}`;
}
