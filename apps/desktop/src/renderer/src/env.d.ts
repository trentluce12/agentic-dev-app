/// <reference types="vite/client" />

import type { IpcApi } from '../../shared/ipc.ts';

declare global {
  interface Window {
    api: IpcApi;
  }
}
