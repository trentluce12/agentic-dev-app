import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { agentFrontmatterSchema, validateTierConsistency } from '@agentic-dev-app/schemas';
import type { AgentFrontmatter, AgentValidationIssue } from '@agentic-dev-app/schemas';
import { EditorView } from '@codemirror/view';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse as parseYaml } from 'yaml';
import type { AgentFile } from '../../../../shared/ipc.ts';
import { useAgentEditorStore } from '../../stores/agentEditorStore.ts';
import { useProjectStore } from '../../stores/projectStore.ts';
import { AgentEditorSplit } from './AgentEditorSplit.tsx';
import { AgentList } from './AgentList.tsx';
import { AgentMetaPanel } from './AgentMetaPanel.tsx';
import { ConflictResolutionDialog } from './ConflictResolutionDialog.tsx';
import { DeleteAgentDialog } from './DeleteAgentDialog.tsx';
import { DiagnosticsList } from './DiagnosticsList.tsx';
import { buildZodLintSource } from './codemirror/zodLinter.ts';
import { useAgentFile, useSelfWriteSuppressor } from './hooks/useAgentFile.ts';

export function AgentEditorPage() {
  const project = useProjectStore((s) => s.current);
  const projectPath = project?.path ?? null;

  const search = useSearch({ strict: false });
  const selectedName =
    'name' in search && typeof search.name === 'string' && search.name.length > 0
      ? search.name
      : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agentFile, isLoading, error, writeMutation } = useAgentFile(
    projectPath,
    selectedName,
  );

  const draftYaml = useAgentEditorStore((s) => s.draftYaml);
  const draftBody = useAgentEditorStore((s) => s.draftBody);
  const dirty = useAgentEditorStore((s) => s.dirty);
  const conflict = useAgentEditorStore((s) => s.conflict);
  const setDraftYaml = useAgentEditorStore((s) => s.setDraftYaml);
  const setDraftBody = useAgentEditorStore((s) => s.setDraftBody);
  const resetStore = useAgentEditorStore((s) => s.reset);
  const openConflict = useAgentEditorStore((s) => s.openConflict);
  const closeConflict = useAgentEditorStore((s) => s.closeConflict);

  const yamlViewRef = useRef<EditorView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localIssues, setLocalIssues] = useState<AgentValidationIssue[]>([]);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const selfWriteSuppressor = useSelfWriteSuppressor();

  // Reset store when the selected agent changes.
  useEffect(() => {
    resetStore();
    setLocalIssues([]);
    setRemovedNotice(null);
  }, [projectPath, selectedName, resetStore]);

  // Mirror agentFile.rawFrontmatter + agentFile.body into Zustand when loaded
  // (only if no draft has been typed).
  const loadedRawFrontmatter = agentFile?.rawFrontmatter ?? '';
  const loadedBody = agentFile?.body ?? '';
  useEffect(() => {
    if (agentFile === undefined) return;
    const store = useAgentEditorStore.getState();
    if (store.draftYaml === null && store.draftBody === null) {
      useAgentEditorStore.setState({
        draftYaml: loadedRawFrontmatter,
        draftBody: loadedBody,
        dirty: false,
      });
    }
  }, [agentFile, loadedRawFrontmatter, loadedBody]);

  const yamlText = draftYaml ?? loadedRawFrontmatter;
  const bodyText = draftBody ?? loadedBody;

  // Live-parse YAML for diagnostics. Covers both the file-level issues from
  // the last server round-trip AND issues from typing.
  const parsedIssues = useMemo<AgentValidationIssue[]>(() => {
    if (agentFile === undefined) return [];
    if (draftYaml === null && localIssues.length === 0) {
      return agentFile.issues;
    }
    try {
      const reparsed = reparseFromYaml(yamlText);
      return reparsed.issues;
    } catch (err) {
      return [
        {
          level: 'error',
          code: 'yaml.parse',
          message: err instanceof Error ? err.message : String(err),
          path: '',
        },
      ];
    }
  }, [agentFile, draftYaml, yamlText, localIssues]);

  const allIssues = useMemo<AgentValidationIssue[]>(
    () => [...parsedIssues, ...localIssues],
    [parsedIssues, localIssues],
  );

  const lintSource = useMemo(
    () =>
      buildZodLintSource({
        getIssues: () => allIssues,
        getRawFrontmatter: () => yamlText,
      }),
    [allIssues, yamlText],
  );

  // Live-parse frontmatter object for the meta panel.
  const parsedFrontmatter = useMemo<AgentFrontmatter | null>(() => {
    if (agentFile === undefined) return null;
    try {
      const reparsed = reparseFromYaml(yamlText);
      return reparsed.frontmatter;
    } catch {
      return agentFile.frontmatter;
    }
  }, [agentFile, yamlText]);

  const hasErrorIssues = allIssues.some((i) => i.level === 'error');

  const handleSave = useCallback(async () => {
    if (agentFile === undefined) return;
    if (projectPath === null || selectedName === null) return;

    let parsedYaml: unknown;
    try {
      parsedYaml = parseYaml(yamlText) ?? {};
    } catch (err) {
      setLocalIssues([
        {
          level: 'error',
          code: 'yaml.parse',
          message: err instanceof Error ? err.message : String(err),
          path: '',
        },
      ]);
      return;
    }

    const validated = agentFrontmatterSchema.safeParse(parsedYaml);
    if (!validated.success) {
      setLocalIssues(
        validated.error.issues.map((i) => ({
          level: 'error',
          code: i.code,
          message: i.message,
          path: i.path.join('.'),
        })),
      );
      return;
    }

    setLocalIssues([]);

    try {
      await writeMutation.mutateAsync({
        file: {
          path: agentFile.path,
          relativePath: agentFile.relativePath,
          frontmatter: validated.data,
          body: bodyText,
        },
      });
    } catch (err) {
      setLocalIssues([
        {
          level: 'error',
          code: 'write.failed',
          message: err instanceof Error ? err.message : String(err),
          path: '',
        },
      ]);
    }
  }, [agentFile, projectPath, selectedName, yamlText, bodyText, writeMutation]);

  const handleYamlChange = useCallback(
    (next: string) => {
      setDraftYaml(next);
    },
    [setDraftYaml],
  );

  const handleBodyChange = useCallback(
    (next: string) => {
      setDraftBody(next);
    },
    [setDraftBody],
  );

  const handleYamlRewrite = useCallback(
    (next: string) => {
      setDraftYaml(next);
    },
    [setDraftYaml],
  );

  const handleDiagnosticSelect = useCallback((line: number) => {
    const view = yamlViewRef.current;
    if (view === null) return;
    const totalLines = view.state.doc.lines;
    const safeLine = Math.min(Math.max(line, 1), totalLines);
    const target = view.state.doc.line(safeLine);
    view.dispatch({
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
      selection: { anchor: target.from },
    });
    view.focus();
  }, []);

  // FS event listener: invalidate queries + trigger conflict modal where needed.
  // Paths are opaque strings — renderer never parses or normalizes them.
  // Identity with "the currently-open agent" is determined by the agent file's
  // own `path` (produced by main) via string equality.
  const openAgentPath = agentFile?.path ?? null;
  useEffect(() => {
    if (projectPath === null) return;
    const unsubscribe = window.api.onEvent((event) => {
      if (event.channel === 'fs:agentAdded') {
        if (event.projectPath !== projectPath) return;
        queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
        return;
      }
      if (event.channel === 'fs:agentChanged') {
        if (event.projectPath !== projectPath) return;
        handleFsAgentChanged(event.agentPath).catch(() => {
          // Swallow — user will see the next event if it persists.
        });
        return;
      }
      if (event.channel === 'fs:agentRemoved') {
        if (event.projectPath !== projectPath) return;
        queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
        if (
          openAgentPath !== null &&
          selectedName !== null &&
          event.agentPath === openAgentPath
        ) {
          resetStore();
          setRemovedNotice(selectedName);
          navigate({ to: '/agents', search: {} });
        }
        return;
      }
    });

    async function handleFsAgentChanged(changedPath: string): Promise<void> {
      if (projectPath === null) return;
      // If it's not the currently-open agent, just invalidate the list.
      if (selectedName === null || openAgentPath === null || changedPath !== openAgentPath) {
        queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
        return;
      }
      // Same agent. Do a fresh read to compare mtimes.
      let fresh: AgentFile;
      try {
        fresh = await window.api.agents.read(projectPath, selectedName);
      } catch {
        queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
        return;
      }
      if (selfWriteSuppressor(changedPath, fresh.mtimeMs)) {
        // Self-write: don't invalidate, don't prompt.
        return;
      }
      const storeState = useAgentEditorStore.getState();
      if (storeState.dirty) {
        openConflict(fresh);
        return;
      }
      queryClient.setQueryData(['agents', projectPath, selectedName], fresh);
      queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
      // Seed drafts from disk so the editor shows the fresh content.
      useAgentEditorStore.setState({
        draftYaml: fresh.rawFrontmatter,
        draftBody: fresh.body,
        dirty: false,
      });
    }

    return () => {
      unsubscribe();
    };
  }, [
    projectPath,
    selectedName,
    openAgentPath,
    queryClient,
    navigate,
    resetStore,
    openConflict,
    selfWriteSuppressor,
  ]);

  const handleKeepMine = useCallback(() => {
    // Do nothing to disk state — the next save will overwrite.
  }, []);

  const handleLoadDisk = useCallback(() => {
    const { pendingDiskFile } = useAgentEditorStore.getState().conflict;
    if (pendingDiskFile === null) return;
    if (projectPath === null || selectedName === null) return;
    queryClient.setQueryData(
      ['agents', projectPath, selectedName],
      pendingDiskFile,
    );
    queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
    useAgentEditorStore.setState({
      draftYaml: pendingDiskFile.rawFrontmatter,
      draftBody: pendingDiskFile.body,
      dirty: false,
      conflict: { pendingDiskFile: null, open: false },
    });
  }, [projectPath, selectedName, queryClient]);

  const handleSelect = useCallback(
    (name: string) => {
      navigate({ to: '/agents', search: { name } });
    },
    [navigate],
  );

  if (projectPath === null) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm rounded-lg border border-dashed border-border/60 p-6 text-center">
          <div className="text-sm font-medium">No project open</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a project from Home to browse its agents.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[16rem_minmax(0,1fr)_18rem]">
      <div className="h-full border-r border-border/60">
        <AgentList
          projectPath={projectPath}
          selectedName={selectedName}
          onSelect={handleSelect}
        />
      </div>

      <div className="flex h-full min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          {selectedName === null ? (
            <div className="flex-1 text-sm text-muted-foreground">
              Select an agent on the left to start editing.
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{selectedName}</span>
                  {dirty && (
                    <span className="inline-flex items-center rounded-sm bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      unsaved
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {agentFile?.relativePath ?? `.claude/agents/${selectedName}.md`}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={agentFile === undefined}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    hasErrorIssues ||
                    !dirty ||
                    writeMutation.isPending ||
                    agentFile === undefined
                  }
                >
                  <Save className="size-3.5" />
                  {writeMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </header>

        {removedNotice !== null && (
          <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            <span>
              The agent <span className="font-mono">{removedNotice}</span> was removed on disk.
            </span>
          </div>
        )}

        {selectedName !== null && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            {isLoading && (
              <div className="px-2 py-4 text-xs text-muted-foreground">Loading agent…</div>
            )}
            {error !== null && error !== undefined && (
              <div className="px-2 py-4 text-xs text-destructive">
                Failed to load agent: {error instanceof Error ? error.message : String(error)}
              </div>
            )}
            {agentFile !== undefined && (
              <>
                <div className="h-64 shrink-0">
                  <AgentEditorSplit
                    kind="yaml"
                    ariaLabel="Agent frontmatter (YAML)"
                    value={yamlText}
                    onChange={handleYamlChange}
                    onSave={handleSave}
                    lintSource={lintSource}
                    onViewReady={(v) => {
                      yamlViewRef.current = v;
                    }}
                  />
                </div>
                <Separator />
                <div className="min-h-0 flex-1">
                  <AgentEditorSplit
                    kind="markdown"
                    ariaLabel="Agent body (Markdown)"
                    value={bodyText}
                    onChange={handleBodyChange}
                    onSave={handleSave}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex h-full flex-col border-l border-border/60">
        {agentFile !== undefined && parsedFrontmatter !== null ? (
          <>
            <AgentMetaPanel
              frontmatter={parsedFrontmatter}
              issues={allIssues}
              yamlText={yamlText}
              onYamlRewrite={handleYamlRewrite}
            />
            <Separator />
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="border-b border-border/60 px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Diagnostics
                </h3>
              </div>
              <DiagnosticsList
                issues={allIssues}
                rawFrontmatter={yamlText}
                onSelectLine={handleDiagnosticSelect}
              />
            </div>
          </>
        ) : (
          <div className="p-4 text-xs text-muted-foreground">
            Open an agent to see its metadata.
          </div>
        )}
      </div>

      {selectedName !== null && (
        <DeleteAgentDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          projectPath={projectPath}
          agentName={selectedName}
        />
      )}

      {selectedName !== null && (
        <ConflictResolutionDialog
          open={conflict.open}
          onOpenChange={(open) => {
            if (!open) closeConflict();
          }}
          agentName={selectedName}
          onKeepMine={handleKeepMine}
          onLoadDisk={handleLoadDisk}
        />
      )}
    </div>
  );
}

/**
 * Parse the YAML pane text directly into a frontmatter object and validation
 * issues. Mirrors parseAgentFile's logic but skips the synthetic-fence
 * reconstruction, which breaks when a user's YAML contains `---` inside a
 * multi-line block scalar.
 *
 * Throws if parseYaml fails (caller should catch + surface as a yaml.parse
 * diagnostic).
 */
function reparseFromYaml(
  yamlText: string,
): { frontmatter: AgentFrontmatter; issues: AgentValidationIssue[] } {
  const parsed = parseYaml(yamlText) ?? {};
  const result = agentFrontmatterSchema.safeParse(parsed);
  const issues: AgentValidationIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        level: 'error',
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      });
    }
    return {
      frontmatter: (parsed ?? {}) as AgentFrontmatter,
      issues,
    };
  }

  issues.push(...validateTierConsistency(result.data));
  return { frontmatter: result.data, issues };
}
