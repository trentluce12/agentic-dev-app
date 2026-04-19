import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// Hard-coded HSL values mirror the tokens in
// `apps/desktop/src/renderer/src/styles/globals.css`. CM6 theme specs need
// literal CSS; we cannot read CSS variables at spec-build time.
export const theme: Extension = EditorView.theme(
  {
    '&': {
      // --background
      backgroundColor: 'transparent',
      // --foreground
      color: 'hsl(0 0% 98%)',
      fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
      fontSize: '13px',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
      caretColor: 'hsl(0 0% 98%)',
    },
    '.cm-gutters': {
      // --card
      backgroundColor: 'hsl(240 10% 5.5%)',
      // --muted-foreground
      color: 'hsl(240 5% 55%)',
      // --border
      borderRight: '1px solid hsl(240 4% 18%)',
    },
    '.cm-activeLine': {
      // --secondary at 0.5
      backgroundColor: 'hsla(240 4% 16% / 0.5)',
    },
    '.cm-activeLineGutter': {
      // --secondary at 0.7
      backgroundColor: 'hsla(240 4% 16% / 0.7)',
    },
    '.cm-cursor, .cm-dropCursor': {
      // --foreground
      borderLeftColor: 'hsl(0 0% 98%)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        // --primary at 0.3 (purple selection)
        backgroundColor: 'hsl(263 70% 62% / 0.3) !important',
      },
    '.cm-lintRange-error': {
      // --destructive (wavy)
      textDecoration: 'underline wavy hsl(0 63% 55%)',
      textDecorationSkipInk: 'none',
    },
    '.cm-lintRange-warning': {
      // warning yellow (not a token — CM6 convention)
      textDecoration: 'underline wavy hsl(40 95% 60%)',
      textDecorationSkipInk: 'none',
    },
    '.cm-lintRange-info': {
      // --tier-lead (info blue)
      textDecoration: 'underline wavy hsl(200 85% 55%)',
      textDecorationSkipInk: 'none',
    },
    '.cm-tooltip, .cm-tooltip-hover, .cm-tooltip-lint': {
      // --popover
      backgroundColor: 'hsl(240 10% 5%)',
      // --popover-foreground
      color: 'hsl(0 0% 98%)',
      // --border
      border: '1px solid hsl(240 4% 18%)',
      borderRadius: '6px',
      padding: '6px 8px',
      fontSize: '12px',
    },
    '.cm-diagnostic': {
      padding: '0',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid hsl(0 63% 55%)',
      paddingLeft: '6px',
    },
    '.cm-diagnostic-warning': {
      borderLeft: '3px solid hsl(40 95% 60%)',
      paddingLeft: '6px',
    },
    '.cm-diagnostic-info': {
      borderLeft: '3px solid hsl(200 85% 55%)',
      paddingLeft: '6px',
    },
    '.cm-foldPlaceholder': {
      // --muted / --muted-foreground
      backgroundColor: 'hsl(240 4% 12%)',
      color: 'hsl(240 5% 65%)',
      border: '1px solid hsl(240 4% 18%)',
      borderRadius: '4px',
      padding: '0 4px',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'hsl(263 70% 62% / 0.25)',
      outline: '1px solid hsl(263 70% 62% / 0.6)',
    },
  },
  { dark: true },
);
