import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';
import {
  diagnosticsToCodeMirror,
  type AgentValidationIssue,
  type CodeMirrorDiagnostic,
} from '@agentic-dev-app/schemas';

export interface BuildZodLintSourceArgs {
  getIssues: () => AgentValidationIssue[];
  getRawFrontmatter: () => string;
}

export function buildZodLintSource(
  args: BuildZodLintSourceArgs,
): (view: EditorView) => readonly Diagnostic[] {
  return (view) => {
    const issues = args.getIssues();
    if (issues.length === 0) return [];
    const raw = args.getRawFrontmatter();
    const cmDiagnostics = diagnosticsToCodeMirror(issues, raw);
    const doc = view.state.doc;
    const diagnostics: Diagnostic[] = [];
    for (const d of cmDiagnostics) {
      const resolved = resolveRange(d, doc);
      if (resolved === null) continue;
      diagnostics.push({
        from: resolved.from,
        to: resolved.to,
        severity: d.severity,
        message: d.message,
        source: d.code,
      });
    }
    return diagnostics;
  };
}

interface ResolvedRange {
  from: number;
  to: number;
}

function resolveRange(
  d: CodeMirrorDiagnostic,
  doc: EditorView['state']['doc'],
): ResolvedRange | null {
  const totalLines = doc.lines;
  if (totalLines === 0) return null;
  // CodeMirrorDiagnostic.line is 1-indexed; state.doc.line(n) is also 1-indexed.
  // Passing n <= 0 or n > doc.lines throws — guard and fall back to line 1.
  const safeLineNumber = d.line >= 1 && d.line <= totalLines ? d.line : 1;
  const line = doc.line(safeLineNumber);
  if (d.col === undefined) {
    return { from: line.from, to: line.to };
  }
  // 1-indexed col → byte offset within the line. Clamp so an out-of-range col
  // never produces an invalid range.
  const colZeroBased = d.col - 1;
  const maxOffset = line.to - line.from;
  const offset = colZeroBased < 0 ? 0 : colZeroBased > maxOffset ? maxOffset : colZeroBased;
  return { from: line.from + offset, to: line.to };
}
