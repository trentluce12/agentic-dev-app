import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AgentFile, AgentSummary } from '../../shared/ipc.ts';
import type { IpcContext } from './index.ts';
import { registerIpcHandlers } from './index.ts';

// --- Hoisted mock scaffolding ---------------------------------------------
// `vi.mock` factories run BEFORE top-level imports. `vi.hoisted` lets the
// factory and the test body share the same references.
// ---------------------------------------------------------------------------
type HandlerFn = (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown;

const { capturedHandlers, renameMock } = vi.hoisted(() => ({
  capturedHandlers: new Map<string, HandlerFn>(),
  renameMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: HandlerFn) => {
      capturedHandlers.set(channel, handler);
    },
  },
  dialog: {},
  app: { getPath: () => tmpdir() },
}));

// Stub the db module so the test process doesn't load better-sqlite3 (which is
// built against Electron's Node ABI, not the system Node that Vitest uses).
// Agent IPC handlers never invoke db methods; a bare `schema` export keeps the
// `void schema;` reference in registerIpcHandlers happy.
vi.mock('../db/index.ts', () => ({
  schema: {},
}));

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    default: actual,
    rename: (from: string, to: string) => renameMock(from, to),
  };
});

// --- Fixture location -----------------------------------------------------
const thisDir = dirname(fileURLToPath(import.meta.url));
const fixtureAgentsDir = join(
  thisDir,
  '..',
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'project-basic',
  '.claude',
  'agents',
);

// --- Ctx stub --------------------------------------------------------------
// Agent IPC handlers do NOT read from ctx; registration is a closure-reference
// operation only. HookServerHandle and FsWatcherHandle have small enough
// public surfaces to satisfy structurally. AppDatabase is an intersection of
// drizzle's deeply-generated type with `close` / `raw` — impractical to spell
// out, so the stub object is introduced with `@ts-expect-error` at the
// assignment site. If a non-agent handler is ever invoked during these tests,
// accessing a missing method blows up at runtime (the intended safety net).
const hookServerStub: IpcContext['hookServer'] = {
  url: '',
  token: '',
  port: 0,
  stop: async () => undefined,
  onEvent: () => () => undefined,
};

const fsWatcherStub: IpcContext['fsWatcher'] = {
  watch: () => undefined,
  unwatch: () => undefined,
  stop: async () => undefined,
  onChange: () => () => undefined,
};

const dbStub = {
  close: () => undefined,
  raw: {
    prepare: () => ({ run: () => undefined, all: () => [], get: () => undefined }),
  },
};

// AppDatabase is a drizzle intersection impractical to spell out in a test.
// Agent handlers never dereference ctx.db, so a minimal prepare() stub is
// sufficient to keep registerIpcHandlers happy.
const stubCtx: IpcContext = {
  // @ts-expect-error — minimal db stub; see comment above.
  db: dbStub,
  hookServer: hookServerStub,
  fsWatcher: fsWatcherStub,
};

// --- Register handlers once -----------------------------------------------
beforeAll(() => {
  registerIpcHandlers(stubCtx);
});

// --- Per-test temp dir + default rename passthrough -----------------------
let projectPath = '';
let agentsDir = '';

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>(
    'node:fs/promises',
  );
  renameMock.mockImplementation(actual.rename);

  projectPath = await mkdtemp(join(tmpdir(), 'agents-ipc-test-'));
  agentsDir = join(projectPath, '.claude', 'agents');
  await mkdir(agentsDir, { recursive: true });
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
  renameMock.mockReset();
});

afterAll(() => {
  capturedHandlers.clear();
});

// --- Handler invocation helpers -------------------------------------------
function getHandler(channel: string): HandlerFn {
  const h = capturedHandlers.get(channel);
  if (!h) throw new Error(`handler not registered for channel: ${channel}`);
  return h;
}

async function invokeList(path: string): Promise<AgentSummary[]> {
  const result = await getHandler('agents:list')({}, path);
  return result as AgentSummary[];
}

async function invokeRead(path: string, name: string): Promise<AgentFile> {
  const result = await getHandler('agents:read')({}, path, name);
  return result as AgentFile;
}

type WritableFile = Omit<AgentFile, 'issues' | 'mtimeMs' | 'rawFrontmatter'>;

async function invokeWrite(
  path: string,
  name: string,
  file: WritableFile,
): Promise<AgentFile> {
  const result = await getHandler('agents:write')({}, path, name, file);
  return result as AgentFile;
}

async function invokeCreate(
  path: string,
  name: string,
  frontmatter: unknown,
  body: string,
): Promise<AgentFile> {
  const result = await getHandler('agents:create')({}, path, name, frontmatter, body);
  return result as AgentFile;
}

async function invokeDelete(path: string, name: string): Promise<void> {
  await getHandler('agents:delete')({}, path, name);
}

async function seedFixture(filename: string, targetName?: string): Promise<void> {
  const raw = await readFile(join(fixtureAgentsDir, filename), 'utf8');
  await writeFile(join(agentsDir, targetName ?? filename), raw, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agents:list IPC handler', () => {
  it('agents:list returns sorted summaries including hasIssues for malformed file', async () => {
    await seedFixture('valid-lead.md');
    await seedFixture('malformed-yaml.md');
    await seedFixture('passthrough-note.md');

    const summaries = await invokeList(projectPath);
    expect(summaries.map((s) => s.name)).toEqual([
      'malformed-yaml',
      'passthrough-note',
      'valid-lead',
    ]);
    const malformed = summaries.find((s) => s.name === 'malformed-yaml');
    expect(malformed).toBeDefined();
    if (!malformed) throw new Error('unreachable');
    expect(malformed.hasIssues).toBe(true);
    expect(malformed.description).toBe('(parse error)');
  });

  it('agents:list returns empty array when .claude/agents directory is missing', async () => {
    await rm(agentsDir, { recursive: true });
    const summaries = await invokeList(projectPath);
    expect(summaries).toEqual([]);
  });

  it('agents:list filters out .md.tmp files', async () => {
    await seedFixture('valid-lead.md');
    await writeFile(join(agentsDir, 'stale.md.tmp'), '---\nname: stale\n---\nx', 'utf8');

    const summaries = await invokeList(projectPath);
    expect(summaries.map((s) => s.name)).toEqual(['valid-lead']);
  });
});

describe('agents:read IPC handler', () => {
  it('agents:read returns AgentFile with rawFrontmatter and mtimeMs', async () => {
    await seedFixture('valid-lead.md');

    const file = await invokeRead(projectPath, 'valid-lead');
    expect(file.frontmatter.name).toBe('valid-lead');
    expect(file.rawFrontmatter).toContain('name: valid-lead');
    expect(file.mtimeMs).toBeGreaterThan(0);
    expect(file.body).toContain('# valid-lead');
    expect(file.issues).toEqual([]);
  });

  it('agents:read throws when agent file does not exist', async () => {
    await expect(invokeRead(projectPath, 'does-not-exist')).rejects.toThrow();
  });
});

describe('agents:write IPC handler', () => {
  it('agents:write writes file and re-reading produces same content', async () => {
    const fm = {
      name: 'new-agent',
      description: 'a newly-written agent',
      tools: ['Read'],
    };
    const written = await invokeWrite(projectPath, 'new-agent', {
      path: join(agentsDir, 'new-agent.md'),
      relativePath: '.claude/agents/new-agent.md',
      frontmatter: fm,
      body: '# new-agent\n\nbody text\n',
    });
    expect(written.frontmatter.name).toBe('new-agent');
    expect(written.body).toContain('# new-agent');

    const reread = await invokeRead(projectPath, 'new-agent');
    expect(reread.frontmatter).toEqual(written.frontmatter);
    expect(reread.body).toEqual(written.body);
  });

  it('agents:write preserves passthrough key custom-note on round trip', async () => {
    const fm = {
      name: 'pt-agent',
      description: 'roundtrips passthrough',
      tools: ['Read'],
      'custom-note': 'hello',
    };
    const written = await invokeWrite(projectPath, 'pt-agent', {
      path: join(agentsDir, 'pt-agent.md'),
      relativePath: '.claude/agents/pt-agent.md',
      frontmatter: fm,
      body: '# body\n',
    });
    const rawFile = await readFile(join(agentsDir, 'pt-agent.md'), 'utf8');
    expect(rawFile).toContain('custom-note: hello');
    // The response frontmatter type is the passthrough-extended AgentFrontmatter;
    // passthrough keys are preserved as unknown-typed fields on the parsed object.
    const returnedFm: Record<string, unknown> = written.frontmatter;
    expect(returnedFm['custom-note']).toBe('hello');
  });

  it('agents:write rejects Zod-invalid frontmatter without mutating the file', async () => {
    // Seed the fixture first — we need to assert the file is unchanged after
    // the failed write.
    await seedFixture('valid-lead.md');
    const absPath = join(agentsDir, 'valid-lead.md');
    const before = await readFile(absPath, 'utf8');

    const invalidFm = {
      name: 'valid-lead',
      // description missing — Zod schema requires min(1).
      tools: ['Read'],
    };
    await expect(
      invokeWrite(projectPath, 'valid-lead', {
        path: absPath,
        relativePath: '.claude/agents/valid-lead.md',
        // @ts-expect-error — deliberately invalid frontmatter for negative test
        frontmatter: invalidFm,
        body: '# valid-lead',
      }),
    ).rejects.toThrow();

    const after = await readFile(absPath, 'utf8');
    expect(after).toEqual(before);
  });

  it('agents:write throws on agent name mismatch when agentName != frontmatter.name', async () => {
    await expect(
      invokeWrite(projectPath, 'outer-name', {
        path: join(agentsDir, 'outer-name.md'),
        relativePath: '.claude/agents/outer-name.md',
        frontmatter: {
          name: 'inner-name',
          description: 'mismatched',
          tools: ['Read'],
        },
        body: '# x\n',
      }),
    ).rejects.toThrow(/agent name mismatch/i);
  });

  it('agents:write cleans up .tmp file when rename fails', async () => {
    renameMock.mockRejectedValueOnce(new Error('EPERM: synthetic rename failure'));

    const absPath = join(agentsDir, 'rename-fail.md');
    const tmpPath = `${absPath}.tmp`;

    await expect(
      invokeWrite(projectPath, 'rename-fail', {
        path: absPath,
        relativePath: '.claude/agents/rename-fail.md',
        frontmatter: {
          name: 'rename-fail',
          description: 'exercises atomic write failure cleanup',
          tools: ['Read'],
        },
        body: '# x\n',
      }),
    ).rejects.toThrow(/synthetic rename failure/);

    // .tmp MUST be cleaned up after the rename fails.
    await expect(stat(tmpPath)).rejects.toMatchObject({ code: 'ENOENT' });
    // Real destination file must not exist either — rename never succeeded.
    await expect(stat(absPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('agents:create IPC handler', () => {
  it('agents:create writes a new agent file and returns its AgentFile', async () => {
    const file = await invokeCreate(
      projectPath,
      'fresh-agent',
      {
        name: 'fresh-agent',
        description: 'brand new',
        tools: ['Read'],
      },
      '# fresh-agent\n',
    );
    expect(file.frontmatter.name).toBe('fresh-agent');
    const onDisk = await readFile(join(agentsDir, 'fresh-agent.md'), 'utf8');
    expect(onDisk).toContain('name: fresh-agent');
  });

  it('agents:create throws agent already exists when file is present', async () => {
    await seedFixture('valid-lead.md');
    await expect(
      invokeCreate(
        projectPath,
        'valid-lead',
        { name: 'valid-lead', description: 'dup', tools: ['Read'] },
        '# dup\n',
      ),
    ).rejects.toThrow(/already exists/i);
  });
});

describe('agents:delete IPC handler', () => {
  it('agents:delete removes existing agent file', async () => {
    await seedFixture('valid-lead.md');
    await invokeDelete(projectPath, 'valid-lead');
    await expect(stat(join(agentsDir, 'valid-lead.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('agents:delete throws agent not found on missing file', async () => {
    await expect(invokeDelete(projectPath, 'does-not-exist')).rejects.toThrow(
      /agent not found/i,
    );
  });
});
