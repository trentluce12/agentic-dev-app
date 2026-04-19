import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  agentFrontmatterSchema,
  agentNameSchema,
  parseAgentFile,
  parseFrontmatter,
  serializeAgentFile,
  settingsSchema,
} from '@agentic-dev-app/schemas';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';
import type { AgentFile, AgentSummary, ProjectSummary } from '../../shared/ipc.ts';
import type { AppDatabase } from '../db/index.ts';
import { schema } from '../db/index.ts';
import type { FsWatcherHandle } from '../fs-watcher.ts';
import type { HookServerHandle } from '../hook-server.ts';

export interface IpcContext {
  db: AppDatabase;
  hookServer: HookServerHandle;
  fsWatcher: FsWatcherHandle;
}

const agentsListRequestSchema = z.object({ projectPath: z.string().min(1) });
const agentsReadRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
});
const agentsDeleteRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
});
const agentsCreateRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
  frontmatter: agentFrontmatterSchema,
  body: z.string().default(''),
});
const agentsWriteRequestSchema = z.object({
  projectPath: z.string().min(1),
  agentName: agentNameSchema,
  file: z.object({
    path: z.string().min(1),
    relativePath: z.string().min(1),
    frontmatter: agentFrontmatterSchema,
    body: z.string(),
  }),
});

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle('app:getVersion', () => process.env.npm_package_version ?? '0.0.0');

  ipcMain.handle('projects:open', async (event): Promise<ProjectSummary | null> => {
    const parentWindow =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Open project',
      properties: ['openDirectory'],
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const projectPath = result.filePaths[0];
    const summary = await scanProject(projectPath);
    ctx.db.raw
      .prepare(
        'INSERT INTO recent_projects (path, name, opened_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET opened_at = excluded.opened_at',
      )
      .run(summary.path, summary.name, Date.now());
    ctx.fsWatcher.watch(projectPath);
    return summary;
  });

  ipcMain.handle('projects:recent', async (): Promise<ProjectSummary[]> => {
    const rows = ctx.db.raw
      .prepare('SELECT path, name, opened_at FROM recent_projects ORDER BY opened_at DESC LIMIT 20')
      .all() as Array<{ path: string; name: string; opened_at: number }>;
    return Promise.all(
      rows.map(async (r) => ({
        path: r.path,
        name: r.name,
        hasClaudeDir: await pathExists(join(r.path, '.claude')),
        agentCount: await countAgents(r.path),
        openedAt: r.opened_at,
      })),
    );
  });

  ipcMain.handle('projects:scan', async (_e, projectPath: string) => scanProject(projectPath));

  ipcMain.handle('agents:list', async (_e, projectPath: unknown): Promise<AgentSummary[]> => {
    const parsed = agentsListRequestSchema.parse({ projectPath });
    const agentsDir = join(parsed.projectPath, '.claude', 'agents');
    if (!(await pathExists(agentsDir))) return [];
    const entries = await readdir(agentsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md') && !f.endsWith('.md.tmp'));
    const summaries: AgentSummary[] = [];
    for (const file of mdFiles) {
      const absPath = join(agentsDir, file);
      const lastModified = await safeMtimeMs(absPath);
      try {
        const raw = await readFile(absPath, 'utf8');
        const { frontmatter, issues } = parseAgentFile(raw);
        const summary: AgentSummary = {
          path: absPath,
          relativePath: relative(parsed.projectPath, absPath),
          name: frontmatter.name ?? file.replace(/\.md$/, ''),
          description: frontmatter.description ?? '',
          tools: frontmatter.tools ?? [],
          hasIssues: issues.some((i) => i.level === 'error'),
          lastModified,
        };
        const tier = frontmatter['x-tier'];
        if (tier) summary.tier = tier;
        if (typeof frontmatter.model === 'string') summary.model = frontmatter.model;
        summaries.push(summary);
      } catch {
        summaries.push({
          path: absPath,
          relativePath: relative(parsed.projectPath, absPath),
          name: file.replace(/\.md$/, ''),
          description: '(parse error)',
          tools: [],
          hasIssues: true,
          lastModified,
        });
      }
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle(
    'agents:read',
    async (_e, projectPath: unknown, agentName: unknown): Promise<AgentFile> => {
      const parsed = agentsReadRequestSchema.parse({ projectPath, agentName });
      const absPath = join(parsed.projectPath, '.claude', 'agents', `${parsed.agentName}.md`);
      const raw = await readFile(absPath, 'utf8');
      const { rawFrontmatter } = parseFrontmatter(raw);
      const { frontmatter, body, issues } = parseAgentFile(raw);
      const st = await stat(absPath);
      return {
        path: absPath,
        relativePath: relative(parsed.projectPath, absPath),
        frontmatter,
        body,
        issues,
        mtimeMs: st.mtimeMs,
        rawFrontmatter,
      };
    },
  );

  ipcMain.handle(
    'agents:write',
    async (
      _e,
      projectPath: unknown,
      agentName: unknown,
      file: unknown,
    ): Promise<AgentFile> => {
      const parsed = agentsWriteRequestSchema.parse({ projectPath, agentName, file });
      if (parsed.agentName !== parsed.file.frontmatter.name) {
        throw new Error(
          `agent name mismatch: request.agentName=${parsed.agentName} file.frontmatter.name=${parsed.file.frontmatter.name}`,
        );
      }
      const agentsDir = join(parsed.projectPath, '.claude', 'agents');
      const absPath = join(agentsDir, `${parsed.agentName}.md`);
      await mkdir(agentsDir, { recursive: true });
      const content = serializeAgentFile(parsed.file.frontmatter, parsed.file.body);
      await atomicWriteFile(absPath, content);
      const raw = await readFile(absPath, 'utf8');
      const { rawFrontmatter } = parseFrontmatter(raw);
      const reparsed = parseAgentFile(raw);
      const st = await stat(absPath);
      return {
        path: absPath,
        relativePath: relative(parsed.projectPath, absPath),
        frontmatter: reparsed.frontmatter,
        body: reparsed.body,
        issues: reparsed.issues,
        mtimeMs: st.mtimeMs,
        rawFrontmatter,
      };
    },
  );

  ipcMain.handle(
    'agents:create',
    async (
      _e,
      projectPath: unknown,
      agentName: unknown,
      frontmatter: unknown,
      body: unknown,
    ): Promise<AgentFile> => {
      const parsed = agentsCreateRequestSchema.parse({
        projectPath,
        agentName,
        frontmatter,
        body,
      });
      if (parsed.agentName !== parsed.frontmatter.name) {
        throw new Error(
          `agent name mismatch: request.agentName=${parsed.agentName} file.frontmatter.name=${parsed.frontmatter.name}`,
        );
      }
      const agentsDir = join(parsed.projectPath, '.claude', 'agents');
      const absPath = join(agentsDir, `${parsed.agentName}.md`);
      if (await pathExists(absPath)) {
        throw new Error(`agent already exists: ${parsed.agentName}`);
      }
      await mkdir(agentsDir, { recursive: true });
      const content = serializeAgentFile(parsed.frontmatter, parsed.body);
      await atomicWriteFile(absPath, content);
      const raw = await readFile(absPath, 'utf8');
      const { rawFrontmatter } = parseFrontmatter(raw);
      const reparsed = parseAgentFile(raw);
      const st = await stat(absPath);
      return {
        path: absPath,
        relativePath: relative(parsed.projectPath, absPath),
        frontmatter: reparsed.frontmatter,
        body: reparsed.body,
        issues: reparsed.issues,
        mtimeMs: st.mtimeMs,
        rawFrontmatter,
      };
    },
  );

  ipcMain.handle(
    'agents:delete',
    async (_e, projectPath: unknown, agentName: unknown): Promise<void> => {
      const parsed = agentsDeleteRequestSchema.parse({ projectPath, agentName });
      const absPath = join(parsed.projectPath, '.claude', 'agents', `${parsed.agentName}.md`);
      if (!(await pathExists(absPath))) {
        throw new Error(`agent not found: ${parsed.agentName}`);
      }
      await unlink(absPath);
    },
  );

  ipcMain.handle('settings:read', async (_e, projectPath: string) => {
    const settingsPath = join(projectPath, '.claude', 'settings.json');
    if (!(await pathExists(settingsPath))) return {};
    const raw = await readFile(settingsPath, 'utf8');
    return settingsSchema.parse(JSON.parse(raw));
  });

  ipcMain.handle('settings:write', async (_e, projectPath: string, settings: unknown) => {
    const parsed = settingsSchema.parse(settings);
    const settingsPath = join(projectPath, '.claude', 'settings.json');
    await writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    return parsed;
  });

  ipcMain.handle('sessions:launch', async () => {
    throw new Error('sessions:launch not yet implemented — Phase 1 next slice');
  });

  // Keep references live so they are not GC'd.
  void ctx.hookServer;
  void ctx.db;
  void schema;
}

async function scanProject(projectPath: string): Promise<ProjectSummary> {
  const hasClaudeDir = await pathExists(join(projectPath, '.claude'));
  return {
    path: projectPath,
    name: basename(projectPath),
    hasClaudeDir,
    agentCount: await countAgents(projectPath),
    openedAt: Date.now(),
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeMtimeMs(p: string): Promise<number> {
  try {
    const st = await stat(p);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}

async function countAgents(projectPath: string): Promise<number> {
  const dir = join(projectPath, '.claude', 'agents');
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith('.md') && !f.endsWith('.md.tmp')).length;
  } catch {
    return 0;
  }
}

/**
 * Atomic write: write to <absPath>.tmp, fsync the handle, close, then rename.
 * On NTFS and APFS, rename within the same volume replaces the target atomically.
 * On any error between open and successful rename, best-effort unlink the tmp
 * file before rethrowing.
 */
async function atomicWriteFile(absPath: string, content: string): Promise<void> {
  const tmpPath = `${absPath}.tmp`;
  try {
    const handle = await open(tmpPath, 'w');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, absPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {
      // Best-effort cleanup; the original error is the important one.
    });
    throw err;
  }
}
