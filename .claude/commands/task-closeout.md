---
description: Close a task — extract learnings, sync docs, archive the task file, optionally invoke /improve-claude. Run after the task's PR is merged (or explicitly decided done).
argumentHint: <task-name>
---

You are running **Flow 4 — Task Closeout** (see `.claude/flows.md`).

## Pre-flight

1. Read `.claude/tasks/<name>.md` where name is `$ARGUMENTS`.
2. Verify `status` in the task file is `in-progress` or `review`. If `closed`, STOP — already closed.
3. Read the task's feature contract if one exists.
4. Read all LEAD REPORTs from the `/implement` run (they may be in the session context or in the task file's notes).

## Steps

1. **Extract learnings.** For every roadblock, non-obvious decision, or surprise during implementation, draft a new entry for `.claude/tasks/learnings.md`:

   ```yaml
   - task: <task_id>
     date: <YYYY-MM-DD>
     agent: <where it was hit>
     pitfall: <one sentence>
     resolution: <how it was fixed>
     rule_updated: <path or "none">
   ```

   Append to `.claude/tasks/learnings.md` (you have permission to write THIS specific file as part of closeout — but ONLY append; never rewrite).

2. **Docs sync.** Invoke `cross-docs-sync` to update READMEs / JSDoc / `docs/` based on the task's changes.

3. **Improve Claude?** If any learnings flagged `rule_updated: none` but suggest a rule is missing, invoke `/improve-claude` with those learnings as input.

4. **Archive the task.** Update the task file's frontmatter: `status: closed`, add `closed: <YYYY-MM-DD>`, add `pr: <PR URL>`. (Future: move to `.claude/tasks/archive/`; for now, keep in place with closed status.)

5. **Update task-history.** Set the Closed column to the date and append the PR link to the task history row.

## Output

```
TASK CLOSED: <task_id>
Learnings extracted: <count>
Docs synced: <count of files>
Improvements proposed: <count>
Task file status: closed
History updated: yes
```
