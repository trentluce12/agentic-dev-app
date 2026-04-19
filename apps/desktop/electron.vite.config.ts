import { type Dirent, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Discover workspace package names by reading `<repoRoot>/packages/* /package.json`.
 *
 * Invariants:
 * - Position-independent: repoRoot is derived from this file's location via __dirname,
 *   never from process.cwd(). Running `electron-vite` from any directory works.
 * - Synchronous only: electron-vite loads this config synchronously; no top-level await.
 * - Fail-soft: a package without a readable package.json or missing `name` is skipped,
 *   not fatal — half-scaffolded packages shouldn't block the whole repo from loading.
 * - Scope-agnostic: returns whatever `name` fields exist; no prefix is hardcoded so
 *   newly-added workspace packages are picked up without editing this file.
 */
function discoverWorkspacePackageNames(): string[] {
  const repoRoot = resolve(__dirname, '..', '..');
  const packagesDir = resolve(repoRoot, 'packages');
  const names: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = resolve(packagesDir, entry.name, 'package.json');
    try {
      const raw = readFileSync(pkgJsonPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        'name' in parsed &&
        typeof (parsed as { name: unknown }).name === 'string'
      ) {
        names.push((parsed as { name: string }).name);
      }
    } catch {
      // skip packages without a readable/parsable package.json
    }
  }
  return names;
}

const workspacePackageNames = discoverWorkspacePackageNames();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageNames })],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
      },
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'keytar', 'fastify'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageNames })],
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [
      TanStackRouterVite({
        routesDirectory: resolve(__dirname, 'src/renderer/src/routes'),
        generatedRouteTree: resolve(__dirname, 'src/renderer/src/routeTree.gen.ts'),
      }),
      react(),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
        },
      },
    },
  },
});
