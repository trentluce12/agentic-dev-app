---
description: Re-run cross-pr-reviewer + lead-deep-review on a branch without a full /implement. Useful for review-only rounds after a revision.
argumentHint: <task-name | branch-name>
---

Run a review-only pass.

## Steps

1. If the arg looks like a task name, read `.claude/tasks/<name>.md`. If it looks like a branch, `git rev-parse --verify <branch>` to confirm.
2. Run `git diff <base>..HEAD --name-only` to enumerate changed files.
3. Invoke `lead-deep-review` with the task file / diff context.
4. Invoke `cross-pr-reviewer` with the same.
5. Aggregate findings. If either agent reports BLOCKERS, surface them prominently.

## Output

```
REVIEW RE-RUN: <task_id | branch>
Deep review findings: <counts by severity>
PR review findings: <counts by severity>
Blockers: <list or "none">
Next: fix blockers, re-run /task-review, OR proceed to /post-fix.
```
