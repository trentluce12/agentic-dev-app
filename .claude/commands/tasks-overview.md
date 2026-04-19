---
description: List all tasks by status — planned, in-progress, blocked, closed — from `.claude/tasks/*.md`. Read-only; no writes.
---

List all tasks grouped by status.

## Steps

1. Glob `.claude/tasks/*.md`.
2. Read each file's frontmatter.
3. Group by `status`: `planned`, `in-progress`, `review`, `blocked`, `closed`.
4. For each task, include: task_id, title, created date, owner, PR (if any).

## Output

```
TASKS OVERVIEW

## Planned (N)
- <task_id> — <title> (created <date>, owner <owner>)

## In progress (N)
- ...

## Review (N)
- ...

## Blocked (N)
- <task_id> — <title> — blocker: <one-line>

## Closed (N, last 10)
- <task_id> — <title> (closed <date>, PR <link>)
```
