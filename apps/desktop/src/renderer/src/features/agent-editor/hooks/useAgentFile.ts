import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { AgentFile } from '../../../../../shared/ipc.ts';
import { useAgentEditorStore } from '../../../stores/agentEditorStore.ts';

export type AgentFileWritePayload = Omit<AgentFile, 'issues' | 'mtimeMs' | 'rawFrontmatter'>;

export interface UseAgentFileResult {
  data: AgentFile | undefined;
  isLoading: boolean;
  error: unknown;
  writeMutation: UseMutationResult<AgentFile, Error, { file: AgentFileWritePayload }>;
}

const SELF_WRITE_WINDOW_MS = 500;

export function useAgentFile(
  projectPath: string | null,
  agentName: string | null,
): UseAgentFileResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['agents', projectPath, agentName],
    queryFn: () => {
      if (projectPath === null || agentName === null) {
        throw new Error('useAgentFile: projectPath or agentName is null but queryFn ran');
      }
      return window.api.agents.read(projectPath, agentName);
    },
    enabled: projectPath !== null && agentName !== null,
  });

  const writeMutation = useMutation<AgentFile, Error, { file: AgentFileWritePayload }>({
    mutationFn: async ({ file }) => {
      if (projectPath === null || agentName === null) {
        throw new Error('useAgentFile.writeMutation: projectPath or agentName is null');
      }
      return window.api.agents.write(projectPath, agentName, file);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['agents', projectPath, agentName], result);
      queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
      useAgentEditorStore.setState({
        draftYaml: result.rawFrontmatter,
        draftBody: result.body,
      });
      useAgentEditorStore.getState().markSaved(result.mtimeMs);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    writeMutation,
  };
}

export type SelfWriteSuppressor = (path: string, mtimeMs: number) => boolean;

/**
 * Returns a predicate that determines whether an fs:agentChanged event is a
 * self-inflicted write. Compares the incoming event's mtime to the mtime this
 * renderer last wrote. Within 500 ms AND equal mtimeMs -> suppress.
 *
 * `path` parameter is accepted for future scoping; today all renderer open
 * state is single-file so mtime is sufficient.
 */
export function useSelfWriteSuppressor(): SelfWriteSuppressor {
  return useCallback((_path, eventMtimeMs) => {
    const state = useAgentEditorStore.getState();
    const lastWritten = state.lastWrittenMtimeMs;
    if (lastWritten === null) return false;
    if (eventMtimeMs !== lastWritten) return false;
    const now = Date.now();
    return now - lastWritten <= SELF_WRITE_WINDOW_MS;
  }, []);
}
