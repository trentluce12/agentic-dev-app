import type { Dirent } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const thisDir = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(thisDir, '..', '..');
const srcRoot = join(appRoot, 'src');
const mainRoot = join(srcRoot, 'main');
const mainIpcRoot = join(mainRoot, 'ipc');
const rendererRoot = join(srcRoot, 'renderer');

const SKIP_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  '.cache',
  '.claude',
  'fixtures',
]);

const SKIP_FILE_NAMES = new Set(['routeTree.gen.ts']);

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

async function safeReaddir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    // Directory missing or unreadable: treat as empty. This verifier sweeps
    // optional trees (e.g., renderer root on a main-only install) and should
    // never fail the suite because a skipped directory does not exist.
    return [];
  }
}

async function walk(
  dir: string,
  filter: (absPath: string) => boolean,
): Promise<string[]> {
  const out: string[] = [];
  const entries = await safeReaddir(dir);
  for (const entry of entries) {
    const name = entry.name;
    const abs = join(dir, name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (name === 'tests') {
        // Skip tests/fixtures specifically; still descend into sibling tests/* dirs.
        const inner = await safeReaddir(abs);
        for (const sub of inner) {
          if (sub.isDirectory() && sub.name === 'fixtures') continue;
          const subAbs = join(abs, sub.name);
          if (sub.isDirectory()) {
            const nested = await walk(subAbs, filter);
            out.push(...nested);
          } else if (sub.isFile() && filter(subAbs)) {
            out.push(subAbs);
          }
        }
        continue;
      }
      const nested = await walk(abs, filter);
      out.push(...nested);
    } else if (entry.isFile()) {
      if (SKIP_FILE_NAMES.has(name)) continue;
      if (filter(abs)) out.push(abs);
    }
  }
  return out;
}

function hasExt(exts: readonly string[]): (abs: string) => boolean {
  return (abs) => exts.some((e) => abs.endsWith(e));
}

function isTestFile(abs: string): boolean {
  return abs.endsWith('.test.ts') || abs.endsWith('.test.tsx');
}

function formatViolations(violations: Violation[]): string {
  if (violations.length === 0) return '';
  return violations
    .map((v) => {
      const rel = relative(appRoot, v.file).split(sep).join('/');
      return `  ${rel}:${v.line} — ${v.snippet.trim()}`;
    })
    .join('\n');
}

describe('contract verification', () => {
  it('every agents:* ipcMain.handle call in main/ipc/ is followed within 10 lines by a Zod .parse() call or schema reference', async () => {
    // Scope note: only enforced for handlers whose channel literal starts with 'agents:'.
    // Other handlers (projects:*, settings:*, sessions:*) are out of scope for task 0002.
    // TODO(0002): broaden to all scopes once their schemas land.
    const files = await walk(mainIpcRoot, hasExt(['.ts']));
    const violations: Violation[] = [];

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        if (!/\bipcMain\.handle\s*\(/.test(line)) continue;

        // Resolve channel literal: same line or within next 3 lines (multiline call form).
        const windowForChannel: string[] = [];
        for (let j = i; j < Math.min(lines.length, i + 4); j += 1) {
          const l = lines[j];
          if (l !== undefined) windowForChannel.push(l);
        }
        const channelMatch = windowForChannel.join('\n').match(/ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/);
        if (!channelMatch) continue;
        const channel = channelMatch[1];
        if (channel === undefined) continue;
        if (!channel.startsWith('agents:')) continue;

        // Validation window: 10 lines starting at the ipcMain.handle line.
        const windowEnd = Math.min(lines.length, i + 10);
        let ok = false;
        for (let j = i; j < windowEnd; j += 1) {
          const l = lines[j];
          if (l === undefined) continue;
          // Accept either a `<Ident>Schema.parse(` call or a reference to
          // a `<Ident>RequestSchema` token. This deliberately rejects
          // `JSON.parse(` and `parseInt(` because neither pattern matches.
          if (/\b\w*Schema\s*\.\s*parse\s*\(/.test(l)) {
            ok = true;
            break;
          }
          if (/\b\w*RequestSchema\b/.test(l)) {
            ok = true;
            break;
          }
        }
        if (!ok) {
          violations.push({
            file,
            line: i + 1,
            snippet: line,
          });
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `agents:* handlers missing Zod validation within 10 lines:\n${formatViolations(violations)}`
        : '',
    ).toEqual([]);
  });

  it('renderer directory contains zero imports from node: modules', async () => {
    const files = await walk(rendererRoot, hasExt(['.ts', '.tsx']));
    const violations: Violation[] = [];
    const re = /\bfrom\s+['"]node:/;

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        if (re.test(line)) {
          violations.push({ file, line: i + 1, snippet: line });
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `renderer imports from node: modules — renderer must never reach into Node APIs directly:\n${formatViolations(violations)}`
        : '',
    ).toEqual([]);
  });

  it('main directory contains zero imports from react or @tanstack/react-* packages', async () => {
    const files = await walk(mainRoot, hasExt(['.ts']));
    const violations: Violation[] = [];
    const re = /\bfrom\s+['"](react|@tanstack\/react-[^'"]+)['"]/;

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        if (re.test(line)) {
          violations.push({ file, line: i + 1, snippet: line });
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `main imports react / @tanstack/react-* — main must never depend on DOM types:\n${formatViolations(violations)}`
        : '',
    ).toEqual([]);
  });

  it('shared IpcEvent union contains no fs:changed string; no broadcast uses it', async () => {
    const files = await walk(srcRoot, (abs) => {
      if (isTestFile(abs)) return false;
      return abs.endsWith('.ts') || abs.endsWith('.tsx');
    });
    const violations: Violation[] = [];
    const re = /'fs:changed'/;

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        if (re.test(line)) {
          violations.push({ file, line: i + 1, snippet: line });
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `'fs:changed' string literal present — IpcEvent was expanded to per-kind variants and the untyped broadcast was removed:\n${formatViolations(violations)}`
        : '',
    ).toEqual([]);
  });
});
