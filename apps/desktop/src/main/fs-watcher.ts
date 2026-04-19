import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';

export type FsChangeKind =
  | 'agentAdded'
  | 'agentChanged'
  | 'agentRemoved'
  | 'commandAdded'
  | 'commandChanged'
  | 'commandRemoved'
  | 'settingsChanged'
  | 'hookScriptChanged';

export interface FsChangeEvent {
  projectPath: string;
  kind: FsChangeKind;
  path: string;
}

export interface FsWatcherHandle {
  watch: (projectPath: string) => void;
  unwatch: (projectPath: string) => void;
  stop: () => Promise<void>;
  onChange: (listener: (event: FsChangeEvent) => void) => () => void;
}

/**
 * Watches `.claude/` in each registered project. Debounced 150ms.
 * Caller is responsible for translating events into cache invalidations.
 */
export function createFsWatcher(): FsWatcherHandle {
  const emitter = new EventEmitter();
  const watchers = new Map<string, FSWatcher>();

  function classify(relPath: string): FsChangeKind | null {
    const parts = relPath.replace(/\\/g, '/').split('/');
    if (parts[0] !== '.claude') return null;
    if (parts[1] === 'agents' && parts[2]?.endsWith('.md')) return 'agentChanged';
    if (parts[1] === 'commands' && parts[2]?.endsWith('.md')) return 'commandChanged';
    if (parts[1] === 'hooks') return 'hookScriptChanged';
    if (parts[1] === 'settings.json' || parts[1] === 'settings.local.json') {
      return 'settingsChanged';
    }
    return null;
  }

  return {
    watch(projectPath) {
      if (watchers.has(projectPath)) return;
      const claudeDir = join(projectPath, '.claude');
      const watcher = chokidar.watch(claudeDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      });
      watcher.on('all', (_evt, absPath) => {
        const rel = absPath.slice(projectPath.length + 1);
        const kind = classify(rel);
        if (!kind) return;
        emitter.emit('change', { projectPath, kind, path: absPath } satisfies FsChangeEvent);
      });
      watchers.set(projectPath, watcher);
    },
    unwatch(projectPath) {
      const watcher = watchers.get(projectPath);
      if (!watcher) return;
      void watcher.close();
      watchers.delete(projectPath);
    },
    async stop() {
      await Promise.all([...watchers.values()].map((w) => w.close()));
      watchers.clear();
    },
    onChange(listener) {
      emitter.on('change', listener);
      return () => emitter.off('change', listener);
    },
  };
}
