import { cn } from '@/lib/utils';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { buildExtensions } from './codemirror/buildExtensions.ts';
import type { buildZodLintSource } from './codemirror/zodLinter.ts';

export interface AgentEditorSplitProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  kind: 'yaml' | 'markdown';
  ariaLabel: string;
  lintSource?: ReturnType<typeof buildZodLintSource>;
  className?: string;
  onViewReady?: (view: EditorView | null) => void;
}

export function AgentEditorSplit({
  value,
  onChange,
  onSave,
  kind,
  ariaLabel,
  lintSource,
  className,
  onViewReady,
}: AgentEditorSplitProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const lintSourceRef = useRef<typeof lintSource>(lintSource);
  const onViewReadyRef = useRef(onViewReady);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    lintSourceRef.current = lintSource;
  }, [lintSource]);

  useEffect(() => {
    onViewReadyRef.current = onViewReady;
  }, [onViewReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const extensions = buildExtensions({
      kind,
      onChange: (doc) => onChangeRef.current(doc),
      onSave: () => onSaveRef.current(),
      lintSource: (view) => {
        const fn = lintSourceRef.current;
        return fn === undefined ? [] : fn(view);
      },
    });

    const state = EditorState.create({ doc: initialValueRef.current, extensions });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    onViewReadyRef.current?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
      onViewReadyRef.current?.(null);
    };
  }, [kind]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      className={cn(
        'h-full w-full overflow-hidden rounded-md border border-border/60 bg-card/30',
        className,
      )}
    />
  );
}
