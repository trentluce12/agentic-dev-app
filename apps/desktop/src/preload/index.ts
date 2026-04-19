import type { Settings } from '@agentic-dev-app/schemas';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentFile,
  AgentSummary,
  IpcApi,
  IpcEvent,
  ProjectSummary,
  SessionLaunchRequest,
  SessionSummary,
} from '../shared/ipc.ts';

const api: IpcApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  },
  projects: {
    open: () => ipcRenderer.invoke('projects:open') as Promise<ProjectSummary | null>,
    recent: () => ipcRenderer.invoke('projects:recent') as Promise<ProjectSummary[]>,
    scan: (path) => ipcRenderer.invoke('projects:scan', path) as Promise<ProjectSummary>,
  },
  agents: {
    list: (path) => ipcRenderer.invoke('agents:list', path) as Promise<AgentSummary[]>,
    read: (path, name) => ipcRenderer.invoke('agents:read', path, name) as Promise<AgentFile>,
    write: (path, name, file) =>
      ipcRenderer.invoke('agents:write', path, name, file) as Promise<AgentFile>,
    delete: (path, name) => ipcRenderer.invoke('agents:delete', path, name) as Promise<void>,
  },
  settings: {
    read: (path) => ipcRenderer.invoke('settings:read', path) as Promise<Settings>,
    write: (path, s) => ipcRenderer.invoke('settings:write', path, s) as Promise<Settings>,
  },
  sessions: {
    launch: (req: SessionLaunchRequest) =>
      ipcRenderer.invoke('sessions:launch', req) as Promise<SessionSummary>,
    cancel: (id) => ipcRenderer.invoke('sessions:cancel', id) as Promise<void>,
    list: (path) => ipcRenderer.invoke('sessions:list', path) as Promise<SessionSummary[]>,
  },
  onEvent: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, event: IpcEvent) => listener(event);
    ipcRenderer.on('ipc:event', handler);
    return () => ipcRenderer.off('ipc:event', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
