/**
 * agent-editor E2E suite (task 0002, contract `.claude/contracts/0002-agent-editor.md`).
 *
 * Each test:
 *   1. copies `tests/fixtures/project-basic/` into a fresh `mkdtemp` directory
 *   2. launches Electron against the `electron-vite` build output (production
 *      bundle — never a packaged / signed build; see playwright.config.ts)
 *   3. stubs `dialog.showOpenDialog` in the main process so the UI's "Open
 *      project" button returns the fixture path WITHOUT touching the OS file
 *      dialog — this is the testability seam the brief requires
 *   4. clicks "Open project" in the renderer, which:
 *        - invokes the real `projects:open` handler (also registers the
 *          fs-watcher for the project so live-reload + conflict tests run
 *          against the real watcher code path),
 *        - calls `useProjectStore.getState().setCurrent(project)` via the
 *          Home route's `handleOpen`,
 *        - leaves the renderer in the exact state a user would experience.
 *   5. navigates to `/agents` (hash-routed) and exercises the scenarios
 *   6. closes Electron and removes the tmp dir in `afterEach`.
 *
 * Per test: one primary assertion; secondary assertions only support it.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const FIXTURE_SRC = resolve(REPO_ROOT, 'tests', 'fixtures', 'project-basic');
const AGENTS_DIR_RELATIVE = join('.claude', 'agents');

interface Launched {
  electronApp: ElectronApplication;
  page: Page;
  tmpPath: string;
  tmpRoot: string;
  userDataDir: string;
}

async function createFixtureCopy(): Promise<{ tmpRoot: string; dest: string }> {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'agent-editor-e2e-'));
  const dest = join(tmpRoot, 'project-basic');
  await cp(FIXTURE_SRC, dest, { recursive: true });
  return { tmpRoot, dest };
}

function stringEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

async function launchFresh(): Promise<Launched> {
  const { tmpRoot, dest: tmpPath } = await createFixtureCopy();
  // Isolated userData so SQLite + settings don't leak between tests.
  const userDataDir = await mkdtemp(join(tmpdir(), 'agent-editor-e2e-userdata-'));

  const electronApp = await electron.launch({
    args: [APP_ROOT, `--user-data-dir=${userDataDir}`],
    env: {
      ...stringEnv(),
      NODE_ENV: 'production',
      PLAYWRIGHT_TEST: '1',
    },
  });

  // Stub the OS "Open directory" dialog so clicking "Open project" in the UI
  // returns our fixture path without touching the real dialog.
  await electronApp.evaluate(
    ({ dialog }, targetPath: string) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [targetPath],
      })) as typeof dialog.showOpenDialog;
    },
    tmpPath,
  );

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Drive the real "Open project" flow. This:
  //   - calls the stubbed dialog → returns tmpPath,
  //   - runs the real `projects:open` handler (inserts into recent_projects,
  //     registers the fs-watcher for tmpPath),
  //   - triggers the Home route's handleOpen → setCurrent(project) on the
  //     Zustand project store.
  await page.getByRole('button', { name: /^Open project$/ }).first().click();

  // The store hydration happens asynchronously after the IPC call resolves.
  // We observe hydration by waiting for the recent-projects query refetch to
  // render a card for `tmpPath` — the Home route renders a <li> per recent
  // project and only renders any <li> when the list is non-empty.
  await page.waitForFunction(
    (expected: string) => {
      const cards = Array.from(document.querySelectorAll('li')).map(
        (li) => li.textContent ?? '',
      );
      return cards.some((text) => text.includes(expected));
    },
    tmpPath,
    { timeout: 10_000 },
  );

  return { electronApp, page, tmpPath, tmpRoot, userDataDir };
}

async function gotoAgents(page: Page, name?: string): Promise<void> {
  const hash =
    name === undefined ? '#/agents' : `#/agents?name=${encodeURIComponent(name)}`;
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForFunction(
    () => window.location.hash.startsWith('#/agents'),
    undefined,
    { timeout: 5_000 },
  );
}

async function selectAgent(page: Page, name: string): Promise<void> {
  const nameRegex = new RegExp(`^${escapeRegExp(name)}\\b`);
  await page.getByRole('button', { name: nameRegex }).first().click();
  await page.waitForFunction(
    (expected) => window.location.hash.includes(`name=${encodeURIComponent(expected)}`),
    name,
    { timeout: 5_000 },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function teardown(launched: Launched | null): Promise<void> {
  if (launched === null) return;
  try {
    await launched.electronApp.close();
  } catch {
    // Ignore — process may already be gone if a test crashed it.
  }
  await rm(launched.tmpRoot, { recursive: true, force: true }).catch(() => {
    // Best-effort cleanup; tmpdir-backed.
  });
  await rm(launched.userDataDir, { recursive: true, force: true }).catch(() => {
    // Best-effort cleanup.
  });
}

test.describe('agent editor', () => {
  let launched: Launched | null = null;

  test.beforeEach(async () => {
    launched = await launchFresh();
  });

  test.afterEach(async () => {
    await teardown(launched);
    launched = null;
  });

  test('renders the full agent list from fixture project', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page } = launched;

    await gotoAgents(page);

    const expectedNames = [
      'implementer-with-agent',
      'lead-missing-agent',
      'malformed-yaml',
      'no-tier-orchestrator',
      'passthrough-note',
      'valid-lead',
    ];

    // Primary assertion: every fixture agent appears in the list.
    for (const name of expectedNames) {
      await expect(
        page
          .getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}\\b`) })
          .first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('shows yellow underline on tools line and inline warning for lead-missing-agent-tool', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page } = launched;

    await gotoAgents(page);
    await selectAgent(page, 'lead-missing-agent');

    // Primary assertion: the meta-panel Alert text contains the warning copy
    // produced by `validateTierConsistency` for `tier.lead-missing-agent-tool`.
    const alert = page.getByRole('alert').filter({
      hasText: /Lead agents should include the Agent tool/,
    });
    await expect(alert).toBeVisible({ timeout: 5_000 });

    // Secondary: the CM6 linter decorates a range with the warning class.
    // Diagnostic propagation is delayed by the 250ms linter debounce.
    const warningRange = page.locator('.cm-lintRange-warning').first();
    await expect(warningRange).toBeVisible({ timeout: 5_000 });
  });

  test('passthrough key custom-note survives body-only edit via save', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page, tmpPath } = launched;

    await gotoAgents(page);
    await selectAgent(page, 'passthrough-note');

    // Wait for both CM6 editors to mount (yaml pane + markdown body).
    await expect(page.locator('.cm-editor')).toHaveCount(2, { timeout: 5_000 });

    // Focus the body pane's editable region (the second `.cm-content`) and
    // append text at the document end.
    const bodyContent = page.locator('.cm-content').nth(1);
    await bodyContent.click();
    const jumpKey = process.platform === 'darwin' ? 'Meta+End' : 'Control+End';
    await page.keyboard.press(jumpKey);
    await page.keyboard.type(' (edited)');

    await expect(page.getByText('unsaved')).toBeVisible({ timeout: 5_000 });

    // Save via Ctrl/Cmd-S.
    const saveKey = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';
    await page.keyboard.press(saveKey);

    // Dirty indicator clears once the write mutation resolves.
    await expect(page.getByText('unsaved')).toHaveCount(0, { timeout: 5_000 });

    // Primary assertion: the on-disk file still contains the passthrough keys.
    const onDiskPath = join(tmpPath, AGENTS_DIR_RELATIVE, 'passthrough-note.md');
    const written = await readFile(onDiskPath, 'utf8');
    expect(written).toContain('custom-note: hello');
    expect(written).toContain('custom-array:');
  });

  test('conflict dialog appears within 2s when disk changes while dirty', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page, tmpPath } = launched;

    await gotoAgents(page);
    await selectAgent(page, 'valid-lead');

    await expect(page.locator('.cm-editor')).toHaveCount(2, { timeout: 5_000 });

    // Mark the editor dirty by typing into the YAML pane.
    const yamlContent = page.locator('.cm-content').first();
    await yamlContent.click();
    const jumpKey = process.platform === 'darwin' ? 'Meta+End' : 'Control+End';
    await page.keyboard.press(jumpKey);
    await page.keyboard.type(' ');

    await expect(page.getByText('unsaved')).toBeVisible({ timeout: 5_000 });

    // Overwrite the file on disk. The real chokidar watcher was registered by
    // the natural `projects:open` flow (see launchFresh); modifying the file
    // fires `fs:agentChanged` through main → renderer. `awaitWriteFinish` has
    // a 150ms stability threshold, so we allow up to 2s end-to-end.
    const targetPath = join(tmpPath, AGENTS_DIR_RELATIVE, 'valid-lead.md');
    const externalContent = [
      '---',
      'name: valid-lead',
      'description: EXTERNALLY CHANGED description for conflict detection.',
      'tools:',
      '  - Agent',
      '  - Read',
      '  - Grep',
      'x-tier: lead',
      '---',
      '',
      '# valid-lead',
      '',
      'Body rewritten by the e2e conflict test.',
      '',
    ].join('\n');
    await writeFile(targetPath, externalContent, 'utf8');

    // Primary assertion: the conflict dialog appears within 2s of the write.
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: 'External change detected' });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  });

  test('conflict dialog Load disk version replaces editor content with disk content', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page, tmpPath } = launched;

    await gotoAgents(page);
    await selectAgent(page, 'valid-lead');

    await expect(page.locator('.cm-editor')).toHaveCount(2, { timeout: 5_000 });

    // Dirty the YAML pane.
    const yamlContent = page.locator('.cm-content').first();
    await yamlContent.click();
    const jumpKey = process.platform === 'darwin' ? 'Meta+End' : 'Control+End';
    await page.keyboard.press(jumpKey);
    await page.keyboard.type(' ');
    await expect(page.getByText('unsaved')).toBeVisible({ timeout: 5_000 });

    // Disk change with a unique marker we can search for in the editor.
    const targetPath = join(tmpPath, AGENTS_DIR_RELATIVE, 'valid-lead.md');
    const diskMarker = 'disk-wins-conflict-marker';
    const externalContent = [
      '---',
      'name: valid-lead',
      `description: ${diskMarker}`,
      'tools:',
      '  - Agent',
      '  - Read',
      '  - Grep',
      'x-tier: lead',
      '---',
      '',
      '# valid-lead',
      '',
      'Disk-side body.',
      '',
    ].join('\n');
    await writeFile(targetPath, externalContent, 'utf8');

    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: 'External change detected' });
    await expect(dialog).toBeVisible({ timeout: 2_000 });

    // "Load disk version" is a 2-click confirm pattern.
    await dialog.getByRole('button', { name: 'Load disk version' }).click();
    await dialog
      .getByRole('button', { name: 'Confirm load disk version' })
      .click();

    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Primary assertion: the YAML pane now reflects disk content.
    await expect(page.locator('.cm-editor').first()).toContainText(diskMarker, {
      timeout: 5_000,
    });
  });

  test('NewAgentDialog creates file on disk and navigates to it', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page, tmpPath } = launched;

    await gotoAgents(page);

    // Open the "New" dialog.
    await page.getByRole('button', { name: /^New$/ }).click();

    const createDialog = page.getByRole('dialog').filter({ hasText: 'New agent' });
    await expect(createDialog).toBeVisible({ timeout: 5_000 });

    await createDialog.getByLabel('Name').fill('brand-new');
    await createDialog.getByLabel('Description').fill('fresh');
    await createDialog.getByRole('button', { name: 'Create agent' }).click();

    // Primary assertion: the file exists on disk at the expected path.
    const createdPath = join(tmpPath, AGENTS_DIR_RELATIVE, 'brand-new.md');
    await expect
      .poll(() => existsSync(createdPath), { timeout: 5_000 })
      .toBe(true);

    // Secondary: URL hash reflects navigation to the newly-created agent.
    await page.waitForFunction(
      () => window.location.hash.includes('name=brand-new'),
      undefined,
      { timeout: 5_000 },
    );
    expect(page.url()).toContain('name=brand-new');
  });

  test('DeleteAgentDialog removes file from disk and from list', async () => {
    if (launched === null) throw new Error('launched is null');
    const { page, tmpPath } = launched;

    await gotoAgents(page);

    // Create `brand-new` first so this test is independent of others.
    await page.getByRole('button', { name: /^New$/ }).click();
    const createDialog = page.getByRole('dialog').filter({ hasText: 'New agent' });
    await expect(createDialog).toBeVisible({ timeout: 5_000 });
    await createDialog.getByLabel('Name').fill('brand-new');
    await createDialog.getByLabel('Description').fill('fresh');
    await createDialog.getByRole('button', { name: 'Create agent' }).click();

    const createdPath = join(tmpPath, AGENTS_DIR_RELATIVE, 'brand-new.md');
    await expect
      .poll(() => existsSync(createdPath), { timeout: 5_000 })
      .toBe(true);

    // Make sure the create dialog is fully gone before clicking Delete so the
    // Delete button in the header isn't obscured.
    await expect(createDialog).toBeHidden({ timeout: 5_000 });

    // Confirm the newly-created agent is now selected so the Delete button
    // refers to it.
    await page.waitForFunction(
      () => window.location.hash.includes('name=brand-new'),
      undefined,
      { timeout: 5_000 },
    );

    await page.getByRole('button', { name: /^Delete$/ }).click();
    const deleteDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Delete agent?' });
    await expect(deleteDialog).toBeVisible({ timeout: 5_000 });

    await deleteDialog.getByRole('button', { name: 'Delete agent' }).click();

    // Primary assertion: the file is removed from disk.
    await expect
      .poll(() => existsSync(createdPath), { timeout: 5_000 })
      .toBe(false);

    // Secondary: filesystem-level listing confirms removal.
    const entries = await readdir(join(tmpPath, AGENTS_DIR_RELATIVE));
    expect(entries).not.toContain('brand-new.md');

    // Tertiary: the list no longer renders the button for the deleted agent.
    await expect(
      page.getByRole('button', { name: new RegExp(`^${escapeRegExp('brand-new')}\\b`) }),
    ).toHaveCount(0, { timeout: 5_000 });
  });
});
