/**
 * Playwright configuration for Electron end-to-end tests.
 *
 * Build strategy
 * --------------
 * Playwright drives the Electron app against the `electron-vite` build output
 * under `apps/desktop/out/` (main, preload, renderer). It never targets the
 * packaged/signed production build (per `.claude/rules/tests.md`).
 *
 * A `globalSetup` script runs `pnpm --filter @agentic-dev-app/desktop exec
 * electron-vite build` once per test run to ensure `out/main/index.js`,
 * `out/preload/index.mjs`, and `out/renderer/index.html` all exist and are
 * current. The individual spec files then launch Electron via
 * `_electron.launch({ args: [<path to out/main/index.js>] })` and talk to the
 * freshly-launched instance. No dev server is required; no `electron .` CLI
 * is invoked.
 *
 * Each test file gets its own fresh copy of `tests/fixtures/project-basic/`
 * under an `os.tmpdir()` prefix; per-test cleanup runs in `afterEach` so state
 * never leaks between tests.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  globalSetup: './tests/e2e/global-setup.ts',
});
