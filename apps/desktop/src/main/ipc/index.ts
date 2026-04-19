import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  agentFrontmatterSchema,
  parseAgentFile,
  serializeAgentFile,
  settingsSchema,
} from '@agentic-dev-app/schemas';
import { dialog, ipcMain } from 'electron';
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

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle('app:getVersion', () => process.env.npm_package_version ?? '0.0.0');

  ipcMain.handle('projects:open', async (): Promise<ProjectSummary | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Open project',
      properties: ['openDirectory'],
    });
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

  ipcMain.handle('agents:list', async (_e, projectPath: string): Promise<AgentSummary[]> => {
    const agentsDir = join(projectPath, '.claude', 'agents');
    if (!(await pathExists(agentsDir))) return [];
    const entries = await readdir(agentsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));
    const summaries: AgentSummary[] = [];
    for (const file of mdFiles) {
      const absPath = join(agentsDir, file);
      try {
        const raw = await readFile(absPath, 'utf8');
        const { frontmatter, issues } = parseAgentFile(raw);
        const summary: AgentSummary = {
          path: absPath,
          relativePath: relative(projectPath, absPath),
          name: frontmatter.name ?? file.replace(/\.md$/, ''),
          description: frontmatter.description ?? '',
          tools: frontmatter.tools ?? [],
          hasIssues: issues.some((i) => i.level === 'error'),
        };
        const tier = frontmatter['x-tier'];
        if (tier) summary.tier = tier;
        if (typeof frontmatter.model === 'string') summary.model = frontmatter.model;
        summaries.push(summary);
      } catch {
        summaries.push({
          path: absPath,
          relativePath: relative(projectPath, absPath),
          name: file.replace(/\.md$/, ''),
          description: '(parse error)',
          tools: [],
          hasIssues: true,
        });
      }
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  });

  ipcMain.handle(
    'agents:read',
    async (_e, projectPath: string, agentName: string): Promise<AgentFile> => {
      const absPath = join(projectPath, '.claude', 'agents', `${agentName}.md`);
      const raw = await readFile(absPath, 'utf8');
      const { frontmatter, body, issues } = parseAgentFile(raw);
      const st = await stat(absPath);
      return {
        path: absPath,
        relativePath: relative(projectPath, absPath),
        frontmatter,
        body,
        issues,
        mtimeMs: st.mtimeMs,
      };
    },
  );

  ipcMain.handle(
    'agents:write',
    async (
      _e,
      projectPath: string,
      agentName: string,
      file: Omit<AgentFile, 'issues' | 'mtimeMs'>,
    ) => {
      const parsed = agentFrontmatterSchema.parse(file.frontmatter);
      const absPath = join(projectPath, '.claude', 'agents', `${agentName}.md`);
      const content = serializeAgentFile(parsed, file.body);
      await writeFile(absPath, content, 'utf8');
      const st = await stat(absPath);
      return {
        path: absPath,
        relativePath: relative(projectPath, absPath),
        frontmatter: parsed,
        body: file.body,
        issues: [],
        mtimeMs: st.mtimeMs,
      } satisfies AgentFile;
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

async function countAgents(projectPath: string): Promise<number> {
  const dir = join(projectPath, '.claude', 'agents');
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}
