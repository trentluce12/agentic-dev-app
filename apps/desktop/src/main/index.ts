import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, shell } from 'electron';
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

  const broadcastEvent = (channel: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ipc:event', { channel, ...(payload as Record<string, unknown>) });
    }
  };

  hookServer.onEvent((event) => broadcastEvent('hook:received', event));
  fsWatcher.onChange((event) => broadcastEvent('fs:changed', event));

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
