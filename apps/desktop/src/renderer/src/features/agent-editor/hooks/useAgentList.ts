import { useQuery } from '@tanstack/react-query';
import type { AgentSummary } from '../../../../../shared/ipc.ts';

export interface UseAgentListResult {
  data: AgentSummary[] | undefined;
  isLoading: boolean;
  error: unknown;
}

export function useAgentList(projectPath: string | null): UseAgentListResult {
  const query = useQuery({
    queryKey: ['agents', projectPath],
    queryFn: () => {
      if (projectPath === null) {
        throw new Error('useAgentList: projectPath is null but queryFn ran');
      }
      return window.api.agents.list(projectPath);
    },
    enabled: projectPath !== null,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
