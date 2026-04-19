---
description: Update a task file mid-flight (scope change, new dependency, blocker found). Does NOT archive; use /task-closeout for that.
argumentHint: <task-name> [note]
---

Update an in-progress task file.

## Steps

1. Read `.claude/tasks/<name>.md`.
2. Prompt the user (or use the provided note) for what changed:
   - Scope expanded / reduced?
   - New dependency on another task?
   - Blocker discovered?
   - Acceptance criteria amended?
3. Produce a proposed diff to the task file. Present it for user approval. On approval, apply.
4. If the change introduces new IPC channels or cross-layer fields, re-invoke `meta-contract-writer` to update the feature contract.
5. Append a note to the task file's `Notes` section with the date and the change.

## Do Not

- Edit task files silently.
- Combine `/task-update` with `/task-closeout` — they serve different purposes; closeout is final.
- Edit `.claude/tasks/learnings.md` here — that's closeout's job.

## Output

```
TASK UPDATED: <task_id>
Change: <one-line description>
Contract amended: <yes | no>
Status: <unchanged>
```
