---
description: Propose structural improvements to `.claude/` based on learnings and task patterns. Invokes meta-improvement-lead → claude-config-updater. Nothing lands without approval.
argumentHint: <optional rationale or "audit">
---

You are running **Flow 6 — Folder Improvement** (see `.claude/flows.md`).

## Steps

1. Invoke `meta-improvement-lead` with the rationale: `$ARGUMENTS` (or "audit" for a periodic tune-up).
2. The lead reviews `.claude/tasks/learnings.md`, `.claude/tasks/task-history.md`, and the current `.claude/` structure.
3. The lead produces an IMPROVEMENT PROPOSAL.
4. For each proposed change, invoke `claude-config-updater` to draft the diff.
5. Present all diffs together to the user.
6. On approval, `claude-config-updater` applies the changes in one coherent pass.

## Triggers

- Run during `/task-closeout` when learnings flag structural gaps.
- Run quarterly as a scheduled audit.
- Run on user request.

## Output

```
CLAUDE IMPROVEMENT
Proposal sections: <list>
Diffs presented: <count>
Applied: <list or "none — awaiting approval">
```
