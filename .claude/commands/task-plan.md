---
description: Create a task file for a new piece of work. Invokes monorepo-task-planner first; invokes meta-contract-writer if new cross-layer fields exist. Nothing ships from this command.
argumentHint: <one-line task intent>
---

You are running **Flow 2 — Task Planning** (see `.claude/flows.md`).

## Steps

1. Read `.claude/vision.md`, `.claude/flows.md`, `CLAUDE.md`.
2. Read `.claude/tasks/task-history.md` — know what exists.
3. Read `.claude/tasks/learnings.md` — know the pitfalls.
4. Invoke `monorepo-task-planner` with the user's intent: `$ARGUMENTS`.
5. Planner writes `.claude/tasks/<name>.md` and returns a PLANNER REPORT.
6. If `contract_needed: true` in the report, invoke `meta-contract-writer` to write `.claude/contracts/<name>.md`.
7. Append a row to `.claude/tasks/task-history.md` with task_id, created date, title, owner (`trentluce12`), status `planned`.
8. Surface the task file + contract paths to the user and STOP. The user reviews before `/implement`.

## Hard Stops

- If the planner classifies `design_first: true`, STOP and direct the user to `/frontend-design` first.
- If the user's intent is ambiguous (missing a concrete outcome), the planner should have returned `[SCOPE-QUESTION]`. Surface the question to the user and STOP.
- NEVER proceed to `/implement` inside `/task-plan`. The hard break between planning and implementation is the most valuable gate in the flow.

## Output

```
TASK PLANNED: <task_id>
File: .claude/tasks/<name>.md
Contract: .claude/contracts/<name>.md (or "none")
Classification: <domains list>
Next: user reviews the task file; run `/implement <task-name>` when ready.
```
