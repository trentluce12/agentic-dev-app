import type { AgentTier } from '@agentic-dev-app/schemas';

const TIER_KEY_RE = /^x-tier\s*:/;
const TOOLS_KEY_RE = /^tools\s*:/;

function splitPreservingNewlines(yaml: string): { lines: string[]; hasTrailingNewline: boolean } {
  const hasTrailingNewline = yaml.endsWith('\n');
  const raw = hasTrailingNewline ? yaml.slice(0, -1) : yaml;
  return { lines: raw.split('\n'), hasTrailingNewline };
}

function joinPreservingNewlines(lines: string[], hasTrailingNewline: boolean): string {
  const joined = lines.join('\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}

/**
 * Insert / update / delete the `x-tier` key in a YAML frontmatter string
 * without a full yaml.parse → yaml.stringify round-trip (which would reorder
 * keys and strip comments).
 *
 * - tier === null → delete the line if present; otherwise return unchanged.
 * - tier !== null, key present → replace line value.
 * - tier !== null, key absent → append as last line, preserving trailing
 *   newline if any.
 *
 * Never emits `x-tier: null` or `x-tier: undefined`.
 */
export function rewriteTierInYaml(yaml: string, tier: AgentTier | null): string {
  const { lines, hasTrailingNewline } = splitPreservingNewlines(yaml);
  const idx = lines.findIndex((line) => TIER_KEY_RE.test(line));

  if (tier === null) {
    if (idx === -1) return yaml;
    lines.splice(idx, 1);
    return joinPreservingNewlines(lines, hasTrailingNewline);
  }

  if (idx !== -1) {
    lines[idx] = `x-tier: ${tier}`;
    return joinPreservingNewlines(lines, hasTrailingNewline);
  }

  lines.push(`x-tier: ${tier}`);
  return joinPreservingNewlines(lines, hasTrailingNewline);
}

/**
 * Mutate the `tools:` line in a YAML frontmatter string to add or remove the
 * `Agent` tool. Best-effort: supports inline arrays (`tools: [Read, Grep]`)
 * and block lists (`tools:\n  - Read\n  - Grep`). If the structure is
 * ambiguous, returns the input unchanged and warns.
 */
export function rewriteToolsInYaml(yaml: string, mode: 'add-agent' | 'remove-agent'): string {
  const { lines, hasTrailingNewline } = splitPreservingNewlines(yaml);
  const headerIdx = lines.findIndex((line) => TOOLS_KEY_RE.test(line));

  if (headerIdx === -1) {
    if (mode === 'add-agent') {
      lines.push('tools: [Agent]');
      return joinPreservingNewlines(lines, hasTrailingNewline);
    }
    return yaml;
  }

  const headerLine = lines[headerIdx];
  if (headerLine === undefined) return yaml;

  // Inline array form: `tools: [a, b, c]`.
  const inlineMatch = headerLine.match(/^tools\s*:\s*\[(.*)\]\s*$/);
  if (inlineMatch) {
    const inner = inlineMatch[1] ?? '';
    const items = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const nextItems = mode === 'add-agent'
      ? items.includes('Agent')
        ? items
        : [...items, 'Agent']
      : items.filter((t) => t !== 'Agent');
    lines[headerIdx] = `tools: [${nextItems.join(', ')}]`;
    return joinPreservingNewlines(lines, hasTrailingNewline);
  }

  // CSV form: `tools: Read, Grep`.
  const csvMatch = headerLine.match(/^tools\s*:\s*(.+)$/);
  const isBlockHeader = /^tools\s*:\s*$/.test(headerLine);
  if (csvMatch && !isBlockHeader && !inlineMatch) {
    const value = (csvMatch[1] ?? '').trim();
    // If the value looks like a scalar string (contains comma OR no brackets OR not a known container), treat as CSV.
    if (!value.startsWith('[') && !value.startsWith('&') && !value.startsWith('*')) {
      const items = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const nextItems = mode === 'add-agent'
        ? items.includes('Agent')
          ? items
          : [...items, 'Agent']
        : items.filter((t) => t !== 'Agent');
      lines[headerIdx] = `tools: ${nextItems.join(', ')}`;
      return joinPreservingNewlines(lines, hasTrailingNewline);
    }
  }

  // Block-list form: `tools:` then indented `- item` lines.
  if (isBlockHeader) {
    const blockStart = headerIdx + 1;
    let blockEnd = blockStart;
    const itemLines: number[] = [];
    for (let i = blockStart; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === undefined) break;
      if (line.length === 0) {
        blockEnd = i;
        continue;
      }
      const firstChar = line[0];
      if (firstChar !== ' ' && firstChar !== '\t' && firstChar !== '-') {
        break;
      }
      const trimmed = line.trimStart();
      if (trimmed.startsWith('-')) {
        itemLines.push(i);
        blockEnd = i + 1;
      } else {
        blockEnd = i + 1;
      }
    }

    if (mode === 'add-agent') {
      const hasAgent = itemLines.some((lineIdx) => {
        const ln = lines[lineIdx];
        return ln !== undefined && /^\s*-\s*Agent\s*$/.test(ln);
      });
      if (hasAgent) return yaml;
      // Determine indent from first item, fall back to "  ".
      let indent = '  ';
      if (itemLines.length > 0) {
        const firstItemIdx = itemLines[0];
        if (firstItemIdx !== undefined) {
          const firstItem = lines[firstItemIdx];
          if (firstItem !== undefined) {
            const leading = firstItem.match(/^(\s*)-/);
            if (leading && leading[1] !== undefined) {
              indent = leading[1];
            }
          }
        }
      }
      lines.splice(blockEnd, 0, `${indent}- Agent`);
      return joinPreservingNewlines(lines, hasTrailingNewline);
    }

    // remove-agent: remove every line that matches `- Agent`.
    const toRemove: number[] = [];
    for (const lineIdx of itemLines) {
      const ln = lines[lineIdx];
      if (ln !== undefined && /^\s*-\s*Agent\s*$/.test(ln)) {
        toRemove.push(lineIdx);
      }
    }
    if (toRemove.length === 0) return yaml;
    // Remove in reverse so earlier indices stay valid.
    for (let i = toRemove.length - 1; i >= 0; i -= 1) {
      const idx = toRemove[i];
      if (idx !== undefined) {
        lines.splice(idx, 1);
      }
    }
    return joinPreservingNewlines(lines, hasTrailingNewline);
  }

  // Unknown shape (e.g., anchor/alias). Do nothing.
  console.warn('[agent-editor] rewriteToolsInYaml: ambiguous tools shape, leaving unchanged');
  return yaml;
}
