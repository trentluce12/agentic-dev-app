import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..', '..');

/**
 * Builds the Electron app via `electron-vite build` before the Playwright
 * suite starts. Produces `out/main/index.js`, `out/preload/index.mjs`, and
 * `out/renderer/index.html`.
 *
 * The build is a one-shot step — specs launch `_electron.launch()` against the
 * resulting bundles, never against the dev server.
 */
export default async function globalSetup(): Promise<void> {
  const mainOut = resolve(appRoot, 'out', 'main', 'index.js');
  const preloadOut = resolve(appRoot, 'out', 'preload', 'index.mjs');
  const rendererOut = resolve(appRoot, 'out', 'renderer', 'index.html');

  // Skip the build entirely when the caller has already produced output AND
  // sets `PLAYWRIGHT_SKIP_BUILD=1` (useful for rapid local iteration).
  if (
    process.env.PLAYWRIGHT_SKIP_BUILD === '1' &&
    existsSync(mainOut) &&
    existsSync(preloadOut) &&
    existsSync(rendererOut)
  ) {
    return;
  }

  await runElectronViteBuild();

  if (!existsSync(mainOut) || !existsSync(preloadOut) || !existsSync(rendererOut)) {
    throw new Error(
      `electron-vite build did not produce the expected output files. ` +
        `Expected:\n  ${mainOut}\n  ${preloadOut}\n  ${rendererOut}`,
    );
  }
}

function runElectronViteBuild(): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'pnpm.cmd' : 'pnpm';
    const args = [
      '--filter',
      '@agentic-dev-app/desktop',
      'exec',
      'electron-vite',
      'build',
    ];

    const child = spawn(command, args, {
      cwd: resolve(appRoot, '..', '..'),
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, NODE_ENV: 'production' },
    });

    child.on('error', (err) => {
      rejectPromise(new Error(`Failed to spawn electron-vite build: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`electron-vite build exited with code ${code}`));
      }
    });
  });
}
