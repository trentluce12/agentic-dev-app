import { create } from 'zustand';
import type { AgentFile } from '../../../shared/ipc.ts';

export interface AgentEditorConflict {
  pendingDiskFile: AgentFile | null;
  open: boolean;
}

export interface AgentEditorStoreState {
  draftYaml: string | null;
  draftBody: string | null;
  dirty: boolean;
  lastWrittenMtimeMs: number | null;
  conflict: AgentEditorConflict;
  setDraftYaml: (value: string) => void;
  setDraftBody: (value: string) => void;
  reset: () => void;
  markSaved: (mtimeMs: number) => void;
  openConflict: (diskFile: AgentFile) => void;
  closeConflict: () => void;
}

export const useAgentEditorStore = create<AgentEditorStoreState>()((set) => ({
  draftYaml: null,
  draftBody: null,
  dirty: false,
  lastWrittenMtimeMs: null,
  conflict: { pendingDiskFile: null, open: false },
  setDraftYaml: (value) => {
    set({ draftYaml: value, dirty: true });
  },
  setDraftBody: (value) => {
    set({ draftBody: value, dirty: true });
  },
  reset: () => {
    set({
      draftYaml: null,
      draftBody: null,
      dirty: false,
      conflict: { pendingDiskFile: null, open: false },
    });
  },
  markSaved: (mtimeMs) => {
    set({ dirty: false, lastWrittenMtimeMs: mtimeMs });
  },
  openConflict: (diskFile) => {
    set({ conflict: { pendingDiskFile: diskFile, open: true } });
  },
  closeConflict: () => {
    set({ conflict: { pendingDiskFile: null, open: false } });
  },
}));
