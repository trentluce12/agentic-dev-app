import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { theme } from './theme.ts';

export type EditorPaneKind = 'yaml' | 'markdown';

export interface BuildExtensionsOptions {
  kind: EditorPaneKind;
  onChange: (doc: string) => void;
  onSave: () => void;
  lintSource?: (view: EditorView) => readonly Diagnostic[];
  readOnly?: boolean;
}

export function buildExtensions(opts: BuildExtensionsOptions): Extension {
  const language = opts.kind === 'yaml' ? yaml() : markdown();

  const readOnlyExtensions: Extension[] = opts.readOnly
    ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
    : [];

  const lintExtensions: Extension[] = opts.lintSource
    ? [linter(opts.lintSource, { delay: 250 })]
    : [];

  const saveKeymap = keymap.of([
    {
      key: 'Mod-s',
      preventDefault: true,
      run: () => {
        opts.onSave();
        return true;
      },
    },
  ]);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      opts.onChange(update.state.doc.toString());
    }
  });

  return [
    keymap.of(defaultKeymap),
    keymap.of(historyKeymap),
    keymap.of(searchKeymap),
    saveKeymap,
    history(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    bracketMatching(),
    indentOnInput(),
    foldGutter(),
    language,
    updateListener,
    ...readOnlyExtensions,
    ...lintExtensions,
    theme,
  ];
}
