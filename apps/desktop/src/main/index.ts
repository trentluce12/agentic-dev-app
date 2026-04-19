import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, shell } from 'electron';
import type { IpcEvent } from '../shared/ipc.ts';
import { initDatabase } from './db/index.ts';
import { createFsWatcher } from './fs-watcher.ts';
import { startHookServer } from './hook-server.ts';
import { registerIpcHandlers } from './ipc/index.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0b0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

app.whenReady().then(async () => {
  const db = initDatabase();
  const hookServer = await startHookServer({ db });
  const fsWatcher = createFsWatcher();

  registerIpcHandlers({ db, hookServer, fsWatcher });

  await createWindow();

  const broadcastTyped = (event: IpcEvent): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ipc:event', event);
    }
  };

  hookServer.onEvent((payload) => {
    broadcastTyped({ channel: 'hook:received', sessionId: payload.session_id, payload });
  });

  fsWatcher.onChange((event) => {
    switch (event.kind) {
      case 'agentAdded':
        broadcastTyped({
          channel: 'fs:agentAdded',
          projectPath: event.projectPath,
          agentPath: event.path,
        });
        break;
      case 'agentChanged':
        broadcastTyped({
          channel: 'fs:agentChanged',
          projectPath: event.projectPath,
          agentPath: event.path,
        });
        break;
      case 'agentRemoved':
        broadcastTyped({
          channel: 'fs:agentRemoved',
          projectPath: event.projectPath,
          agentPath: event.path,
        });
        break;
      case 'commandAdded':
        broadcastTyped({
          channel: 'fs:commandAdded',
          projectPath: event.projectPath,
          commandPath: event.path,
        });
        break;
      case 'commandChanged':
        broadcastTyped({
          channel: 'fs:commandChanged',
          projectPath: event.projectPath,
          commandPath: event.path,
        });
        break;
      case 'commandRemoved':
        broadcastTyped({
          channel: 'fs:commandRemoved',
          projectPath: event.projectPath,
          commandPath: event.path,
        });
        break;
      case 'settingsChanged':
        broadcastTyped({
          channel: 'fs:settingsChanged',
          projectPath: event.projectPath,
          settingsPath: event.path,
        });
        break;
      case 'hookScriptChanged':
        broadcastTyped({
          channel: 'fs:hookScriptChanged',
          projectPath: event.projectPath,
          hookPath: event.path,
        });
        break;
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  app.on('before-quit', async () => {
    await hookServer.stop();
    await fsWatcher.stop();
    db.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
