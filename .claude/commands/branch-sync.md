---
description: Merge `main` into the current working branch (or `dev-tl` if on a feature branch diverged from it). Called at the start of `/implement`; can be run manually.
---

Sync the current branch with upstream.

## Steps

1. Run `git status` — capture current branch.
2. Run `git fetch origin`.
3. Determine the merge base:
   - On `dev-tl` → merge `origin/main`.
   - On `feat/*` or `fix/*` → merge `origin/dev-tl` (or `origin/main` if the branch was cut from main).
4. Run the merge. On conflict:
   - Surface the conflict files to the user.
   - STOP. The user resolves conflicts; never resolve programmatically.
5. If the merge is clean, run `pnpm install` (new deps may have landed) and `pnpm typecheck`.
6. If typecheck fails after sync, STOP with `[BLOCKED] branch-sync broke typecheck`. Do not proceed with any downstream flow.

## Do Not

- Rebase when others might have the branch checked out.
- Force anything.
- Merge with `--strategy ours` / `--strategy theirs` to bypass conflicts.

## Output

```
BRANCH SYNCED
Branch: <branch>
Merged: <origin/main | origin/dev-tl>
Changes: <count of files>
pnpm install: <ran | skipped>
Typecheck: <pass | fail>
```
