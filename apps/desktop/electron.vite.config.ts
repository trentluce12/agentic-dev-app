import { resolve } from 'node:path';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
    plugins: [externalizeDepsPlugin()],
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
        routesDirectory: 'src/renderer/src/routes',
        generatedRouteTree: 'src/renderer/src/routeTree.gen.ts',
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
