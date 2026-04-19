---
description: Execute a planned task through the full agent tree (orchestrator → domain leads → deep-review → PR reviewer). Requires a task file. Soft-prompts /post-fix at completion.
argumentHint: <task-name>
---

You are running **Flow 3 — Implementation** (see `.claude/flows.md`).

## Pre-flight

1. Read `.claude/tasks/<name>.md` where name is `$ARGUMENTS`. If absent, STOP with `[MISSING-TASK]` — user should run `/task-plan` first.
2. Read `.claude/contracts/<name>.md` if the task file says `contract: <path>`.
3. Check the task file's `status` field:
   - `planned` → proceed.
   - `in-progress` → ask the user if this is a continuation of a prior session; if yes, expect a SESSION HANDOFF in the conversation context.
   - `blocked` / `closed` → STOP.

## Steps

1. Invoke `/branch-sync` as the first step (no-op if branch is current).
2. Invoke `orchestrator` with the task file path + contract path.
3. Orchestrator sequences `lead-shared → lead-main → lead-renderer → lead-qa → lead-infra`, skipping leads the task file marks `skip: true`.
4. Orchestrator invokes `lead-deep-review` after `lead-qa` COMPLETE.
5. Orchestrator invokes `cross-pr-reviewer` last.
6. Orchestrator aggregates LEAD REPORTs and surfaces the final summary.

## Hard Gates

- Any lead BLOCKED → STOP. Surface the `[BLOCKED]` reason to the user.
- Any `[ARCHITECTURAL]` question → STOP. Options must be resolved before proceeding.
- Deep-review BLOCKER findings → STOP. The task is not complete.

## Soft Gate

On full completion, soft-prompt:

```
TASK IMPLEMENTED: <task_id>
Files changed: <count>
Verification: <summary>
Next: run `/post-fix` to commit + push + PR.
```

Do NOT invoke `/post-fix` automatically. User opts in.
