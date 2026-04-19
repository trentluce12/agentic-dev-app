import { create } from 'zustand';
import type { ProjectSummary } from '../../../shared/ipc.ts';

export interface ProjectStoreState {
  current: ProjectSummary | null;
  setCurrent: (project: ProjectSummary | null) => void;
}

export const useProjectStore = create<ProjectStoreState>()((set) => ({
  current: null,
  setCurrent: (project) => {
    set({ current: project });
  },
}));
